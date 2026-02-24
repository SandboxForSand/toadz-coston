const { ethers } = require("hardhat");

const STAKE_PROXY = "0xd973E756fCcB640108aAf17B3465a387802A6E49";
const POND_PROXY = "0x410c65DAb32709046B1BA63caBEB4d2824D9E902";

const STAKE_ABI = [
  "function positions(address) view returns (uint256 wflrStaked, uint256 pondStaked, uint256 earnedWflr, uint256 lockExpiry, uint256 lockMultiplier, uint256 rewardDebt, uint256 lastUpdateTime)",
  "function totalPondStaked() view returns (uint256)",
  "event Deposited(address indexed user, uint256 wflrAmount, uint256 pondAmount, uint256 lockDays, uint256 multiplier)",
  "event AddedToStake(address indexed user, uint256 wflrAdded, uint256 pondAdded, uint256 newTotal, uint256 lockMultiplier)",
  "event Restaked(address indexed user, uint256 newWflrStaked, uint256 pondBuyback, uint256 newLockDays)",
  "event Exited(address indexed user, uint256 wflrReturned, uint256 pondReturned)",
  "event LPTransferred(address indexed from, address indexed to, uint256 amount)"
];

const POND_ABI = [
  "function stakedPond(address) view returns (uint256)",
  "event PondStaked(address indexed user, uint256 amount)",
  "event PondUnstaked(address indexed user, uint256 amount)"
];

const DEFAULT_FROM_BLOCK = 0;
const DEFAULT_CHUNK = 50000;
const DEFAULT_LOOKBACK_BLOCKS = 10000;

function positiveInt(input, fallback) {
  const num = Number(input);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

async function collectUsersFromLogs(provider, iface, address, fromBlock, toBlock, chunkSize, eventTopics) {
  const users = new Set();
  let scanned = 0;
  let effectiveChunkSize = chunkSize;
  let chunkCount = 0;

  for (let start = fromBlock; start <= toBlock;) {
    const end = Math.min(start + effectiveChunkSize - 1, toBlock);
    let logs;
    try {
      logs = await provider.getLogs({
        address,
        fromBlock: start,
        toBlock: end,
        topics: [[...eventTopics]]
      });
    } catch (error) {
      const msg = error?.message || "";
      const match = msg.match(/maximum is set to (\d+)/i);
      if (match) {
        const maxSpan = Number(match[1]);
        if (Number.isFinite(maxSpan) && maxSpan > 0 && effectiveChunkSize > maxSpan) {
          effectiveChunkSize = maxSpan;
          console.log(`Reduced chunk size for ${address} to RPC max: ${effectiveChunkSize}`);
          continue;
        }
      }
      throw error;
    }

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      switch (parsed.name) {
        case "LPTransferred":
          users.add(parsed.args.from);
          users.add(parsed.args.to);
          break;
        case "Deposited":
        case "AddedToStake":
        case "Restaked":
        case "Exited":
        case "PondStaked":
        case "PondUnstaked":
          users.add(parsed.args.user);
          break;
        default:
          break;
      }
    }

    scanned += logs.length;
    chunkCount += 1;
    if (logs.length > 0 || chunkCount % 100 === 0 || end === toBlock) {
      console.log(`Scanned ${address} blocks ${start}-${end}: ${logs.length} logs (chunks=${chunkCount})`);
    }
    start = end + 1;
  }

  return { users, scanned };
}

async function main() {
  const provider = ethers.provider;
  const latestBlock = await provider.getBlockNumber();
  const defaultFrom = Math.max(1, latestBlock - DEFAULT_LOOKBACK_BLOCKS);
  const fromBlock = process.env.FROM_BLOCK
    ? positiveInt(process.env.FROM_BLOCK, DEFAULT_FROM_BLOCK)
    : defaultFrom;
  const toBlock = process.env.TO_BLOCK ? positiveInt(process.env.TO_BLOCK, latestBlock) : latestBlock;
  const chunkSize = positiveInt(process.env.BLOCK_CHUNK, DEFAULT_CHUNK);
  const maxUsers = process.env.MAX_USERS ? positiveInt(process.env.MAX_USERS, 0) : 0;

  if (fromBlock > toBlock) {
    throw new Error(`Invalid block range: FROM_BLOCK (${fromBlock}) > TO_BLOCK (${toBlock})`);
  }

  const manualUsers = (process.env.CHECK_USERS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => ethers.getAddress(v.toLowerCase()));

  const stake = await ethers.getContractAt(STAKE_ABI, STAKE_PROXY);
  const pond = await ethers.getContractAt(POND_ABI, POND_PROXY);

  const stakeIface = new ethers.Interface(STAKE_ABI);
  const pondIface = new ethers.Interface(POND_ABI);

  const stakeTopics = [
    stakeIface.getEvent("Deposited").topicHash,
    stakeIface.getEvent("AddedToStake").topicHash,
    stakeIface.getEvent("Restaked").topicHash,
    stakeIface.getEvent("Exited").topicHash,
    stakeIface.getEvent("LPTransferred").topicHash
  ];

  const pondTopics = [
    pondIface.getEvent("PondStaked").topicHash,
    pondIface.getEvent("PondUnstaked").topicHash
  ];

  console.log("Checking POND/ToadzStake consistency on Coston2");
  console.log("Stake proxy:", STAKE_PROXY);
  console.log("POND proxy:", POND_PROXY);
  console.log("Block range:", `${fromBlock} -> ${toBlock}`);
  console.log("Chunk size:", chunkSize);

  const [stakeResult, pondResult] = await Promise.all([
    collectUsersFromLogs(provider, stakeIface, STAKE_PROXY, fromBlock, toBlock, chunkSize, stakeTopics),
    collectUsersFromLogs(provider, pondIface, POND_PROXY, fromBlock, toBlock, chunkSize, pondTopics)
  ]);

  const userSet = new Set([...stakeResult.users, ...pondResult.users, ...manualUsers]);
  userSet.delete(ethers.ZeroAddress);

  let users = [...userSet];
  if (maxUsers > 0 && users.length > maxUsers) {
    users = users.slice(0, maxUsers);
  }

  console.log("Candidate users:", users.length);
  if (manualUsers.length > 0) {
    console.log("Manual users included:", manualUsers.length);
  }

  if (users.length === 0) {
    console.log("\nNo candidate users found in selected range.");
    console.log("Re-run with a wider FROM_BLOCK or pass CHECK_USERS=0xUser1,0xUser2");
    process.exitCode = 2;
    return;
  }

  let checked = 0;
  let activePositions = 0;
  const mismatches = [];
  let sumStakePond = 0n;
  let sumPondStaked = 0n;

  for (const user of users) {
    const [pos, pondStaked] = await Promise.all([
      stake.positions(user),
      pond.stakedPond(user)
    ]);

    if (pos.wflrStaked > 0n) {
      activePositions += 1;
    }

    sumStakePond += pos.pondStaked;
    sumPondStaked += pondStaked;
    checked += 1;

    if (pos.pondStaked !== pondStaked) {
      mismatches.push({
        user,
        stakePond: pos.pondStaked,
        pondStaked
      });
    }
  }

  const totalPondStaked = await stake.totalPondStaked();

  console.log("\n=== Summary ===");
  console.log("Logs scanned (stake):", stakeResult.scanned);
  console.log("Logs scanned (pond):", pondResult.scanned);
  console.log("Users checked:", checked);
  console.log("Active positions found:", activePositions);
  console.log("Mismatches found:", mismatches.length);
  console.log("Stake.totalPondStaked:", ethers.formatEther(totalPondStaked));
  console.log("Sum positions[].pondStaked:", ethers.formatEther(sumStakePond));
  console.log("Sum pond.stakedPond(users):", ethers.formatEther(sumPondStaked));

  if (mismatches.length > 0) {
    console.log("\n=== Mismatched Users ===");
    for (const row of mismatches) {
      console.log(
        `${row.user} | stake.pos.pondStaked=${ethers.formatEther(row.stakePond)} | pond.stakedPond=${ethers.formatEther(row.pondStaked)}`
      );
    }
    process.exitCode = 1;
  } else {
    console.log("\nNo user-level mismatches detected in scanned set.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

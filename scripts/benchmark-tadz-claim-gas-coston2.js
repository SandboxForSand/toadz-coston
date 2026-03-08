const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

function rangeBigInt(start, count) {
  const out = [];
  for (let i = 0n; i < count; i++) out.push(start + i);
  return out;
}

async function main() {
  if (network.name !== "coston2") {
    throw new Error("Run with --network coston2");
  }

  const [signer] = await ethers.getSigners();
  const stackPath = process.env.STACK_JSON || path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  if (!fs.existsSync(stackPath)) throw new Error(`Missing stack file: ${stackPath}`);
  const stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));

  const provider = ethers.provider;

  const claimer = await ethers.getContractAt(
    [
      "function claim(uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimPartial(uint256 amount, uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimed(address) view returns (uint256)",
      "function getAutoAllocation(address user) view returns (uint256)",
      "function getClaimable(address user, uint256 totalAllocation, bytes32[] calldata proof) view returns (uint256)",
      "function availableTokens() view returns (uint256)",
      "function depositTokenIds(uint256[] calldata _tokenIds) external"
    ],
    stack.claimer,
    signer
  );

  const tadz = await ethers.getContractAt(
    [
      "function nextTokenId() view returns (uint256)",
      "function mintBatch(address to, uint256 count) external returns (uint256 firstId, uint256 lastId)"
    ],
    stack.tadzCollection,
    signer
  );

  const ogCollection = await ethers.getContractAt(
    [
      "function nextTokenId() view returns (uint256)",
      "function mintBatch(address to, uint256 count) external returns (uint256 firstId, uint256 lastId)",
      "function setApprovalForAll(address operator, bool approved) external",
      "function isApprovedForAll(address owner, address operator) view returns (bool)"
    ],
    stack.ogCollection,
    signer
  );

  const ogVault = await ethers.getContractAt(
    [
      "function lockBatch(address collection, uint256[] calldata tokenIds) external",
      "function getOGCount(address user) view returns (uint256)"
    ],
    stack.ogVault,
    signer
  );

  console.log("Signer:", signer.address);
  console.log("Claimer:", stack.claimer);

  const targetAvailableTokens = 200n;
  let available = await claimer.availableTokens();
  if (available < targetAvailableTokens) {
    let toSeed = targetAvailableTokens - available;
    console.log(`Seeding claimer inventory: +${toSeed.toString()} tokens`);

    while (toSeed > 0n) {
      const chunk = toSeed > 50n ? 50n : toSeed;
      const first = await tadz.nextTokenId();
      const mintTx = await tadz.mintBatch(stack.claimer, Number(chunk));
      await mintTx.wait();

      const ids = rangeBigInt(first, chunk);
      const depositTx = await claimer.depositTokenIds(ids);
      await depositTx.wait();

      toSeed -= chunk;
      console.log(`  seeded chunk ${chunk.toString()} (remaining ${toSeed.toString()})`);
    }
  }

  let claimable = await claimer.getClaimable(signer.address, 0, []);
  const targetClaimable = 120n;
  if (claimable < targetClaimable) {
    const deficit = targetClaimable - claimable;
    const neededOg = (deficit + 2n) / 3n;
    console.log(`Creating claimable allocation: need +${deficit.toString()} claimable (mint/lock ${neededOg.toString()} OG)`);

    let toMintOg = neededOg;
    const mintedIds = [];
    while (toMintOg > 0n) {
      const chunk = toMintOg > 25n ? 25n : toMintOg;
      const first = await ogCollection.nextTokenId();
      const mintTx = await ogCollection.mintBatch(signer.address, Number(chunk));
      await mintTx.wait();
      mintedIds.push(...rangeBigInt(first, chunk));
      toMintOg -= chunk;
      console.log(`  minted OG chunk ${chunk.toString()} (remaining ${toMintOg.toString()})`);
    }

    const approved = await ogCollection.isApprovedForAll(signer.address, stack.ogVault);
    if (!approved) {
      const approveTx = await ogCollection.setApprovalForAll(stack.ogVault, true);
      await approveTx.wait();
      console.log("  approved OGVault for OG collection");
    }

    for (let i = 0; i < mintedIds.length; i += 20) {
      const batch = mintedIds.slice(i, i + 20);
      const lockTx = await ogVault.lockBatch(stack.ogCollection, batch);
      await lockTx.wait();
      console.log(`  locked OG batch size ${batch.length}`);
    }
  }

  const latest = await provider.getBlock("latest");
  const blockGasLimit = latest?.gasLimit ? BigInt(latest.gasLimit.toString()) : 0n;

  const claimed = await claimer.claimed(signer.address);
  const autoAlloc = await claimer.getAutoAllocation(signer.address);
  claimable = await claimer.getClaimable(signer.address, 0, []);
  available = await claimer.availableTokens();
  const ogCount = await ogVault.getOGCount(signer.address);

  console.log("\nCurrent state:");
  console.log("  OG locked:", ogCount.toString());
  console.log("  Auto allocation:", autoAlloc.toString());
  console.log("  Claimed:", claimed.toString());
  console.log("  Claimable:", claimable.toString());
  console.log("  Claimer available tokens:", available.toString());
  console.log("  Block gas limit:", blockGasLimit.toString());

  const maxSample = Number(claimable > 120n ? 120n : claimable);
  const samples = [1, 5, 10, 20, 40, 60, 80, 100, 120].filter((n) => n <= maxSample);
  const estimates = [];

  console.log("\nGas estimates for claimPartial(amount):");
  for (const amount of samples) {
    try {
      const gas = await claimer.claimPartial.estimateGas(BigInt(amount), 0, []);
      estimates.push({ amount, gas: Number(gas.toString()) });
      console.log(`  amount=${amount}: gas=${gas.toString()}`);
    } catch (err) {
      console.log(`  amount=${amount}: estimate failed (${err?.shortMessage || err?.message || "unknown"})`);
    }
  }

  try {
    const fullGas = await claimer.claim.estimateGas(0, []);
    console.log(`\nGas estimate for claim(all): ${fullGas.toString()} (for current claimable=${claimable.toString()})`);
  } catch (err) {
    console.log(`\nclaim(all) estimate failed: ${err?.shortMessage || err?.message || "unknown"}`);
  }

  if (estimates.length < 2) {
    console.log("\nNot enough successful estimates to project 10k/50k.");
    return;
  }

  const a = estimates[0];
  const b = estimates[estimates.length - 1];
  const perToken = (b.gas - a.gas) / (b.amount - a.amount);
  const base = a.gas - perToken * a.amount;

  const projected10k = Math.round(base + perToken * 10000);
  const projected50k = Math.round(base + perToken * 50000);
  const usableGas = Number((blockGasLimit * 90n) / 100n);
  const maxSingleTx = Math.max(0, Math.floor((usableGas - base) / perToken));

  console.log("\nProjection (linear from live estimates):");
  console.log(`  approx base gas: ${Math.round(base)}`);
  console.log(`  approx gas per Tadz: ${perToken.toFixed(0)}`);
  console.log(`  projected gas for 10,000 in one tx: ${projected10k}`);
  console.log(`  projected gas for 50,000 in one tx: ${projected50k}`);
  console.log(`  max per tx at ~90% block gas: ${maxSingleTx}`);
  console.log(`  10k one tx feasible: ${projected10k <= usableGas ? "YES" : "NO"}`);
  console.log(`  50k one tx feasible: ${projected50k <= usableGas ? "YES" : "NO"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


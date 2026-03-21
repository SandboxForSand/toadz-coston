require("dotenv").config();
const { ethers } = require("ethers");

const RPC_URL = process.env.FLARE_RPC_URL || "http://95.217.117.31:9650/ext/C/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const STAKE = "0xb3f5f283a2b1C08e111Bdfe96B9582E71af22358";
const WFLR = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";

const STAKE_ABI = [
  "function owner() view returns (address)",
  "function seedBalance() view returns (uint256)",
  "function approvedSeeders(address) view returns (bool)",
  "function seederBalances(address) view returns (uint256)",
  "function seedDelegationAsApproved(uint256) external",
  "function withdrawOwnSeed(uint256) external"
];

const WFLR_ABI = [
  "function deposit() payable",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
];

function usage() {
  console.log(`
Usage:
  node scripts/canary-seed-helper.js status
  node scripts/canary-seed-helper.js seed <amountFlr>
  node scripts/canary-seed-helper.js withdraw <amountFlr>

Env required:
  PRIVATE_KEY=<wallet private key>
Optional:
  FLARE_RPC_URL=http://95.217.117.31:9650/ext/C/rpc
`);
}

async function printStatus(wallet, stake, wflr, provider) {
  const [owner, approved, totalSeed, seederBal, wflrBal, flrBal] = await Promise.all([
    stake.owner(),
    stake.approvedSeeders(wallet.address),
    stake.seedBalance(),
    stake.seederBalances(wallet.address),
    wflr.balanceOf(wallet.address),
    provider.getBalance(wallet.address)
  ]);

  console.log(JSON.stringify({
    wallet: wallet.address,
    owner,
    approvedSeeder: approved,
    canarySeedBalanceFlr: ethers.formatEther(totalSeed),
    walletSeedBalanceFlr: ethers.formatEther(seederBal),
    walletWflrFlr: ethers.formatEther(wflrBal),
    walletNativeFlr: ethers.formatEther(flrBal)
  }, null, 2));
}

async function ensureWflr(wallet, wflr, needed) {
  const current = await wflr.balanceOf(wallet.address);
  if (current >= needed) return;

  const shortfall = needed - current;
  const nativeBal = await wallet.provider.getBalance(wallet.address);
  if (nativeBal < shortfall) {
    throw new Error(`Not enough native FLR to wrap. Need ${ethers.formatEther(shortfall)} more.`);
  }

  const tx = await wflr.deposit({ value: shortfall });
  await tx.wait();
  console.log("wrap tx:", tx.hash);
}

async function ensureApproval(wallet, wflr, needed) {
  const allowance = await wflr.allowance(wallet.address, STAKE);
  if (allowance >= needed) return;

  const tx = await wflr.approve(STAKE, needed);
  await tx.wait();
  console.log("approve tx:", tx.hash);
}

async function main() {
  if (!PRIVATE_KEY) {
    throw new Error("Set PRIVATE_KEY for the wallet that should test canary seeding.");
  }

  const action = process.argv[2];
  if (!action || action === "--help" || action === "-h") {
    usage();
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const stake = new ethers.Contract(STAKE, STAKE_ABI, wallet);
  const wflr = new ethers.Contract(WFLR, WFLR_ABI, wallet);

  if (action === "status") {
    await printStatus(wallet, stake, wflr, provider);
    return;
  }

  const rawAmount = process.argv[3];
  if (!rawAmount) {
    throw new Error("Amount is required for seed/withdraw.");
  }
  const amount = ethers.parseEther(rawAmount);

  const approved = await stake.approvedSeeders(wallet.address);
  if (!approved) {
    throw new Error(`Wallet ${wallet.address} is not approved on canary.`);
  }

  if (action === "seed") {
    await ensureWflr(wallet, wflr, amount);
    await ensureApproval(wallet, wflr, amount);
    const tx = await stake.seedDelegationAsApproved(amount);
    await tx.wait();
    console.log("seed tx:", tx.hash);
    await printStatus(wallet, stake, wflr, provider);
    return;
  }

  if (action === "withdraw") {
    const tx = await stake.withdrawOwnSeed(amount);
    await tx.wait();
    console.log("withdraw tx:", tx.hash);
    await printStatus(wallet, stake, wflr, provider);
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

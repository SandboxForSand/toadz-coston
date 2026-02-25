const { ethers } = require("hardhat");

const STAKE_PROXY = "0xef3722efB994bb7657616763ffD7e70f5E1b2999";
const POND_PROXY = "0x9c71462248801D430A7d06de502D2324abCE517E";

const STAKE_ABI = [
  "function totalWflrStaked() view returns (uint256)",
  "function totalWeightedShares() view returns (uint256)",
  "function totalEffectiveShares() view returns (uint256)",
  "function totalDeposited(address) view returns (uint256)",
  "function maxDeposit() view returns (uint256)",
  "function addToStake(uint256 wflrAmount, uint8 lockTier) external",
  "function emergencyWithdraw() external"
];

const POND_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function stakedPond(address) view returns (uint256)",
  "function burn(address from, uint256 amount) external"
];

async function expectRevert(label, fn, mustContain) {
  try {
    await fn();
    console.log(`${label}: FAIL (did not revert)`);
    return false;
  } catch (error) {
    const message = String(error?.message || error);
    if (mustContain && !message.includes(mustContain)) {
      console.log(`${label}: FAIL (reverted, but message mismatch)`);
      console.log("  got:", message);
      return false;
    }
    console.log(`${label}: PASS`);
    return true;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const user = deployer.address;

  const stake = await ethers.getContractAt(STAKE_ABI, STAKE_PROXY);
  const pond = await ethers.getContractAt(POND_ABI, POND_PROXY);

  console.log("Validating live security fixes on Flare mainnet");
  console.log("Signer:", user);

  let pass = true;

  const [totalWflrStaked, totalWeightedShares, totalEffectiveShares] = await Promise.all([
    stake.totalWflrStaked(),
    stake.totalWeightedShares(),
    stake.totalEffectiveShares()
  ]);
  console.log("Totals:", {
    totalWflrStaked: ethers.formatEther(totalWflrStaked),
    totalWeightedShares: ethers.formatEther(totalWeightedShares),
    totalEffectiveShares: ethers.formatEther(totalEffectiveShares)
  });

  pass = (await expectRevert(
    "emergencyWithdraw blocked when active stake exists",
    () => stake.emergencyWithdraw.staticCall(),
    "Active stake exists"
  )) && pass;

  const [maxDeposit, deposited] = await Promise.all([
    stake.maxDeposit(),
    stake.totalDeposited(user)
  ]);

  if (deposited < maxDeposit) {
    const overflowAmount = maxDeposit - deposited + 1n;
    pass = (await expectRevert(
      "addToStake enforces maxDeposit",
      () => stake.addToStake.staticCall(overflowAmount, 0),
      "Above maximum"
    )) && pass;
  } else {
    console.log("addToStake maxDeposit test: SKIPPED (user already at/above max)");
  }

  const [pondBalance, pondStaked] = await Promise.all([
    pond.balanceOf(user),
    pond.stakedPond(user)
  ]);

  if (pondBalance > 0n && pondStaked > 0n) {
    const available = pondBalance - pondStaked;
    if (available < pondBalance) {
      const burnAmount = available + 1n;
      pass = (await expectRevert(
        "POND owner burn cannot consume staked balance",
        () => pond.burn.staticCall(user, burnAmount),
        "Cannot burn staked POND"
      )) && pass;
    } else {
      console.log("POND burn staked-protection test: SKIPPED (no staked component in balance)");
    }
  } else {
    console.log("POND burn staked-protection test: SKIPPED (no POND balance or staked POND)");
  }

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

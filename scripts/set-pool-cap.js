const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const proxy = process.env.STAKE_PROXY || "0xd973E756fCcB640108aAf17B3465a387802A6E49";
  const capFlr = process.env.POOL_CAP_FLR || "50000";
  const targetCap = ethers.parseEther(capFlr);

  const stake = await ethers.getContractAt(
    ["function poolCap() view returns (uint256)", "function setPoolCap(uint256 _cap) external"],
    proxy
  );

  const before = await stake.poolCap();
  console.log("Signer:", deployer.address);
  console.log("Stake proxy:", proxy);
  console.log("Current poolCap:", ethers.formatEther(before), "FLR");
  console.log("Target poolCap:", capFlr, "FLR");

  if (before === targetCap) {
    console.log("No change needed.");
    return;
  }

  const tx = await stake.setPoolCap(targetCap);
  console.log("Tx hash:", tx.hash);
  await tx.wait();

  const after = await stake.poolCap();
  console.log("Updated poolCap:", ethers.formatEther(after), "FLR");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

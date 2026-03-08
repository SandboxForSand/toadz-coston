const { ethers, network } = require("hardhat");

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  const balance = await ethers.provider.getBalance(address);
  const feeData = await ethers.provider.getFeeData();
  const block = await ethers.provider.getBlock("latest");

  console.log("Network:", network.name);
  console.log("Address:", address);
  console.log("Balance (wei):", balance.toString());
  console.log("Balance (FLR):", ethers.formatEther(balance));
  console.log("Gas price (wei):", feeData.gasPrice?.toString() || "n/a");
  console.log("Gas price (gwei):", feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, "gwei") : "n/a");
  console.log("Latest block gas limit:", block?.gasLimit?.toString() || "n/a");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


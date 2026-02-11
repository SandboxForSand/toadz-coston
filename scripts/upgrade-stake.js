const { ethers, upgrades } = require("hardhat");

async function main() {
  const PROXY = "0xef3722efB994bb7657616763ffD7e70f5E1b2999";
  
  console.log("Upgrading ToadzStake...");
  const ToadzStake = await ethers.getContractFactory("ToadzStake");
  const upgraded = await upgrades.upgradeProxy(PROXY, ToadzStake);
  await upgraded.waitForDeployment();
  
  const implAddress = await upgrades.erc1967.getImplementationAddress(PROXY);
  console.log("New implementation:", implAddress);
  console.log("Proxy unchanged:", PROXY);
}

main().catch(console.error);

const { ethers, upgrades } = require("hardhat");

async function main() {
  const POND_PROXY = "0x9c71462248801D430A7d06de502D2324abCE517E";
  
  console.log("Upgrading POND...");
  
  const POND = await ethers.getContractFactory("POND");
  const upgraded = await upgrades.upgradeProxy(POND_PROXY, POND);
  
  console.log("POND upgraded, proxy:", upgraded.target);
  console.log("New implementation:", await upgrades.erc1967.getImplementationAddress(upgraded.target));
}

main().catch(console.error);

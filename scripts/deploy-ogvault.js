const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const OGVault = await ethers.getContractFactory("OGVault_TP");
  const proxy = await upgrades.deployProxy(OGVault, [deployer.address], {
    initializer: "initialize",
    kind: "transparent"
  });
  await proxy.waitForDeployment();
  
  const address = await proxy.getAddress();
  console.log("OGVault proxy:", address);
}

main().catch(console.error);

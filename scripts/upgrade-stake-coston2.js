const { ethers, upgrades } = require("hardhat");

const STAKE_PROXY = "0xd973E756fCcB640108aAf17B3465a387802A6E49";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading ToadzStake on Coston2...");
  console.log("Deployer:", deployer.address);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(STAKE_PROXY);
  console.log("Previous implementation:", beforeImpl);

  const Stake = await ethers.getContractFactory("ToadzStake");
  const upgraded = await upgrades.upgradeProxy(STAKE_PROXY, Stake);
  await upgraded.waitForDeployment();

  const afterImpl = await upgrades.erc1967.getImplementationAddress(STAKE_PROXY);
  console.log("New implementation:", afterImpl);
  console.log("Proxy unchanged:", STAKE_PROXY);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


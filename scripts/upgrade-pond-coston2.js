const { ethers, upgrades } = require("hardhat");

const POND_PROXY = "0x410c65DAb32709046B1BA63caBEB4d2824D9E902";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading POND on Coston2");
  console.log("Deployer:", deployer.address);
  console.log("Proxy:", POND_PROXY);

  const Pond = await ethers.getContractFactory("POND");
  await upgrades.forceImport(POND_PROXY, Pond, { kind: "transparent" });
  console.log("Proxy imported into manifest.");
  await upgrades.validateUpgrade(POND_PROXY, Pond);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(POND_PROXY);
  console.log("Previous implementation:", beforeImpl);

  const upgraded = await upgrades.upgradeProxy(POND_PROXY, Pond, {
    kind: "transparent",
    redeployImplementation: "always"
  });
  await upgraded.waitForDeployment();

  const afterImpl = await upgrades.erc1967.getImplementationAddress(POND_PROXY);
  console.log("New implementation:", afterImpl);
  console.log("Implementation changed:", beforeImpl.toLowerCase() !== afterImpl.toLowerCase());
  console.log("Proxy unchanged:", POND_PROXY);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

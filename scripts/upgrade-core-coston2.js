const { ethers, upgrades } = require("hardhat");

const TARGETS = {
  stake: {
    name: "ToadzStake",
    proxy: "0xd973E756fCcB640108aAf17B3465a387802A6E49",
    contract: "ToadzStake"
  },
  pond: {
    name: "POND",
    proxy: "0x410c65DAb32709046B1BA63caBEB4d2824D9E902",
    contract: "POND"
  }
};

async function upgradeTarget(target) {
  console.log(`\n=== Upgrading ${target.name} ===`);
  console.log("Proxy:", target.proxy);

  const Factory = await ethers.getContractFactory(target.contract);
  await upgrades.forceImport(target.proxy, Factory, { kind: "transparent" });
  console.log("Proxy imported into manifest.");
  await upgrades.validateUpgrade(target.proxy, Factory);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(target.proxy);
  console.log("Previous implementation:", beforeImpl);

  const upgraded = await upgrades.upgradeProxy(target.proxy, Factory, {
    kind: "transparent",
    redeployImplementation: "always"
  });
  await upgraded.waitForDeployment();

  const afterImpl = await upgrades.erc1967.getImplementationAddress(target.proxy);
  console.log("New implementation:", afterImpl);
  console.log("Implementation changed:", beforeImpl.toLowerCase() !== afterImpl.toLowerCase());
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const args = new Set(process.argv.slice(2));
  const upgradeStake = !args.has("--pond-only");
  const upgradePond = !args.has("--stake-only");

  console.log("Running core proxy upgrades on Coston2");
  console.log("Deployer:", deployer.address);
  console.log("Stake selected:", upgradeStake);
  console.log("POND selected:", upgradePond);

  if (!upgradeStake && !upgradePond) {
    throw new Error("Nothing selected. Remove flags or use one of --stake-only / --pond-only");
  }

  if (upgradeStake) {
    await upgradeTarget(TARGETS.stake);
  }
  if (upgradePond) {
    await upgradeTarget(TARGETS.pond);
  }

  console.log("\nAll selected upgrades completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

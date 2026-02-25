const { ethers, upgrades } = require("hardhat");

const TARGETS = [
  {
    name: "ToadzStake",
    proxy: "0xef3722efB994bb7657616763ffD7e70f5E1b2999",
    contract: "ToadzStake"
  },
  {
    name: "POND",
    proxy: "0x9c71462248801D430A7d06de502D2324abCE517E",
    contract: "POND"
  }
];

const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function upgrade(address proxy, address implementation) external",
  "function upgradeAndCall(address proxy, address implementation, bytes data) external"
];

async function deployImplementation(contractName) {
  const Factory = await ethers.getContractFactory(contractName);
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  return { factory: Factory, address: await impl.getAddress() };
}

async function upgradeOne(target, deployer) {
  console.log(`\n=== Manual upgrade: ${target.name} ===`);
  console.log("Proxy:", target.proxy);

  const adminAddress = await upgrades.erc1967.getAdminAddress(target.proxy);
  console.log("ProxyAdmin:", adminAddress);

  const proxyAdmin = await ethers.getContractAt(PROXY_ADMIN_ABI, adminAddress);
  const adminOwner = await proxyAdmin.owner();
  console.log("ProxyAdmin owner:", adminOwner);

  if (adminOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Deployer is not ProxyAdmin owner for ${target.name}`);
  }

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(target.proxy);
  console.log("Previous implementation:", beforeImpl);

  const { factory, address: newImpl } = await deployImplementation(target.contract);
  console.log("New implementation deployed:", newImpl);

  await upgrades.validateUpgrade(target.proxy, factory);

  let tx;
  try {
    tx = await proxyAdmin.upgrade(target.proxy, newImpl);
  } catch (error) {
    console.log("upgrade(...) unavailable, trying upgradeAndCall(..., 0x)");
    tx = await proxyAdmin.upgradeAndCall(target.proxy, newImpl, "0x");
  }
  await tx.wait();

  const afterImpl = await upgrades.erc1967.getImplementationAddress(target.proxy);
  console.log("Implementation after upgrade:", afterImpl);
  console.log("Implementation changed:", beforeImpl.toLowerCase() !== afterImpl.toLowerCase());
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const target = (process.env.UPGRADE_TARGET || "both").toLowerCase();
  const upgradeStake = target === "both" || target === "stake";
  const upgradePond = target === "both" || target === "pond";

  console.log("Running manual core proxy upgrades on Flare mainnet");
  console.log("Deployer:", deployer.address);
  console.log("Target:", target);
  console.log("Stake selected:", upgradeStake);
  console.log("POND selected:", upgradePond);

  if (!upgradeStake && !upgradePond) {
    throw new Error("Nothing selected. Set UPGRADE_TARGET to one of: both, stake, pond");
  }

  if (upgradeStake) {
    await upgradeOne(TARGETS[0], deployer);
  }
  if (upgradePond) {
    await upgradeOne(TARGETS[1], deployer);
  }

  console.log("\nManual upgrades complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

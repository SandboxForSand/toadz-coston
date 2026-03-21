const { ethers, upgrades, network } = require("hardhat");

const STAKE_PROXY = "0xb3f5f283a2b1C08e111Bdfe96B9582E71af22358";
const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function upgrade(address proxy, address implementation) external",
  "function upgradeAndCall(address proxy, address implementation, bytes data) external"
];

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading canary native seeding flow on Flare mainnet");
  console.log("Deployer:", deployer.address);
  console.log("Stake proxy:", STAKE_PROXY);

  const Stake = await ethers.getContractFactory("ToadzStake");
  await upgrades.forceImport(STAKE_PROXY, Stake, { kind: "transparent" });
  await upgrades.validateUpgrade(STAKE_PROXY, Stake);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(STAKE_PROXY);
  const adminAddress = await upgrades.erc1967.getAdminAddress(STAKE_PROXY);
  const proxyAdmin = await ethers.getContractAt(PROXY_ADMIN_ABI, adminAddress);
  const adminOwner = await proxyAdmin.owner();
  console.log("Previous implementation:", beforeImpl);
  console.log("ProxyAdmin:", adminAddress);
  console.log("ProxyAdmin owner:", adminOwner);

  if (adminOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is not canary ProxyAdmin owner");
  }

  const newImpl = await Stake.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("Deployed implementation:", newImplAddress);

  let upgradeTx;
  try {
    upgradeTx = await proxyAdmin.upgrade(STAKE_PROXY, newImplAddress);
  } catch (error) {
    console.log("upgrade(...) unavailable, trying upgradeAndCall(..., 0x)");
    upgradeTx = await proxyAdmin.upgradeAndCall(STAKE_PROXY, newImplAddress, "0x");
  }
  await upgradeTx.wait();
  console.log("upgrade tx:", upgradeTx.hash);

  const stake = await ethers.getContractAt("ToadzStake", STAKE_PROXY);

  const seedTx = await stake.seedDelegationNative({ value: 1n });
  await seedTx.wait();
  console.log("native seed tx:", seedTx.hash);

  const withdrawTx = await stake.withdrawSeedNative(1n);
  await withdrawTx.wait();
  console.log("native withdraw tx:", withdrawTx.hash);

  console.log(
    JSON.stringify(
      {
        owner: await stake.owner(),
        seedBalance: (await stake.seedBalance()).toString(),
        ownerApproved: await stake.approvedSeeders(deployer.address),
        ownerSeederBalance: (await stake.seederBalances(deployer.address)).toString()
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

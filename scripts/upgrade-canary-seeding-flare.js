const { ethers, upgrades, network } = require("hardhat");

const STAKE_PROXY = "0xb3f5f283a2b1C08e111Bdfe96B9582E71af22358";
const APPROVED_SEEDER = process.env.APPROVED_SEEDER || "0xF8b25E8017E0d83443DBD0f37289d3f849eEdF37";
const WFLR = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";
const TEST_SEED_WEI = BigInt(process.env.TEST_SEED_WEI || "1");
const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function upgrade(address proxy, address implementation) external",
  "function upgradeAndCall(address proxy, address implementation, bytes data) external"
];

const WFLR_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading canary seeding flow on Flare mainnet");
  console.log("Deployer:", deployer.address);
  console.log("Stake proxy:", STAKE_PROXY);
  console.log("Approved seeder:", APPROVED_SEEDER);

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

  const afterImpl = await upgrades.erc1967.getImplementationAddress(STAKE_PROXY);
  console.log("New implementation:", afterImpl);

  const stake = await ethers.getContractAt("ToadzStake", STAKE_PROXY);

  const initTx = await stake.initializeV8();
  await initTx.wait();
  console.log("initializeV8 tx:", initTx.hash);

  const alreadyApproved = await stake.approvedSeeders(APPROVED_SEEDER);
  if (!alreadyApproved) {
    const approveTx = await stake.setApprovedSeeder(APPROVED_SEEDER, true);
    await approveTx.wait();
    console.log("setApprovedSeeder tx:", approveTx.hash);
  } else {
    console.log("Approved seeder already set.");
  }

  if (TEST_SEED_WEI > 0n) {
    const wflr = await ethers.getContractAt(WFLR_ABI, WFLR);
    const balance = await wflr.balanceOf(deployer.address);
    if (balance < TEST_SEED_WEI) {
      console.log("Skipping smoke test: insufficient owner WFLR.");
    } else {
      const allowance = await wflr.allowance(deployer.address, STAKE_PROXY);
      if (allowance < TEST_SEED_WEI) {
        const allowanceTx = await wflr.approve(STAKE_PROXY, TEST_SEED_WEI);
        await allowanceTx.wait();
        console.log("approve tx:", allowanceTx.hash);
      }

      const seedTx = await stake.seedDelegation(TEST_SEED_WEI);
      await seedTx.wait();
      console.log("owner seedDelegation tx:", seedTx.hash);

      const withdrawTx = await stake.withdrawSeed(TEST_SEED_WEI);
      await withdrawTx.wait();
      console.log("owner withdrawSeed tx:", withdrawTx.hash);
    }
  }

  console.log(
    JSON.stringify(
      {
        owner: await stake.owner(),
        seedBalance: (await stake.seedBalance()).toString(),
        ownerApproved: await stake.approvedSeeders(deployer.address),
        ownerSeederBalance: (await stake.seederBalances(deployer.address)).toString(),
        approvedSeeder: APPROVED_SEEDER,
        approvedSeederAllowed: await stake.approvedSeeders(APPROVED_SEEDER),
        approvedSeederBalance: (await stake.seederBalances(APPROVED_SEEDER)).toString()
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

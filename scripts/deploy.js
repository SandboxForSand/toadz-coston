const { ethers, upgrades } = require("hardhat");

// Static addresses on Flare mainnet
const WFLR = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";
const FTSO_PROVIDER = "0x729589694a78FF2D8BACf75b7AC4389bd53ee533";
const REWARDS_MANAGER = "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B";
const DEPLOYER = "0x9bDB29529016a15754373B9D5B5116AB728E916e";

// OGVaultOracle (already deployed, not upgradeable)
const OG_VAULT_ORACLE = "0x5fADe844b333de50ef4876334d5432703D92D302"; // Update this

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "FLR");
  console.log("");

  const deployed = {};

  // ===== 1. POND =====
  console.log("1. Deploying POND...");
  const POND = await ethers.getContractFactory("POND");
  const pond = await upgrades.deployProxy(POND, [
    90, // drip duration days
    WFLR
  ], { kind: 'transparent' });
  await pond.waitForDeployment();
  deployed.pond = await pond.getAddress();
  console.log("   Proxy:", deployed.pond);
  console.log("   Implementation:", await upgrades.erc1967.getImplementationAddress(deployed.pond));
  console.log("");

  // ===== 2. Buffer =====
  console.log("2. Deploying Buffer...");
  const Buffer = await ethers.getContractFactory("Buffer");
  const buffer = await upgrades.deployProxy(Buffer, [
    WFLR,
    FTSO_PROVIDER
  ], { kind: 'transparent' });
  await buffer.waitForDeployment();
  deployed.buffer = await buffer.getAddress();
  console.log("   Proxy:", deployed.buffer);
  console.log("   Implementation:", await upgrades.erc1967.getImplementationAddress(deployed.buffer));
  console.log("");

  // ===== 3. BoostRegistry =====
  console.log("3. Deploying BoostRegistry...");
  const BoostRegistry = await ethers.getContractFactory("BoostRegistry");
  const boostRegistry = await upgrades.deployProxy(BoostRegistry, [
    OG_VAULT_ORACLE,
    deployer.address // updater
  ], { kind: 'transparent' });
  await boostRegistry.waitForDeployment();
  deployed.boostRegistry = await boostRegistry.getAddress();
  console.log("   Proxy:", deployed.boostRegistry);
  console.log("   Implementation:", await upgrades.erc1967.getImplementationAddress(deployed.boostRegistry));
  console.log("");

  // ===== 4. ToadzStake =====
  console.log("4. Deploying ToadzStake...");
  const ToadzStake = await ethers.getContractFactory("ToadzStake");
  const toadzStake = await upgrades.deployProxy(ToadzStake, [
    false, // testNet = false for mainnet
    WFLR,
    FTSO_PROVIDER,
    REWARDS_MANAGER
  ], { kind: 'transparent' });
  await toadzStake.waitForDeployment();
  deployed.toadzStake = await toadzStake.getAddress();
  console.log("   Proxy:", deployed.toadzStake);
  console.log("   Implementation:", await upgrades.erc1967.getImplementationAddress(deployed.toadzStake));
  console.log("");

  // ===== 5. ToadzMarket =====
  console.log("5. Deploying ToadzMarket...");
  const ToadzMarket = await ethers.getContractFactory("ToadzMarketV5");
  const toadzMarket = await upgrades.deployProxy(ToadzMarket, [
    deployed.buffer // feeRecipient
  ], { kind: 'transparent' });
  await toadzMarket.waitForDeployment();
  deployed.toadzMarket = await toadzMarket.getAddress();
  console.log("   Proxy:", deployed.toadzMarket);
  console.log("   Implementation:", await upgrades.erc1967.getImplementationAddress(deployed.toadzMarket));
  console.log("");

  // ===== 6. FToadz =====
  console.log("6. Deploying FToadz...");
  const FToadz = await ethers.getContractFactory("FToadz");
  const ftoadz = await upgrades.deployProxy(FToadz, [
    OG_VAULT_ORACLE,
    "https://ftoadz.io/metadata/", // baseURI
    deployer.address, // raffleWallet (change as needed)
    deployer.address  // teamWallet (change as needed)
  ], { kind: 'transparent' });
  await ftoadz.waitForDeployment();
  deployed.ftoadz = await ftoadz.getAddress();
  console.log("   Proxy:", deployed.ftoadz);
  console.log("   Implementation:", await upgrades.erc1967.getImplementationAddress(deployed.ftoadz));
  console.log("");

  // ===== WIRE EVERYTHING TOGETHER =====
  console.log("===== WIRING CONTRACTS =====");
  console.log("");

  // ToadzStake config
  console.log("Configuring ToadzStake...");
  const stakeContract = ToadzStake.attach(deployed.toadzStake);
  await (await stakeContract.setPond(deployed.pond)).wait();
  console.log("   setPond ✓");
  await (await stakeContract.setBuffer(deployed.buffer)).wait();
  console.log("   setBuffer ✓");
  await (await stakeContract.setBoostRegistry(deployed.boostRegistry)).wait();
  console.log("   setBoostRegistry ✓");
  await (await stakeContract.setBoostMarket(deployed.toadzMarket)).wait();
  console.log("   setBoostMarket ✓");
  await (await stakeContract.delegateToFtso(10000)).wait();
  console.log("   delegateToFtso(100%) ✓");
  console.log("");

  // POND config
  console.log("Configuring POND...");
  const pondContract = POND.attach(deployed.pond);
  await (await pondContract.setToadzStake(deployed.toadzStake)).wait();
  console.log("   setToadzStake ✓");
  await (await pondContract.setBuffer(deployed.buffer)).wait();
  console.log("   setBuffer ✓");
  console.log("");

  // Buffer config
  console.log("Configuring Buffer...");
  const bufferContract = Buffer.attach(deployed.buffer);
  await (await bufferContract.setPond(deployed.pond)).wait();
  console.log("   setPond ✓");
  await (await bufferContract.setToadzStake(deployed.toadzStake)).wait();
  console.log("   setToadzStake ✓");
  await (await bufferContract.delegateToFtso(10000)).wait();
  console.log("   delegateToFtso(100%) ✓");
  console.log("");

  // ToadzMarket config
  console.log("Configuring ToadzMarket...");
  const marketContract = ToadzMarket.attach(deployed.toadzMarket);
  await (await marketContract.setToadzStake(deployed.toadzStake)).wait();
  console.log("   setToadzStake ✓");
  await (await marketContract.setBoostRegistry(deployed.boostRegistry)).wait();
  console.log("   setBoostRegistry ✓");
  // Whitelist fToadz
  await (await marketContract.setWhitelisted(deployed.ftoadz, true)).wait();
  console.log("   whitelisted fToadz ✓");
  console.log("");

  // ===== GET PROXY ADMIN =====
  const proxyAdmin = await upgrades.erc1967.getAdminAddress(deployed.toadzStake);
  console.log("ProxyAdmin:", proxyAdmin);
  console.log("");

  // ===== SUMMARY =====
  console.log("========================================");
  console.log("DEPLOYMENT COMPLETE - TRANSPARENT PROXY");
  console.log("========================================");
  console.log("");
  console.log("POND:          ", deployed.pond);
  console.log("Buffer:        ", deployed.buffer);
  console.log("BoostRegistry: ", deployed.boostRegistry);
  console.log("ToadzStake:    ", deployed.toadzStake);
  console.log("ToadzMarket:   ", deployed.toadzMarket);
  console.log("FToadz:        ", deployed.ftoadz);
  console.log("ProxyAdmin:    ", proxyAdmin);
  console.log("");
  console.log("All contracts wired together ✓");
  console.log("");
  console.log("NEXT STEPS:");
  console.log("1. Verify contracts on Flarescan");
  console.log("2. Transfer ProxyAdmin ownership to multisig");
  console.log("3. Test all functions");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

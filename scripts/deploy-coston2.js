const { ethers, upgrades } = require("hardhat");

// Flare Contract Registry (same on all Flare networks)
const FLARE_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "C2FLR");
  console.log("");

  // Look up WNat (WFLR) from Flare registry
  const registry = await ethers.getContractAt(
    ["function getContractAddressByName(string) view returns (address)"],
    FLARE_REGISTRY
  );
  const WFLR = await registry.getContractAddressByName("WNat");
  console.log("WFLR (WNat):", WFLR);
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
  console.log("");

  // ===== 2. Buffer =====
  console.log("2. Deploying Buffer...");
  const Buffer = await ethers.getContractFactory("Buffer");
  const buffer = await upgrades.deployProxy(Buffer, [
    WFLR,
    deployer.address // ftsoProvider placeholder (testnet)
  ], { kind: 'transparent' });
  await buffer.waitForDeployment();
  deployed.buffer = await buffer.getAddress();
  console.log("   Proxy:", deployed.buffer);
  console.log("");

  // ===== 3. BoostRegistry =====
  console.log("3. Deploying BoostRegistry...");
  const BoostRegistry = await ethers.getContractFactory("BoostRegistry");
  const boostRegistry = await upgrades.deployProxy(BoostRegistry, [
    deployer.address, // ogVaultOracle placeholder (testnet)
    deployer.address  // updater
  ], { kind: 'transparent' });
  await boostRegistry.waitForDeployment();
  deployed.boostRegistry = await boostRegistry.getAddress();
  console.log("   Proxy:", deployed.boostRegistry);
  console.log("");

  // ===== 4. ToadzStake =====
  console.log("4. Deploying ToadzStake...");
  const ToadzStake = await ethers.getContractFactory("ToadzStake");
  const toadzStake = await upgrades.deployProxy(ToadzStake, [
    true, // testNet = true (minute-based locks for testing)
    WFLR,
    deployer.address, // ftsoProvider placeholder
    deployer.address  // rewardsManager placeholder
  ], { kind: 'transparent' });
  await toadzStake.waitForDeployment();
  deployed.toadzStake = await toadzStake.getAddress();
  console.log("   Proxy:", deployed.toadzStake);
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
  await (await stakeContract.setAuthorizedSender(deployer.address, true)).wait();
  console.log("   setAuthorizedSender(deployer) ✓");
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
  console.log("");

  // ToadzMarket config
  console.log("Configuring ToadzMarket...");
  const marketContract = ToadzMarket.attach(deployed.toadzMarket);
  await (await marketContract.setToadzStake(deployed.toadzStake)).wait();
  console.log("   setToadzStake ✓");
  await (await marketContract.setBoostRegistry(deployed.boostRegistry)).wait();
  console.log("   setBoostRegistry ✓");
  console.log("");

  // ===== SUMMARY =====
  console.log("========================================");
  console.log("COSTON2 DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("");
  console.log("WFLR (WNat):   ", WFLR);
  console.log("POND:          ", deployed.pond);
  console.log("Buffer:        ", deployed.buffer);
  console.log("BoostRegistry: ", deployed.boostRegistry);
  console.log("ToadzStake:    ", deployed.toadzStake);
  console.log("ToadzMarket:   ", deployed.toadzMarket);
  console.log("");
  console.log("Test mode: ON (minute-based lock periods)");
  console.log("  90-day lock  = 90 minutes");
  console.log("  180-day lock = 180 minutes");
  console.log("  365-day lock = 360 minutes");
  console.log("");
  console.log("All contracts wired together ✓");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

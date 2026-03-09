const { ethers, upgrades } = require("hardhat");

const MARKET_PROXY = "0x58128c30cFAFCd8508bB03fc396c5a61FBC6Bf2F";
const DEFAULT_LISTING_FLR_PER_SLOT = "1000";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading ToadzMarketV5 on Coston2");
  console.log("Deployer:", deployer.address);
  console.log("Proxy:", MARKET_PROXY);

  const Factory = await ethers.getContractFactory("ToadzMarketV5");
  await upgrades.forceImport(MARKET_PROXY, Factory, { kind: "transparent" });
  await upgrades.validateUpgrade(MARKET_PROXY, Factory);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(MARKET_PROXY);
  console.log("Previous implementation:", beforeImpl);

  const upgraded = await upgrades.upgradeProxy(MARKET_PROXY, Factory, {
    kind: "transparent",
    redeployImplementation: "always"
  });
  await upgraded.waitForDeployment();

  const afterImpl = await upgrades.erc1967.getImplementationAddress(MARKET_PROXY);
  console.log("New implementation:", afterImpl);
  console.log("Implementation changed:", beforeImpl.toLowerCase() !== afterImpl.toLowerCase());

  const slotConfigRaw = await upgraded.listingFlrPerSlot();
  const slotConfigEffective =
    slotConfigRaw > 0n ? slotConfigRaw : ethers.parseEther(DEFAULT_LISTING_FLR_PER_SLOT);

  if (slotConfigRaw === 0n) {
    const tx = await upgraded.setListingFlrPerSlot(slotConfigEffective);
    await tx.wait();
    console.log("Initialized listingFlrPerSlot to:", ethers.formatEther(slotConfigEffective), "FLR");
  } else {
    console.log("listingFlrPerSlot already set to:", ethers.formatEther(slotConfigRaw), "FLR");
  }

  console.log("Upgrade complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

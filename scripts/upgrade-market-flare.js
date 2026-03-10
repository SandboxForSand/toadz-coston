const { ethers, upgrades, network } = require("hardhat");

const MARKET_PROXY = "0xa36a221F9BAc3691BfD69A23AB67d2f6F7F40A7d";
const LISTING_FLR_PER_SLOT = ethers.parseEther(process.env.LISTING_FLR_PER_SLOT || "1000");
const PLATFORM_BONUS_SLOTS = Number(process.env.PLATFORM_BONUS_SLOTS || "10");

const PLATFORM_WALLETS = [
  "0x9bDB29529016a15754373B9D5B5116AB728E916e",
  "0x6D69E5d3E51ef1eE47d3C73112aa74F6eA944895",
  "0xcf64CA3A422054DEb35C829a3fc79E03955daf4B"
];

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Upgrading ToadzMarketV5 on Flare mainnet");
  console.log("Deployer:", deployer.address);
  console.log("Market proxy:", MARKET_PROXY);
  console.log("Target listingFlrPerSlot:", ethers.formatEther(LISTING_FLR_PER_SLOT), "FLR");
  console.log("Platform bonus slots:", PLATFORM_BONUS_SLOTS);

  const Factory = await ethers.getContractFactory("ToadzMarketV5");
  await upgrades.forceImport(MARKET_PROXY, Factory, { kind: "transparent" });
  await upgrades.validateUpgrade(MARKET_PROXY, Factory);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(MARKET_PROXY);
  console.log("Previous implementation:", beforeImpl);

  const market = await upgrades.upgradeProxy(MARKET_PROXY, Factory, {
    kind: "transparent",
    redeployImplementation: "always"
  });
  await market.waitForDeployment();

  const afterImpl = await upgrades.erc1967.getImplementationAddress(MARKET_PROXY);
  console.log("New implementation:", afterImpl);
  console.log("Implementation changed:", beforeImpl.toLowerCase() !== afterImpl.toLowerCase());

  const currentSlot = await market.listingFlrPerSlot();
  if (currentSlot !== LISTING_FLR_PER_SLOT) {
    const tx = await market.setListingFlrPerSlot(LISTING_FLR_PER_SLOT);
    await tx.wait();
    console.log("setListingFlrPerSlot tx:", tx.hash);
  } else {
    console.log("listingFlrPerSlot already set");
  }

  for (const wallet of PLATFORM_WALLETS) {
    const current = await market.bonusListingSlots(wallet);
    if (current !== BigInt(PLATFORM_BONUS_SLOTS)) {
      const tx = await market.setBonusListingSlots(wallet, PLATFORM_BONUS_SLOTS);
      await tx.wait();
      console.log(`setBonusListingSlots ${wallet} -> ${PLATFORM_BONUS_SLOTS}, tx:`, tx.hash);
    } else {
      console.log(`bonus slots already ${PLATFORM_BONUS_SLOTS} for`, wallet);
    }
  }

  const finalSlot = await market.listingFlrPerSlot();
  console.log("Final listingFlrPerSlot:", ethers.formatEther(finalSlot), "FLR");
  console.log("Upgrade complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

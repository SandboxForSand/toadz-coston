const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const MAINNET = {
  buffer: "0x76613C34bBA7cF6283d448adb2fFdf4d96eee176",
  stake: "0xef3722efB994bb7657616763ffD7e70f5E1b2999",
  boostRegistry: "0x62a47BD9fba669a2BE0641f4cB1c987698605e69",
  tadzCollection: "0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6"
};

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const outPath =
    process.env.CANARY_OUT ||
    path.join(process.cwd(), "scripts", "market-canary-flare.json");
  const listingFlrPerSlot = ethers.parseEther(process.env.LISTING_FLR_PER_SLOT || "1000");

  console.log("Network:", network.name);
  console.log("Deployer:", deployerAddress);
  console.log("Output:", outPath);

  const ToadzMarket = await ethers.getContractFactory("ToadzMarketV5");
  console.log("\nDeploying market canary proxy...");
  const market = await upgrades.deployProxy(ToadzMarket, [MAINNET.buffer], {
    kind: "transparent"
  });
  await market.waitForDeployment();
  const proxy = await market.getAddress();
  const impl = await upgrades.erc1967.getImplementationAddress(proxy);
  const admin = await upgrades.erc1967.getAdminAddress(proxy);

  console.log("Market canary proxy:", proxy);
  console.log("Market canary impl:", impl);
  console.log("Market canary admin:", admin);

  console.log("\nWiring canary...");
  await (await market.setToadzStake(MAINNET.stake)).wait();
  await (await market.setBoostRegistry(MAINNET.boostRegistry)).wait();
  await (await market.setWhitelisted(MAINNET.tadzCollection, true)).wait();
  await (await market.setListingFlrPerSlot(listingFlrPerSlot)).wait();

  const slotRaw = await market.listingFlrPerSlot();

  const out = {
    network: network.name,
    timestamp: new Date().toISOString(),
    deployer: deployerAddress,
    contracts: {
      marketProxy: proxy,
      marketImpl: impl,
      proxyAdmin: admin
    },
    config: {
      feeRecipient: MAINNET.buffer,
      toadzStake: MAINNET.stake,
      boostRegistry: MAINNET.boostRegistry,
      tadzCollection: MAINNET.tadzCollection,
      listingFlrPerSlot: slotRaw.toString()
    }
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\nWrote:", outPath);
  console.log("listingFlrPerSlot:", ethers.formatEther(slotRaw), "FLR");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

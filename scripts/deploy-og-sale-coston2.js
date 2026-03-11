const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  STOADZ: "0x395ff0eA8B02e2eE261FFFDA8c6Df8e56512E04F",
  LOFTS: "",
  CITY: "",
};

function asCfg(name, address, base, step, enabled) {
  return { name, address, base, step, enabled };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = deployer.address;
  const treasury = process.env.OG_SALE_TREASURY || deployerAddress;

  console.log("Deploying OGSaleV1 on Coston2");
  console.log("Deployer:", deployerAddress);
  console.log("Treasury:", treasury);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "C2FLR");

  const Sale = await ethers.getContractFactory("OGSaleV1");
  const sale = await Sale.deploy(deployerAddress, treasury);
  await sale.waitForDeployment();
  const saleAddress = await sale.getAddress();
  console.log("OGSaleV1:", saleAddress);

  const configs = [
    asCfg(
      "sToadz",
      process.env.OG_SALE_STOADZ || DEFAULTS.STOADZ,
      process.env.OG_SALE_STOADZ_BASE || "5",
      process.env.OG_SALE_STOADZ_STEP || "0.02",
      true
    ),
    asCfg(
      "Lofts",
      process.env.OG_SALE_LOFTS || DEFAULTS.LOFTS,
      process.env.OG_SALE_LOFTS_BASE || "5",
      process.env.OG_SALE_LOFTS_STEP || "0.02",
      false
    ),
    asCfg(
      "City",
      process.env.OG_SALE_CITY || DEFAULTS.CITY,
      process.env.OG_SALE_CITY_BASE || "5",
      process.env.OG_SALE_CITY_STEP || "0.02",
      false
    ),
  ].filter((c) => c.address && c.address !== ethers.ZeroAddress);

  if (configs.length === 0) {
    console.log("No collection addresses provided. Configure collections manually later.");
  }

  for (const cfg of configs) {
    const tx = await sale.configureCollection(
      cfg.address,
      cfg.enabled,
      ethers.parseEther(cfg.base),
      ethers.parseEther(cfg.step)
    );
    await tx.wait();
    console.log(`Configured ${cfg.name}:`, cfg.address, `enabled=${cfg.enabled}`, `base=${cfg.base}`, `step=${cfg.step}`);
  }

  const discountBps = Number(process.env.OG_SALE_BUNDLE_DISCOUNT_BPS || "1000");
  if (discountBps !== 1000) {
    const tx = await sale.setBundleDiscountBps(discountBps);
    await tx.wait();
    console.log("Bundle discount bps set:", discountBps);
  } else {
    console.log("Bundle discount bps: 1000 (default 10%)");
  }

  const out = {
    network: "coston2",
    chainId: 114,
    sale: saleAddress,
    treasury,
    deployedAt: new Date().toISOString(),
    configuredCollections: configs,
    bundleDiscountBps: discountBps,
  };

  const outPath = path.join(__dirname, "og-sale-coston2.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote:", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


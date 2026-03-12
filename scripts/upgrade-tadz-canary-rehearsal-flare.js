const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const canaryPath =
    process.env.CANARY_JSON ||
    path.join(process.cwd(), "scripts", "tadz-canary-rehearsal-flare.json");

  if (!fs.existsSync(canaryPath)) {
    throw new Error(`Missing canary file: ${canaryPath}`);
  }

  const canary = JSON.parse(fs.readFileSync(canaryPath, "utf8"));
  const claimerProxy = canary?.contracts?.claimerProxy;
  if (!claimerProxy) throw new Error("Missing contracts.claimerProxy in canary json");

  const [deployer] = await ethers.getSigners();
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Claimer proxy:", claimerProxy);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(claimerProxy);
  console.log("Implementation before:", beforeImpl);

  const TargetImpl = await ethers.getContractFactory("TadzClaimer_TP");
  await upgrades.validateUpgrade(claimerProxy, TargetImpl, { kind: "transparent" });

  console.log("\nUpgrading proxy to TadzClaimer_TP...");
  const upgraded = await upgrades.upgradeProxy(claimerProxy, TargetImpl, {
    kind: "transparent"
  });
  await upgraded.waitForDeployment();
  const afterImpl = await upgrades.erc1967.getImplementationAddress(claimerProxy);
  console.log("Implementation after:", afterImpl);

  const out = {
    ...canary,
    timestamp: new Date().toISOString(),
    contracts: {
      ...canary.contracts,
      claimerImplBeforeUpgrade: beforeImpl,
      claimerImplAfterUpgrade: afterImpl
    },
    rehearsal: {
      ...(canary.rehearsal || {}),
      upgradeTx: "handled via upgrades plugin",
      upgradedTo: "TadzClaimer_TP"
    }
  };

  fs.writeFileSync(canaryPath, JSON.stringify(out, null, 2));
  console.log("\nUpdated:", canaryPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

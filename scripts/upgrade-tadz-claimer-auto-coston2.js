const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  if (network.name !== "coston2") {
    throw new Error("This script is intended for --network coston2");
  }

  const stackPath = process.env.STACK_JSON || path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  if (!fs.existsSync(stackPath)) {
    throw new Error(`Missing stack file: ${stackPath}`);
  }

  const stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));
  const claimerProxy = process.env.CLAIMER_ADDRESS || stack.claimer;
  const ogVaultAddress = process.env.OGVAULT_ADDRESS || stack.ogVault;

  if (!claimerProxy) throw new Error("Missing claimer proxy address");
  if (!ogVaultAddress) throw new Error("Missing OGVault address");

  const [deployer] = await ethers.getSigners();
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Claimer proxy:", claimerProxy);
  console.log("OGVault:", ogVaultAddress);

  const Impl = await ethers.getContractFactory("TadzClaimerAuto_TP");
  console.log("\nUpgrading proxy implementation...");
  const upgraded = await upgrades.upgradeProxy(claimerProxy, Impl, { kind: "transparent" });
  await upgraded.waitForDeployment();
  const implAddress = await upgrades.erc1967.getImplementationAddress(claimerProxy);

  console.log("Proxy upgraded.");
  console.log("Implementation:", implAddress);

  const currentVault = await upgraded.ogVault().catch(() => ethers.ZeroAddress);
  if (currentVault.toLowerCase() !== ogVaultAddress.toLowerCase()) {
    console.log("\nSetting OGVault on claimer...");
    try {
      const tx = await upgraded.initializeV2(ogVaultAddress);
      await tx.wait();
      console.log("initializeV2 tx:", tx.hash);
    } catch (err) {
      const msg = String(err?.message || "");
      const alreadyInit =
        msg.includes("already initialized") ||
        msg.includes("reinitializer") ||
        msg.includes("InvalidInitialization");
      if (!alreadyInit) throw err;

      const tx = await upgraded.setOGVault(ogVaultAddress);
      await tx.wait();
      console.log("setOGVault tx:", tx.hash);
    }
  } else {
    console.log("OGVault already configured.");
  }

  const finalVault = await upgraded.ogVault();
  console.log("\nDone.");
  console.log("Final OGVault:", finalVault);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


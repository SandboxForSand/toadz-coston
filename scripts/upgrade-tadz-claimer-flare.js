const { ethers, upgrades, network } = require("hardhat");

const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)"
];

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const claimerProxy =
    process.env.CLAIMER_ADDRESS || "0x08e687aC00311F4683eBEbEc0d234193EA9AD319";

  const [deployer] = await ethers.getSigners();
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Claimer proxy:", claimerProxy);

  const adminAddress = await upgrades.erc1967.getAdminAddress(claimerProxy);
  const proxyAdmin = await ethers.getContractAt(PROXY_ADMIN_ABI, adminAddress);
  const adminOwner = await proxyAdmin.owner();
  console.log("ProxyAdmin:", adminAddress);
  console.log("ProxyAdmin owner:", adminOwner);

  const beforeImpl = await upgrades.erc1967.getImplementationAddress(claimerProxy);
  console.log("Implementation before:", beforeImpl);

  const TargetImpl = await ethers.getContractFactory("TadzClaimer_TP");
  await upgrades.validateUpgrade(claimerProxy, TargetImpl, { kind: "transparent" });
  console.log("validateUpgrade: OK");

  console.log("\nUpgrading proxy to TadzClaimer_TP...");
  const upgraded = await upgrades.upgradeProxy(claimerProxy, TargetImpl, {
    kind: "transparent"
  });
  await upgraded.waitForDeployment();

  const afterImpl = await upgrades.erc1967.getImplementationAddress(claimerProxy);
  console.log("Implementation after:", afterImpl);

  const iface = new ethers.Interface([
    "function claim(uint256 totalAllocation, bytes32[] calldata proof) external",
    "function claimPartial(uint256 amount, uint256 totalAllocation, bytes32[] calldata proof) external"
  ]);
  const claimData = iface.encodeFunctionData("claim", [0n, []]);
  const claimPartialData = iface.encodeFunctionData("claimPartial", [1n, 0n, []]);

  let claimRevert = null;
  let claimPartialRevert = null;
  try {
    await ethers.provider.call({ to: claimerProxy, data: claimData });
  } catch (err) {
    claimRevert = err?.data || err?.error?.data || err?.info?.error?.data || null;
  }
  try {
    await ethers.provider.call({ to: claimerProxy, data: claimPartialData });
  } catch (err) {
    claimPartialRevert = err?.data || err?.error?.data || err?.info?.error?.data || null;
  }

  console.log("\nRuntime call checks:");
  console.log("claim(...) revert data:", claimRevert);
  console.log("claimPartial(...) revert data:", claimPartialRevert);

  if (!claimPartialRevert) {
    throw new Error("Post-upgrade check failed: claimPartial did not resolve to function logic.");
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

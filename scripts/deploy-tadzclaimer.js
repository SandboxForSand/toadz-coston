const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying TadzClaimer with:", deployer.address);

  const TADZ_ADDRESS = "0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6";
  
  // Placeholder merkle root - will set after generating tree
  const INITIAL_MERKLE_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000";

  const TadzClaimer = await ethers.getContractFactory("TadzClaimer_TP");
  
  const proxy = await upgrades.deployProxy(
    TadzClaimer,
    [TADZ_ADDRESS, INITIAL_MERKLE_ROOT],
    {
      initializer: "initialize",
      kind: "transparent"
    }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  
  console.log("TadzClaimer Proxy:", proxyAddress);
  console.log("\nNext steps:");
  console.log("1. Mint 90k Tadz to this contract");
  console.log("2. Call depositTokenIds() with the token IDs");
  console.log("3. Generate merkle tree & set root");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

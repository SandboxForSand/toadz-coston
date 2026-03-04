const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  if (network.name !== "coston2") {
    throw new Error("This script is intended for --network coston2");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const TestERC721 = await ethers.getContractFactory("TestERC721");
  const OGVault = await ethers.getContractFactory("OGVault_TP");
  const TadzClaimer = await ethers.getContractFactory("TadzClaimer_TP");

  console.log("\nDeploying test OG collection...");
  const ogCollection = await TestERC721.deploy("Coston OG Lock Test", "COGL");
  await ogCollection.waitForDeployment();
  const ogCollectionAddress = await ogCollection.getAddress();
  console.log("OG collection:", ogCollectionAddress);

  console.log("\nDeploying test Tadz collection...");
  const tadzCollection = await TestERC721.deploy("Coston Tadz Claim Test", "CTADZ");
  await tadzCollection.waitForDeployment();
  const tadzCollectionAddress = await tadzCollection.getAddress();
  console.log("Tadz collection:", tadzCollectionAddress);

  console.log("\nDeploying OGVault proxy...");
  const ogVault = await upgrades.deployProxy(OGVault, [deployer.address], {
    initializer: "initialize",
    kind: "transparent"
  });
  await ogVault.waitForDeployment();
  const ogVaultAddress = await ogVault.getAddress();
  console.log("OGVault proxy:", ogVaultAddress);

  console.log("Whitelisting OG test collection...");
  await (await ogVault.addCollection(ogCollectionAddress)).wait();

  console.log("Minting 3 OG NFTs to deployer...");
  await (await ogCollection.mintBatch(deployer.address, 3)).wait();

  console.log("Approving OGVault and locking token #1...");
  await (await ogCollection.setApprovalForAll(ogVaultAddress, true)).wait();
  await (await ogVault.lock(ogCollectionAddress, 1)).wait();

  console.log("\nDeploying TadzClaimer proxy...");
  const claimer = await upgrades.deployProxy(TadzClaimer, [tadzCollectionAddress, ethers.ZeroHash], {
    initializer: "initialize",
    kind: "transparent"
  });
  await claimer.waitForDeployment();
  const claimerAddress = await claimer.getAddress();
  console.log("TadzClaimer proxy:", claimerAddress);

  console.log("Minting 20 test Tadz NFTs directly to claimer...");
  await (await tadzCollection.mintBatch(claimerAddress, 20)).wait();

  const tokenIds = Array.from({ length: 20 }, (_, i) => i + 1);
  console.log("Registering token IDs in claimer...");
  await (await claimer.depositTokenIds(tokenIds)).wait();

  const out = {
    network: network.name,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    ogCollection: ogCollectionAddress,
    tadzCollection: tadzCollectionAddress,
    ogVault: ogVaultAddress,
    claimer: claimerAddress,
    seededTokenIds: tokenIds,
    notes: "Use scripts/refresh-tadz-merkle.js with OGVAULT_ADDRESS + CLAIMER_ADDRESS to auto-refresh roots."
  };

  const outPath = path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log("\nWrote:", outPath);
  console.log("\nNext:");
  console.log(`OGVAULT_ADDRESS=${ogVaultAddress} CLAIMER_ADDRESS=${claimerAddress} OG_RPC_URL=https://coston2-api.flare.network/ext/C/rpc MERKLE_JSON_PATH=scripts/tadz-merkle-coston2.json AUTO_SET_ROOT=true npx hardhat run scripts/refresh-tadz-merkle.js --network coston2`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

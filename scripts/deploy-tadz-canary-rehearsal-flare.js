const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

function rangeBigInt(start, count) {
  const out = [];
  for (let i = 0n; i < count; i++) out.push(start + i);
  return out;
}

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const seedCount = BigInt(process.env.CANARY_SEED || "1200");
  const allocation = BigInt(process.env.CANARY_ALLOC || "1000");
  const mintChunk = BigInt(process.env.CANARY_MINT_CHUNK || "100");
  const outPath =
    process.env.CANARY_OUT ||
    path.join(process.cwd(), "scripts", "tadz-canary-rehearsal-flare.json");

  if (seedCount <= 0n) throw new Error("CANARY_SEED must be > 0");
  if (allocation <= 0n) throw new Error("CANARY_ALLOC must be > 0");
  if (mintChunk <= 0n) throw new Error("CANARY_MINT_CHUNK must be > 0");

  console.log("Network:", network.name);
  console.log("Deployer:", deployerAddress);
  console.log("Target allocation:", allocation.toString());
  console.log("Seed tokens:", seedCount.toString());

  const TestERC721 = await ethers.getContractFactory("TestERC721");
  const LegacyClaimer = await ethers.getContractFactory("TadzClaimerLegacy_TP");

  console.log("\nDeploying rehearsal Tadz collection...");
  const tadz = await TestERC721.deploy("Toadz Rehearsal Tadz", "RTADZ");
  await tadz.waitForDeployment();
  const tadzAddress = await tadz.getAddress();
  console.log("Rehearsal Tadz:", tadzAddress);

  console.log("\nDeploying legacy claimer proxy (pre-upgrade state)...");
  const claimer = await upgrades.deployProxy(LegacyClaimer, [tadzAddress, ethers.ZeroHash], {
    initializer: "initialize",
    kind: "transparent"
  });
  await claimer.waitForDeployment();
  const claimerAddress = await claimer.getAddress();
  const legacyImplAddress = await upgrades.erc1967.getImplementationAddress(claimerAddress);
  console.log("Rehearsal claimer proxy:", claimerAddress);
  console.log("Legacy impl:", legacyImplAddress);

  const leaf = ethers.keccak256(
    ethers.solidityPacked(["address", "uint256"], [deployerAddress, allocation])
  );
  const merkleRoot = leaf; // single-leaf tree => root == leaf, proof == []

  console.log("\nSetting initial merkle root...");
  const rootTx = await claimer.setMerkleRoot(merkleRoot);
  await rootTx.wait();
  console.log("setMerkleRoot tx:", rootTx.hash);

  console.log("\nMinting + depositing rehearsal Tadz token IDs...");
  let remaining = seedCount;
  const seededTokenIds = [];
  while (remaining > 0n) {
    const chunk = remaining > mintChunk ? mintChunk : remaining;
    const first = await tadz.nextTokenId();

    const mintTx = await tadz.mintBatch(claimerAddress, Number(chunk));
    await mintTx.wait();

    const ids = rangeBigInt(first, chunk);
    const depTx = await claimer.depositTokenIds(ids);
    await depTx.wait();

    seededTokenIds.push(...ids.map((x) => x.toString()));
    remaining -= chunk;
    console.log(`  seeded ${chunk.toString()} (remaining ${remaining.toString()})`);
  }

  const available = await claimer.availableTokens();
  const claimable = await claimer.getClaimable(deployerAddress, allocation, []);
  const claimed = await claimer.claimed(deployerAddress);

  const out = {
    network: network.name,
    timestamp: new Date().toISOString(),
    deployer: deployerAddress,
    contracts: {
      tadz: tadzAddress,
      claimerProxy: claimerAddress,
      legacyImpl: legacyImplAddress
    },
    canary: {
      allocation: allocation.toString(),
      merkleRoot,
      proof: [],
      seedCount: seedCount.toString(),
      seededTokenIds
    },
    runtime: {
      claimed: claimed.toString(),
      claimable: claimable.toString(),
      availableTokens: available.toString()
    }
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\nWrote:", outPath);
  console.log("Rehearsal claimable:", claimable.toString());
  console.log("Rehearsal available tokens:", available.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

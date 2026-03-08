const { ethers, network } = require("hardhat");
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

  const canaryPath = process.env.CANARY_JSON || path.join(process.cwd(), "scripts", "tadz-canary-flare.json");
  if (!fs.existsSync(canaryPath)) throw new Error(`Missing canary file: ${canaryPath}`);
  const canary = JSON.parse(fs.readFileSync(canaryPath, "utf8"));

  const [signer] = await ethers.getSigners();
  const user = process.env.CANARY_USER || canary.deployer || await signer.getAddress();
  const targetClaimable = BigInt(process.env.TARGET_CLAIMABLE || "10000");
  const mintChunk = BigInt(process.env.TOPUP_CHUNK || "100");

  const claimer = await ethers.getContractAt(
    [
      "function claimed(address) view returns (uint256)",
      "function availableTokens() view returns (uint256)",
      "function setMerkleRoot(bytes32 _merkleRoot) external",
      "function depositTokenIds(uint256[] calldata _tokenIds) external"
    ],
    canary.contracts.claimerProxy,
    signer
  );

  const tadz = await ethers.getContractAt(
    [
      "function nextTokenId() view returns (uint256)",
      "function mintBatch(address to, uint256 count) external returns (uint256 firstId, uint256 lastId)"
    ],
    canary.contracts.tadz,
    signer
  );

  const claimed = await claimer.claimed(user);
  let available = await claimer.availableTokens();

  const newAllocation = claimed + targetClaimable;
  const newRoot = ethers.keccak256(
    ethers.solidityPacked(["address", "uint256"], [user, newAllocation])
  );

  console.log("User:", user);
  console.log("Current claimed:", claimed.toString());
  console.log("Current available:", available.toString());
  console.log("Target claimable:", targetClaimable.toString());
  console.log("New allocation:", newAllocation.toString());

  if (available < targetClaimable) {
    let toSeed = targetClaimable - available;
    console.log(`Seeding extra tokens: ${toSeed.toString()}`);
    while (toSeed > 0n) {
      const chunk = toSeed > mintChunk ? mintChunk : toSeed;
      const first = await tadz.nextTokenId();

      const mintTx = await tadz.mintBatch(canary.contracts.claimerProxy, Number(chunk));
      await mintTx.wait();

      const ids = rangeBigInt(first, chunk);
      const depTx = await claimer.depositTokenIds(ids);
      await depTx.wait();

      toSeed -= chunk;
      console.log(`  seeded ${chunk.toString()} (remaining ${toSeed.toString()})`);
    }
    available = await claimer.availableTokens();
  }

  const rootTx = await claimer.setMerkleRoot(newRoot);
  await rootTx.wait();
  console.log("setMerkleRoot tx:", rootTx.hash);

  const out = {
    ...canary,
    timestamp: new Date().toISOString(),
    canary: {
      ...(canary.canary || {}),
      allocation: newAllocation.toString(),
      merkleRoot: newRoot,
      proof: [],
      seedCount: available.toString()
    },
    runtime: {
      claimed: claimed.toString(),
      claimable: targetClaimable.toString(),
      availableTokens: available.toString()
    }
  };
  fs.writeFileSync(canaryPath, JSON.stringify(out, null, 2));
  console.log("Updated:", canaryPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


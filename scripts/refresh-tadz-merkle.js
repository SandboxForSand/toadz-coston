const { ethers, network } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const fs = require("fs");
const path = require("path");

const NETWORK_DEFAULTS = {
  flare: {
    ogRpcUrl: "https://songbird-api.flare.network/ext/C/rpc"
  },
  coston2: {
    ogRpcUrl: "https://coston2-api.flare.network/ext/C/rpc"
  }
};

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "y"].includes(String(raw).toLowerCase());
}

function makeLeaf(address, allocation) {
  const packed = ethers.solidityPacked(["address", "uint256"], [address, allocation]);
  return keccak256(packed);
}

async function main() {
  const chain = network.name;
  const stackPath = process.env.STACK_JSON || path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  let stack = null;
  if (fs.existsSync(stackPath)) {
    try {
      stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));
    } catch (e) {
      stack = null;
    }
  }

  const ogVaultAddress = process.env.OGVAULT_ADDRESS || stack?.ogVault;
  const claimerAddress = process.env.CLAIMER_ADDRESS || stack?.claimer;
  const forceSameProvider = envBool("FORCE_SAME_PROVIDER", false);
  const ogRpcUrl = forceSameProvider ? "" : (process.env.OG_RPC_URL || "");
  const writePath = process.env.MERKLE_JSON_PATH || "merkle-tree.json";
  const siteWritePath = process.env.SITE_MERKLE_JSON_PATH || path.join("site", "public", "merkle-tree.json");
  const autoSetRoot = envBool("AUTO_SET_ROOT", true);
  const dryRun = envBool("DRY_RUN", false);

  if (!ogVaultAddress) throw new Error("Missing OGVAULT_ADDRESS env");
  if (!claimerAddress) throw new Error("Missing CLAIMER_ADDRESS env");

  const signer = (await ethers.getSigners())[0];
  const updateProvider = signer.provider;
  const ogProvider = ogRpcUrl ? new ethers.JsonRpcProvider(ogRpcUrl) : updateProvider;

  const ogVault = new ethers.Contract(
    ogVaultAddress,
    ["function getAllLockers() view returns (address[] lockers, uint256[] counts, uint256 total)"],
    ogProvider
  );

  const claimer = new ethers.Contract(
    claimerAddress,
    [
      "function merkleRoot() view returns (bytes32)",
      "function setMerkleRoot(bytes32 _merkleRoot) external"
    ],
    signer
  );

  console.log("Network:", chain);
  console.log("Signer:", signer.address);
  console.log("Update RPC chainId:", (await updateProvider.getNetwork()).chainId.toString());
  console.log("OG source RPC:", ogRpcUrl || "same as update provider");
  console.log("OGVault:", ogVaultAddress);
  console.log("Claimer:", claimerAddress);
  console.log("Auto-set root:", autoSetRoot && !dryRun);
  console.log("Output file:", writePath);

  const [lockers, counts, totalLocksRaw] = await ogVault.getAllLockers();
  const totalLocks = Number(totalLocksRaw);

  const allocations = lockers
    .map((address, i) => {
      const ogCount = Number(counts[i]);
      const tadzAllocation = ogCount * 3;
      return { address, ogCount, tadzAllocation };
    })
    .filter((a) => a.tadzAllocation > 0);

  if (allocations.length === 0) {
    console.log("No lockers with allocation > 0. Nothing to update.");
    return;
  }

  const leaves = allocations.map((a) => makeLeaf(a.address, a.tadzAllocation));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const nextRoot = tree.getHexRoot();

  const proofs = {};
  for (const row of allocations) {
    const proof = tree.getHexProof(makeLeaf(row.address, row.tadzAllocation));
    proofs[row.address.toLowerCase()] = {
      ogCount: row.ogCount,
      tadzAllocation: row.tadzAllocation,
      proof
    };
  }

  const output = {
    timestamp: new Date().toISOString(),
    network: chain,
    ogVaultAddress,
    totalLockers: allocations.length,
    totalLocks,
    totalTadzToDistribute: allocations.reduce((sum, a) => sum + a.tadzAllocation, 0),
    merkleRoot: nextRoot,
    proofs
  };

  const outAbs = path.isAbsolute(writePath) ? writePath : path.join(process.cwd(), writePath);
  fs.writeFileSync(outAbs, JSON.stringify(output, null, 2));
  console.log("Wrote snapshot:", outAbs);

  const siteAbs = path.isAbsolute(siteWritePath) ? siteWritePath : path.join(process.cwd(), siteWritePath);
  if (siteAbs !== outAbs) {
    fs.mkdirSync(path.dirname(siteAbs), { recursive: true });
    fs.writeFileSync(siteAbs, JSON.stringify(output, null, 2));
    console.log("Wrote frontend snapshot:", siteAbs);
  }

  const currentRoot = await claimer.merkleRoot();
  console.log("Current root:", currentRoot);
  console.log("Next root:   ", nextRoot);
  console.log("Root changed:", currentRoot.toLowerCase() !== nextRoot.toLowerCase());

  if (currentRoot.toLowerCase() !== nextRoot.toLowerCase() && autoSetRoot && !dryRun) {
    const tx = await claimer.setMerkleRoot(nextRoot);
    console.log("setMerkleRoot tx:", tx.hash);
    await tx.wait();
    const confirmed = await claimer.merkleRoot();
    console.log("Confirmed root:", confirmed);
  } else {
    console.log("No on-chain update sent.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

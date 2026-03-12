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

function parseNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function makeLeaf(address, allocation) {
  const packed = ethers.solidityPacked(["address", "uint256"], [address, allocation]);
  return keccak256(packed);
}

function normalizeBreakdown(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sToadz = parseNonNegativeInt(raw.sToadz ?? raw.stoadz ?? raw.sTOADZ);
  const loft = parseNonNegativeInt(raw.loft ?? raw.lofts ?? raw.Loft ?? raw.Lofts);
  const city = parseNonNegativeInt(raw.city ?? raw.City);
  if (sToadz === 0 && loft === 0 && city === 0) return null;
  return { sToadz, loft, city };
}

function loadManualEntitlements(manualPath, chain) {
  if (!manualPath || !fs.existsSync(manualPath)) return {};

  let json;
  try {
    json = JSON.parse(fs.readFileSync(manualPath, "utf8"));
  } catch (err) {
    throw new Error(`Failed to parse manual entitlements JSON at ${manualPath}: ${err.message}`);
  }

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`Invalid manual entitlements shape at ${manualPath}: expected object`);
  }

  const scoped =
    (json.default || json[chain]) && typeof json.default === "object"
      ? { ...(json.default || {}), ...(json[chain] || {}) }
      : (json[chain] && typeof json[chain] === "object")
        ? json[chain]
        : json;

  const out = {};
  for (const [rawAddress, rawEntry] of Object.entries(scoped || {})) {
    let normalizedAddress;
    try {
      normalizedAddress = ethers.getAddress(rawAddress).toLowerCase();
    } catch (_) {
      // Ignore malformed entries so one bad row does not break root generation.
      continue;
    }

    const entry = (rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry))
      ? rawEntry
      : { manualTadzAllocation: rawEntry };

    const manualTadzAllocation = parseNonNegativeInt(
      entry.manualTadzAllocation ??
      entry.manualAllocation ??
      entry.tadzAllocation ??
      entry.tadzBonus
    );

    if (manualTadzAllocation <= 0) continue;

    out[normalizedAddress] = {
      manualTadzAllocation,
      sourceVault: typeof entry.sourceVault === "string" ? entry.sourceVault : null,
      reason: typeof entry.reason === "string" ? entry.reason : null,
      legacyBreakdown: normalizeBreakdown(entry.legacyBreakdown)
    };
  }

  return out;
}

async function main() {
  const chain = network.name;
  const stackPath = process.env.STACK_JSON || path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  const manualPath = process.env.MANUAL_ENTITLEMENTS_PATH || path.join(process.cwd(), "scripts", "manual-entitlements.json");

  let stack = null;
  if (fs.existsSync(stackPath)) {
    try {
      stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));
    } catch (e) {
      stack = null;
    }
  }

  const networkDefaults = NETWORK_DEFAULTS[chain] || {};
  const ogVaultAddress = process.env.OGVAULT_ADDRESS || stack?.ogVault;
  const claimerAddress = process.env.CLAIMER_ADDRESS || stack?.claimer;
  const forceSameProvider = envBool("FORCE_SAME_PROVIDER", false);
  const ogRpcCandidate = process.env.OG_RPC_URL || networkDefaults.ogRpcUrl || "";
  const ogRpcUrl = forceSameProvider ? "" : ogRpcCandidate;
  const writePath = process.env.MERKLE_JSON_PATH || "merkle-tree.json";
  const siteWritePath = process.env.SITE_MERKLE_JSON_PATH || path.join("site", "public", "merkle-tree.json");
  const autoSetRoot = envBool("AUTO_SET_ROOT", true);
  const dryRun = envBool("DRY_RUN", false);

  if (!ogVaultAddress) throw new Error("Missing OGVAULT_ADDRESS env");
  if (!claimerAddress) throw new Error("Missing CLAIMER_ADDRESS env");

  const signer = (await ethers.getSigners())[0];
  const updateProvider = signer.provider;
  const ogProvider = ogRpcUrl ? new ethers.JsonRpcProvider(ogRpcUrl) : updateProvider;
  const manualEntitlements = loadManualEntitlements(manualPath, chain);

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
  console.log("Manual entitlements file:", fs.existsSync(manualPath) ? manualPath : "(not found)");

  const [lockers, counts, totalLocksRaw] = await ogVault.getAllLockers();
  const totalLocks = Number(totalLocksRaw);

  const allocationsMap = new Map();
  for (let i = 0; i < lockers.length; i++) {
    const address = ethers.getAddress(lockers[i]);
    const normalized = address.toLowerCase();
    const ogCount = Number(counts[i]);
    const baseAllocation = ogCount * 3;
    const manual = manualEntitlements[normalized] || null;
    const manualBonus = manual?.manualTadzAllocation || 0;
    const tadzAllocation = baseAllocation + manualBonus;
    if (tadzAllocation <= 0) continue;

    allocationsMap.set(normalized, {
      address,
      ogCount,
      baseAllocation,
      manualBonus,
      tadzAllocation,
      manualSourceVault: manual?.sourceVault || null,
      manualReason: manual?.reason || null,
      legacyBreakdown: manual?.legacyBreakdown || null
    });
  }

  // Include manual-only wallets not present in OGVault lockers.
  for (const [normalized, manual] of Object.entries(manualEntitlements)) {
    if (allocationsMap.has(normalized)) continue;
    allocationsMap.set(normalized, {
      address: ethers.getAddress(normalized),
      ogCount: 0,
      baseAllocation: 0,
      manualBonus: manual.manualTadzAllocation,
      tadzAllocation: manual.manualTadzAllocation,
      manualSourceVault: manual.sourceVault || null,
      manualReason: manual.reason || null,
      legacyBreakdown: manual.legacyBreakdown || null
    });
  }

  const allocations = Array.from(allocationsMap.values());

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
    const entry = {
      ogCount: row.ogCount,
      baseAllocation: row.baseAllocation,
      manualBonus: row.manualBonus,
      tadzAllocation: row.tadzAllocation,
      proof
    };
    if (row.manualSourceVault) entry.sourceVault = row.manualSourceVault;
    if (row.manualReason) entry.reason = row.manualReason;
    if (row.legacyBreakdown) entry.legacyBreakdown = row.legacyBreakdown;
    proofs[row.address.toLowerCase()] = entry;
  }

  const manualWallets = allocations.filter((a) => a.manualBonus > 0).length;
  const manualOnlyWallets = allocations.filter((a) => a.manualBonus > 0 && a.baseAllocation === 0).length;
  const totalManualBonus = allocations.reduce((sum, a) => sum + a.manualBonus, 0);
  if (manualWallets > 0) {
    console.log(`Applied manual bonus: wallets=${manualWallets}, manual-only=${manualOnlyWallets}, totalBonus=${totalManualBonus}`);
  }

  const output = {
    timestamp: new Date().toISOString(),
    network: chain,
    ogVaultAddress,
    manualEntitlementsPath: fs.existsSync(manualPath) ? path.resolve(manualPath) : null,
    manualWallets,
    manualOnlyWallets,
    totalManualBonus,
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

const { ethers } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const fs = require("fs");

// Config
const SONGBIRD_RPC = "https://songbird-api.flare.network/ext/C/rpc";
const OGVAULT_ADDRESS = "0x6E4eE531b636e3c389F37082eBdEeB6cbB98f2dA";

const OGVAULT_ABI = [
  "function getAllLockers() view returns (address[] lockers, uint256[] counts, uint256 total)"
];

async function generateMerkleTree() {
  console.log("Connecting to Songbird...");
  const provider = new ethers.JsonRpcProvider(SONGBIRD_RPC);
  const ogVault = new ethers.Contract(OGVAULT_ADDRESS, OGVAULT_ABI, provider);

  console.log("Fetching all lockers from OGVault...");
  const [lockers, counts, total] = await ogVault.getAllLockers();
  
  console.log(`Found ${lockers.length} lockers with ${total} total locks\n`);

  // Build allocations: address => ogCount * 3 Tadz
  const allocations = [];
  for (let i = 0; i < lockers.length; i++) {
    const address = lockers[i];
    const ogCount = Number(counts[i]);
    const tadzAllocation = ogCount * 3;
    
    allocations.push({
      address,
      ogCount,
      tadzAllocation
    });
    
    console.log(`${address}: ${ogCount} OGs => ${tadzAllocation} Tadz`);
  }

  if (allocations.length === 0) {
    console.log("\nNo lockers found. Cannot generate merkle tree.");
    return;
  }

  // Generate leaves: keccak256(abi.encodePacked(address, allocation))
  const leaves = allocations.map(a => {
    const packed = ethers.solidityPacked(
      ["address", "uint256"],
      [a.address, a.tadzAllocation]
    );
    return keccak256(packed);
  });

  // Build merkle tree
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  console.log("\n========================================");
  console.log("MERKLE ROOT:", root);
  console.log("========================================\n");

  // Generate proofs for each user
  const proofs = {};
  for (let i = 0; i < allocations.length; i++) {
    const a = allocations[i];
    const packed = ethers.solidityPacked(
      ["address", "uint256"],
      [a.address, a.tadzAllocation]
    );
    const leaf = keccak256(packed);
    const proof = tree.getHexProof(leaf);
    
    proofs[a.address.toLowerCase()] = {
      ogCount: a.ogCount,
      tadzAllocation: a.tadzAllocation,
      proof
    };
  }

  // Save to file
  const output = {
    timestamp: new Date().toISOString(),
    ogVaultAddress: OGVAULT_ADDRESS,
    totalLockers: lockers.length,
    totalLocks: Number(total),
    totalTadzToDistribute: allocations.reduce((sum, a) => sum + a.tadzAllocation, 0),
    merkleRoot: root,
    proofs
  };

  fs.writeFileSync("merkle-tree.json", JSON.stringify(output, null, 2));
  console.log("Saved to merkle-tree.json");

  // Print summary
  console.log("\nSUMMARY:");
  console.log(`- Total lockers: ${lockers.length}`);
  console.log(`- Total OGs locked: ${total}`);
  console.log(`- Total Tadz to distribute: ${output.totalTadzToDistribute}`);
  console.log(`\nMerkle root: ${root}`);
  
  console.log("\nNEXT STEPS:");
  console.log("1. Deploy TadzClaimer (if not done)");
  console.log("2. Set merkle root on TadzClaimer:");
  console.log(`   cast send <CLAIMER_ADDRESS> "setMerkleRoot(bytes32)" ${root}`);
  console.log("3. Host merkle-tree.json for frontend to fetch proofs");
}

generateMerkleTree()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

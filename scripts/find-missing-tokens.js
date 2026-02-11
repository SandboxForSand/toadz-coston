const { ethers } = require("ethers");

const RPC = "https://flare-api.flare.network/ext/C/rpc";
const TADZ = "0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6";

async function checkBatch(provider, tadz, ids) {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        await tadz.ownerOf(id);
        return null; // exists
      } catch {
        return id; // missing
      }
    })
  );
  return results.filter(x => x !== null);
}

async function findMissing() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const tadz = new ethers.Contract(TADZ, [
    "function ownerOf(uint256) view returns (address)"
  ], provider);

  const missing = [];
  const PARALLEL = 50;
  
  console.log("Scanning for missing tokens (parallel)...");
  
  for (let i = 1031; i <= 91020; i += PARALLEL) {
    const ids = [];
    for (let j = i; j < i + PARALLEL && j <= 91020; j++) {
      ids.push(j);
    }
    
    const batchMissing = await checkBatch(provider, tadz, ids);
    missing.push(...batchMissing);
    
    if (i % 1000 < PARALLEL) {
      console.log(`Checked ${i}... (${missing.length} missing so far)`);
    }
  }

  console.log(`\nTotal missing: ${missing.length}`);
  
  // Save to file
  require("fs").writeFileSync("missing-tokens.json", JSON.stringify(missing));
  console.log("Saved to missing-tokens.json");
}

findMissing();

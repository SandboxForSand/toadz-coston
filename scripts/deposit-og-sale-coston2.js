const { ethers } = require("hardhat");

/**
 * Usage:
 *   npx hardhat run scripts/deposit-og-sale-coston2.js --network coston2 -- <sale> <collection> <idsSpec>
 *
 * Example:
 *   npx hardhat run scripts/deposit-og-sale-coston2.js --network coston2 -- 0xSale 0xCollection 1,2,3,4
 *   npx hardhat run scripts/deposit-og-sale-coston2.js --network coston2 -- 0xSale 0xCollection 1-100
 */
function parseIds(spec) {
  const out = [];
  const parts = String(spec || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-").map((v) => v.trim());
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
        throw new Error(`Invalid range: ${part}`);
      }
      for (let tokenId = start; tokenId <= end; tokenId++) {
        out.push(BigInt(tokenId));
      }
    } else {
      const single = Number(part);
      if (!Number.isFinite(single) || single <= 0) throw new Error(`Invalid token id: ${part}`);
      out.push(BigInt(single));
    }
  }

  return out;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const [saleAddress, collectionAddress, tokenSpec] = process.argv.slice(2);
  const batchSize = Number(process.env.OG_SALE_DEPOSIT_BATCH || "50");

  if (!saleAddress || !collectionAddress || !tokenSpec) {
    throw new Error("Missing args: <sale> <collection> <idsSpec>");
  }

  const tokenIds = parseIds(tokenSpec);

  if (tokenIds.length === 0) {
    throw new Error("No token ids parsed");
  }

  console.log("Deployer:", deployer.address);
  console.log("Sale:", saleAddress);
  console.log("Collection:", collectionAddress);
  console.log("Token IDs count:", tokenIds.length);
  console.log("Batch size:", batchSize);

  const sale = await ethers.getContractAt(
    [
      "function depositBatch(address,uint256[]) external",
      "function inventoryCount(address) view returns (uint256)",
    ],
    saleAddress
  );

  const nft = await ethers.getContractAt(
    [
      "function owner() view returns (address)",
      "function isApprovedForAll(address,address) view returns (bool)",
      "function setApprovalForAll(address,bool) external",
      "function ownerOf(uint256) view returns (address)",
    ],
    collectionAddress
  );

  const approved = await nft.isApprovedForAll(deployer.address, saleAddress);
  if (!approved) {
    const approveTx = await nft.setApprovalForAll(saleAddress, true);
    await approveTx.wait();
    console.log("setApprovalForAll ✓");
  }

  for (const tokenId of tokenIds) {
    const owner = await nft.ownerOf(tokenId);
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(`Not owner of token ${tokenId.toString()}`);
    }
  }

  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const chunk = tokenIds.slice(i, i + batchSize);
    const tx = await sale.depositBatch(collectionAddress, chunk);
    const receipt = await tx.wait();
    console.log(`depositBatch [${i + 1}-${Math.min(i + chunk.length, tokenIds.length)}] tx:`, receipt.hash);
  }

  const inventory = await sale.inventoryCount(collectionAddress);
  console.log("Inventory now:", inventory.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const { ethers } = require("hardhat");

/**
 * Usage:
 *   npx hardhat run scripts/deposit-og-sale-coston2.js --network coston2 -- <sale> <collection> <idsCsv>
 *
 * Example:
 *   npx hardhat run scripts/deposit-og-sale-coston2.js --network coston2 -- 0xSale 0xCollection 1,2,3,4
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const [saleAddress, collectionAddress, tokenCsv] = process.argv.slice(2);

  if (!saleAddress || !collectionAddress || !tokenCsv) {
    throw new Error("Missing args: <sale> <collection> <idsCsv>");
  }

  const tokenIds = tokenCsv
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => BigInt(v));

  if (tokenIds.length === 0) {
    throw new Error("No token ids parsed");
  }

  console.log("Deployer:", deployer.address);
  console.log("Sale:", saleAddress);
  console.log("Collection:", collectionAddress);
  console.log("Token IDs:", tokenIds.map(String).join(","));

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

  const tx = await sale.depositBatch(collectionAddress, tokenIds);
  const receipt = await tx.wait();
  console.log("depositBatch tx:", receipt.hash);

  const inventory = await sale.inventoryCount(collectionAddress);
  console.log("Inventory now:", inventory.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


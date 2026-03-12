const { ethers, network } = require("hardhat");

async function main() {
  if (network.name !== "coston2") {
    throw new Error("Run with --network coston2");
  }

  const wallet = process.env.WALLET || "0x9bDB29529016a15754373B9D5B5116AB728E916e";
  const ogCollection = "0x395ff0eA8B02e2eE261FFFDA8c6Df8e56512E04F";
  const ogVault = "0x812B7F96966b94C9ECa198ac0553840ACabbd18A";

  const nft = await ethers.getContractAt(
    [
      "function balanceOf(address owner) view returns (uint256)",
      "function ownerOf(uint256 tokenId) view returns (address)"
    ],
    ogCollection
  );

  const vault = await ethers.getContractAt(
    [
      "function getOGCount(address user) view returns (uint256)",
      "function getLockedNfts(address user, address collection) view returns (uint256[])"
    ],
    ogVault
  );

  const bal = await nft.balanceOf(wallet);
  const ogCount = await vault.getOGCount(wallet);
  const locked = await vault.getLockedNfts(wallet, ogCollection);

  console.log("wallet:", wallet);
  console.log("wallet balance:", bal.toString());
  console.log("locked count:", ogCount.toString());
  console.log("locked tokenIds:", locked.map((x) => x.toString()).join(",") || "(none)");

  for (const tokenId of [1, 2, 3, 4, 5]) {
    try {
      const owner = await nft.ownerOf(tokenId);
      console.log(`ownerOf(${tokenId}):`, owner);
    } catch {
      console.log(`ownerOf(${tokenId}): not minted or invalid`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


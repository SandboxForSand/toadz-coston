const { ethers } = require("hardhat");

const MARKET = "0x58128c30cFAFCd8508bB03fc396c5a61FBC6Bf2F";

async function main() {
  const [signer] = await ethers.getSigners();
  const userArg = process.env.TARGET_USER || signer.address;

  const market = await ethers.getContractAt(
    [
      "function listingFlrPerSlot() view returns (uint256)",
      "function getListingLimit(address user) view returns (uint256)",
      "function getListingUsage(address user) view returns (uint256 used, uint256 max, uint256 remaining)",
      "function bonusListingSlots(address user) view returns (uint256)",
      "function toadzStake() view returns (address)",
      "function userListingCount(address user) view returns (uint256)",
      "function userRentalListingCount(address user) view returns (uint256)"
    ],
    MARKET
  );

  const slotRaw = await market.listingFlrPerSlot();
  const [used, max, remaining] = await market.getListingUsage(userArg);
  const limit = await market.getListingLimit(userArg);
  const bonus = await market.bonusListingSlots(userArg);
  const sales = await market.userListingCount(userArg);
  const rentals = await market.userRentalListingCount(userArg);
  const toadzStake = await market.toadzStake();

  console.log("Market:", MARKET);
  console.log("ToadzStake:", toadzStake);
  console.log("User:", userArg);
  console.log("listingFlrPerSlot(raw):", slotRaw.toString(), "wei");
  console.log("listingFlrPerSlot:", ethers.formatEther(slotRaw), "FLR");
  console.log("bonus slots:", bonus.toString());
  console.log("limit:", limit.toString());
  console.log("usage used/max/remaining:", used.toString(), max.toString(), remaining.toString());
  console.log("sales listings:", sales.toString(), "rental listings:", rentals.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

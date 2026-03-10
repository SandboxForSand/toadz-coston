const { ethers, network } = require("hardhat");

const MARKET = process.env.MARKET_PROXY || "0xa36a221F9BAc3691BfD69A23AB67d2f6F7F40A7d";
const USERS = (process.env.TARGET_USERS || [
  "0x9bDB29529016a15754373B9D5B5116AB728E916e",
  "0x6D69E5d3E51ef1eE47d3C73112aa74F6eA944895",
  "0xcf64CA3A422054DEb35C829a3fc79E03955daf4B"
].join(","))
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const market = await ethers.getContractAt(
    [
      "function listingFlrPerSlot() view returns (uint256)",
      "function toadzStake() view returns (address)",
      "function getListingUsage(address user) view returns (uint256 used, uint256 max, uint256 remaining)",
      "function getListingLimit(address user) view returns (uint256)",
      "function bonusListingSlots(address user) view returns (uint256)",
      "function userListingCount(address user) view returns (uint256)",
      "function userRentalListingCount(address user) view returns (uint256)"
    ],
    MARKET
  );

  const slot = await market.listingFlrPerSlot();
  const stake = await market.toadzStake();
  console.log("Market:", MARKET);
  console.log("ToadzStake:", stake);
  console.log("listingFlrPerSlot:", ethers.formatEther(slot), "FLR");

  for (const user of USERS) {
    const [used, max, rem] = await market.getListingUsage(user);
    const limit = await market.getListingLimit(user);
    const bonus = await market.bonusListingSlots(user);
    const sales = await market.userListingCount(user);
    const rentals = await market.userRentalListingCount(user);
    console.log("\nUser:", user);
    console.log(" bonus:", bonus.toString());
    console.log(" limit:", limit.toString());
    console.log(" usage used/max/remaining:", used.toString(), max.toString(), rem.toString());
    console.log(" sales/rentals:", sales.toString(), rentals.toString());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEFAULT_CANARY_JSON = path.join(process.cwd(), "scripts", "market-canary-flare.json");
const DAILY_RATE = ethers.parseEther("0.0001");
const COMMITMENT_DAYS = 7;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getOwnedTokenIds(nft, user) {
  const ids = [];
  try {
    const balance = Number(await nft.balanceOf(user));
    for (let i = 0; i < balance; i++) {
      const tokenId = await nft.tokenOfOwnerByIndex(user, i);
      ids.push(Number(tokenId));
    }
    return ids;
  } catch (_) {
    const explicit = (process.env.TOKEN_IDS || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (explicit.length > 0) {
      const filtered = [];
      for (const tokenId of explicit) {
        try {
          const owner = await nft.ownerOf(tokenId);
          if (owner.toLowerCase() === user.toLowerCase()) filtered.push(tokenId);
        } catch (_) {}
      }
      return filtered;
    }

    const scanMax = Number(process.env.TOKEN_SCAN_MAX || "3000");
    for (let tokenId = 1; tokenId <= scanMax; tokenId++) {
      try {
        const owner = await nft.ownerOf(tokenId);
        if (owner.toLowerCase() === user.toLowerCase()) ids.push(tokenId);
      } catch (_) {}
    }
    return ids;
  }
}

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const canaryPath = process.env.CANARY_JSON || DEFAULT_CANARY_JSON;
  if (!fs.existsSync(canaryPath)) throw new Error(`Missing canary file: ${canaryPath}`);
  const canary = JSON.parse(fs.readFileSync(canaryPath, "utf8"));

  const [signer] = await ethers.getSigners();
  const user = await signer.getAddress();
  const marketAddress = canary?.contracts?.marketProxy;
  const stakeAddress = canary?.config?.toadzStake;
  const tadzAddress = canary?.config?.tadzCollection;

  if (!marketAddress) throw new Error("Missing contracts.marketProxy in canary json");
  if (!stakeAddress) throw new Error("Missing config.toadzStake in canary json");
  if (!tadzAddress) throw new Error("Missing config.tadzCollection in canary json");

  console.log("=== Flare Canary QA: Market Listing Slots ===");
  console.log("Signer:", user);
  console.log("Canary file:", canaryPath);
  console.log("Canary market:", marketAddress);
  console.log("Stake:", stakeAddress);
  console.log("Tadz:", tadzAddress);

  const market = await ethers.getContractAt(
    [
      "function listingFlrPerSlot() view returns (uint256)",
      "function getListingLimit(address user) view returns (uint256)",
      "function getListingUsage(address user) view returns (uint256 used, uint256 max, uint256 remaining)",
      "function bonusListingSlots(address user) view returns (uint256)",
      "function setBonusListingSlots(address user, uint256 slots) external",
      "function whitelisted(address collection) view returns (bool)",
      "function listForRent(address collection, uint256 tokenId, uint256 dailyRate, uint256 commitmentDays) external",
      "function cancelRentalListing(address collection, uint256 tokenId) external",
      "function listings(address,uint256) view returns (address seller,uint256 price,uint256 dailyRate,uint256 commitmentDays,uint256 listedAt)",
      "function rentalListings(address,uint256) view returns (address owner,uint256 dailyRate,uint256 commitmentEnd,bool isActive)"
    ],
    marketAddress,
    signer
  );

  const stake = await ethers.getContractAt(
    [
      "function positions(address) view returns (uint256 wflrStaked, uint256 pondStaked, uint256 earnedWflr, uint256 lockExpiry, uint256 lockMultiplier, uint256 rewardDebt, uint256 lastUpdateTime)"
    ],
    stakeAddress,
    signer
  );

  const nft = await ethers.getContractAt(
    [
      "function balanceOf(address owner) view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
      "function ownerOf(uint256 tokenId) view returns (address)",
      "function isApprovedForAll(address owner, address operator) view returns (bool)",
      "function setApprovalForAll(address operator, bool approved) external"
    ],
    tadzAddress,
    signer
  );

  const slotRaw = await market.listingFlrPerSlot();
  const [used0, max0, remaining0] = await market.getListingUsage(user);
  const bonusOriginal = await market.bonusListingSlots(user);
  const limit0 = await market.getListingLimit(user);
  const pos = await stake.positions(user);
  const whitelisted = await market.whitelisted(tadzAddress);

  console.log("listingFlrPerSlot:", ethers.formatEther(slotRaw), "FLR");
  console.log("usage before:", `${used0}/${max0}`, "remaining", remaining0.toString());
  console.log("bonusOriginal:", bonusOriginal.toString());
  console.log("limit before:", limit0.toString());
  console.log("stake wflr:", ethers.formatEther(pos.wflrStaked));
  console.log("collection whitelisted:", whitelisted);

  assert(whitelisted, "Tadz collection not whitelisted on canary market");
  assert(pos.wflrStaked > 0n, "Signer has no active stake position");

  const ownedTokenIds = await getOwnedTokenIds(nft, user);
  console.log("Owned Tadz:", ownedTokenIds.length);
  assert(ownedTokenIds.length > 0, "No Tadz owned by signer for canary QA");

  const approvedForAll = await nft.isApprovedForAll(user, marketAddress);
  if (!approvedForAll) {
    console.log("Setting approvalForAll on canary market...");
    const tx = await nft.setApprovalForAll(marketAddress, true);
    await tx.wait();
  }

  const available = [];
  for (const tokenId of ownedTokenIds) {
    const sale = await market.listings(tadzAddress, tokenId);
    const rent = await market.rentalListings(tadzAddress, tokenId);
    const listedForSale = sale.seller !== ethers.ZeroAddress;
    const listedForRent = rent.isActive;
    if (!listedForSale && !listedForRent) available.push(tokenId);
  }
  console.log("Available unlisted Tadz:", available.length);
  assert(available.length > 0, "No unlisted Tadz available for canary QA");

  const listedDuringQa = [];
  let changedBonus = false;

  try {
    const stakeSlots = max0 > bonusOriginal ? max0 - bonusOriginal : 0n;
    const desiredMax = used0 + 1n;
    const requiredBonus = desiredMax > stakeSlots ? desiredMax - stakeSlots : 0n;

    if (requiredBonus !== bonusOriginal) {
      console.log("Setting temp bonus slots:", requiredBonus.toString());
      const tx = await market.setBonusListingSlots(user, requiredBonus);
      await tx.wait();
      changedBonus = true;
    }

    const [used1, max1] = await market.getListingUsage(user);
    console.log("usage after temp bonus:", `${used1}/${max1}`);
    assert(max1 >= used1 + 1n, "Failed to open one temporary slot on canary");

    const tokenA = available[0];
    console.log(`Listing token ${tokenA} for rent (expect success)...`);
    {
      const tx = await market.listForRent(tadzAddress, tokenA, DAILY_RATE, COMMITMENT_DAYS);
      await tx.wait();
      listedDuringQa.push(tokenA);
    }

    const rentA = await market.rentalListings(tadzAddress, tokenA);
    assert(rentA.isActive, `Token ${tokenA} is not active after canary listing`);
    assert(rentA.owner.toLowerCase() === user.toLowerCase(), `Token ${tokenA} owner mismatch`);

    const [used2, max2] = await market.getListingUsage(user);
    console.log("usage after first listing:", `${used2}/${max2}`);

    const requiredBonusAtCap = used2 > stakeSlots ? used2 - stakeSlots : 0n;
    if (requiredBonusAtCap !== requiredBonus) {
      console.log("Adjusting bonus to exact cap:", requiredBonusAtCap.toString());
      const tx = await market.setBonusListingSlots(user, requiredBonusAtCap);
      await tx.wait();
    }

    if (available.length >= 2) {
      const tokenB = available[1];
      console.log(`Listing token ${tokenB} for rent (expect revert: Listing slots exceeded)...`);
      let failedAsExpected = false;
      try {
        const tx = await market.listForRent(tadzAddress, tokenB, DAILY_RATE, COMMITMENT_DAYS);
        await tx.wait();
      } catch (err) {
        const msg = String(err?.shortMessage || err?.reason || err?.message || "");
        if (msg.includes("Listing slots exceeded")) {
          failedAsExpected = true;
          console.log("Observed expected revert:", msg);
        } else {
          throw new Error(`Unexpected revert for canary cap test: ${msg}`);
        }
      }
      assert(failedAsExpected, "Second canary listing did not fail at cap");
    } else {
      console.log("Skipping second-listing revert check (only one token available).");
    }

    console.log("CANARY QA RESULT: PASS");
  } finally {
    for (const tokenId of listedDuringQa) {
      try {
        console.log(`Cleanup: cancel rental listing token ${tokenId}...`);
        const tx = await market.cancelRentalListing(tadzAddress, tokenId);
        await tx.wait();
      } catch (err) {
        console.error(`Cleanup failed for token ${tokenId}:`, err?.shortMessage || err?.reason || err?.message || err);
      }
    }

    if (changedBonus) {
      try {
        console.log("Cleanup: restoring original bonus slots =", bonusOriginal.toString());
        const tx = await market.setBonusListingSlots(user, bonusOriginal);
        await tx.wait();
      } catch (err) {
        console.error("Cleanup failed restoring bonus slots:", err?.shortMessage || err?.reason || err?.message || err);
      }
    }
  }

  const [usedF, maxF, remF] = await market.getListingUsage(user);
  const bonusF = await market.bonusListingSlots(user);
  console.log("Final usage:", `${usedF}/${maxF}`, "remaining", remF.toString());
  console.log("Final bonus slots:", bonusF.toString());
}

main().catch((error) => {
  console.error("CANARY QA RESULT: FAIL");
  console.error(error);
  process.exitCode = 1;
});

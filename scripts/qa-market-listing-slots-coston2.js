const { ethers } = require("hardhat");

const ADDRS = {
  market: "0x58128c30cFAFCd8508bB03fc396c5a61FBC6Bf2F",
  stake: "0xd973E756fCcB640108aAf17B3465a387802A6E49",
  tadz: "0x0BF9068F7Ebdb222B4E7d613859Af286dC9E396D"
};

const DAILY_RATE = ethers.parseEther("0.0001");
const COMMITMENT_DAYS = 7;

function short(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
    const scanMax = Number(process.env.TOKEN_SCAN_MAX || "3000");
    for (let tokenId = 1; tokenId <= scanMax; tokenId++) {
      try {
        const owner = await nft.ownerOf(tokenId);
        if (owner.toLowerCase() === user.toLowerCase()) ids.push(tokenId);
      } catch (_) {}
    }

    ids.sort((a, b) => a - b);
    return ids;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const [signer] = await ethers.getSigners();
  const user = signer.address;
  console.log("=== Coston2 QA: Market Listing Slots ===");
  console.log("Signer:", user);

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
    ADDRS.market,
    signer
  );

  const stake = await ethers.getContractAt(
    [
      "function positions(address) view returns (uint256 wflrStaked, uint256 pondStaked, uint256 earnedWflr, uint256 lockExpiry, uint256 lockMultiplier, uint256 rewardDebt, uint256 lastUpdateTime)"
    ],
    ADDRS.stake,
    signer
  );

  const nft = await ethers.getContractAt(
    [
      "function balanceOf(address owner) view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
      "function ownerOf(uint256 tokenId) view returns (address)",
      "function isApprovedForAll(address owner, address operator) view returns (bool)",
      "function setApprovalForAll(address operator, bool approved) external",
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
    ],
    ADDRS.tadz,
    signer
  );

  const slotRaw = await market.listingFlrPerSlot();
  const [used0, max0, remaining0] = await market.getListingUsage(user);
  const bonusOriginal = await market.bonusListingSlots(user);
  const limit0 = await market.getListingLimit(user);
  const pos = await stake.positions(user);
  const whitelisted = await market.whitelisted(ADDRS.tadz);

  console.log("listingFlrPerSlot:", ethers.formatEther(slotRaw), "FLR");
  console.log("usage before:", `${used0}/${max0}`, "remaining", remaining0.toString());
  console.log("bonusOriginal:", bonusOriginal.toString());
  console.log("limit before:", limit0.toString());
  console.log("stake wflr:", ethers.formatEther(pos.wflrStaked));
  console.log("collection whitelisted:", whitelisted);

  assert(whitelisted, "Tadz collection is not whitelisted on market");
  assert(pos.wflrStaked > 0n, "Signer has no active stake position (cannot list for rent)");

  const ownedTokenIds = await getOwnedTokenIds(nft, user);
  console.log("Owned Tadz:", ownedTokenIds.length);
  assert(ownedTokenIds.length > 0, "No Tadz owned by signer");

  const approvedForAll = await nft.isApprovedForAll(user, ADDRS.market);
  if (!approvedForAll) {
    console.log("Setting approvalForAll...");
    const tx = await nft.setApprovalForAll(ADDRS.market, true);
    await tx.wait();
  }

  const available = [];
  for (const tokenId of ownedTokenIds) {
    const sale = await market.listings(ADDRS.tadz, tokenId);
    const rent = await market.rentalListings(ADDRS.tadz, tokenId);
    const listedForSale = sale.seller !== ethers.ZeroAddress;
    const listedForRent = rent.isActive;
    if (!listedForSale && !listedForRent) available.push(tokenId);
  }
  console.log("Available unlisted Tadz:", available.length);
  assert(available.length > 0, "No available unlisted Tadz to run QA");

  const listedDuringQa = [];
  let bonusChanged = false;

  try {
    // Compute stake-derived slots and set temporary bonus so exactly one new listing is allowed.
    const stakeSlots = max0 > bonusOriginal ? max0 - bonusOriginal : 0n;
    const desiredMax = used0 + 1n;
    const requiredBonus = desiredMax > stakeSlots ? desiredMax - stakeSlots : 0n;

    if (requiredBonus !== bonusOriginal) {
      console.log("Setting temp bonus slots:", requiredBonus.toString());
      const tx = await market.setBonusListingSlots(user, requiredBonus);
      await tx.wait();
      bonusChanged = true;
    }

    const [used1, max1] = await market.getListingUsage(user);
    console.log("usage after temp bonus:", `${used1}/${max1}`);
    assert(max1 >= used1 + 1n, "Could not open one available slot for success-path listing");

    // Success path: first listing should succeed.
    const tokenA = available[0];
    console.log(`Listing token ${tokenA} for rent (expect success)...`);
    {
      const tx = await market.listForRent(ADDRS.tadz, tokenA, DAILY_RATE, COMMITMENT_DAYS);
      await tx.wait();
      listedDuringQa.push(tokenA);
    }

    const rentA = await market.rentalListings(ADDRS.tadz, tokenA);
    assert(rentA.isActive, `Token ${tokenA} was not active after listing`);
    assert(rentA.owner.toLowerCase() === user.toLowerCase(), `Token ${tokenA} owner mismatch after listing`);

    const [used2, max2] = await market.getListingUsage(user);
    console.log("usage after first listing:", `${used2}/${max2}`);

    // Tighten to cap exactly at current usage, then attempt second listing.
    const requiredBonusAtCap = used2 > stakeSlots ? used2 - stakeSlots : 0n;
    if (requiredBonusAtCap !== requiredBonus) {
      console.log("Adjusting bonus to exact cap:", requiredBonusAtCap.toString());
      const tx = await market.setBonusListingSlots(user, requiredBonusAtCap);
      await tx.wait();
    }

    if (available.length < 2) {
      console.log("Skipping second-listing fail path: only one available token.");
    } else {
      const tokenB = available[1];
      console.log(`Listing token ${tokenB} for rent (expect revert: Listing slots exceeded)...`);
      let failedAsExpected = false;
      try {
        const tx = await market.listForRent(ADDRS.tadz, tokenB, DAILY_RATE, COMMITMENT_DAYS);
        await tx.wait();
      } catch (err) {
        const msg = String(err?.shortMessage || err?.reason || err?.message || "");
        if (msg.includes("Listing slots exceeded")) {
          failedAsExpected = true;
          console.log("Observed expected revert:", msg);
        } else {
          throw new Error(`Unexpected revert message for cap test: ${msg}`);
        }
      }
      assert(failedAsExpected, "Second listing did not fail at cap as expected");
    }

    console.log("QA RESULT: PASS");
  } finally {
    // Cleanup: cancel any listings created in this QA run.
    for (const tokenId of listedDuringQa) {
      try {
        console.log(`Cleanup: cancel rental listing token ${tokenId}...`);
        const tx = await market.cancelRentalListing(ADDRS.tadz, tokenId);
        await tx.wait();
      } catch (err) {
        console.error(`Cleanup failed for token ${tokenId}:`, err?.shortMessage || err?.reason || err?.message || err);
      }
    }

    // Restore original bonus slots.
    if (bonusChanged) {
      try {
        console.log("Cleanup: restoring original bonus slots =", bonusOriginal.toString());
        const tx = await market.setBonusListingSlots(user, bonusOriginal);
        await tx.wait();
      } catch (err) {
        console.error("Cleanup failed while restoring bonus slots:", err?.shortMessage || err?.reason || err?.message || err);
      }
    }
  }

  const [usedF, maxF, remF] = await market.getListingUsage(user);
  const bonusF = await market.bonusListingSlots(user);
  console.log("Final usage:", `${usedF}/${maxF}`, "remaining", remF.toString());
  console.log("Final bonus slots:", bonusF.toString());
  console.log("Done for", short(user));
}

main().catch((error) => {
  console.error("QA RESULT: FAIL");
  console.error(error);
  process.exitCode = 1;
});

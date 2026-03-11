const { ethers } = require("hardhat");

/**
 * Usage:
 *   npx hardhat run scripts/test-og-sale-flow-coston2.js --network coston2 -- <sale>
 *
 * Optional env:
 *   OG_SALE_EXECUTE=1            -> send real buy txs
 *   OG_SALE_TEST_COLLECTIONS=0xA,0xB,0xC
 */
async function main() {
  const [user] = await ethers.getSigners();
  const [saleAddressArg] = process.argv.slice(2);
  const saleAddress = saleAddressArg || process.env.OG_SALE_ADDRESS;
  if (!saleAddress) throw new Error("Missing <sale> arg");

  const sale = await ethers.getContractAt(
    [
      "function getCollections() view returns (address[])",
      "function getCollectionInfo(address) view returns (bool enabled,uint64 sold,uint256 inventory,uint128 basePriceWei,uint128 stepPriceWei)",
      "function quoteCurrent(address) view returns (uint256)",
      "function quoteBuy(address,uint256) view returns (uint256)",
      "function quoteBundle(address[]) view returns (uint256 rawPrice, uint256 discountedPrice)",
      "function buySingle(address,uint256) payable",
      "function buyBundle(address[],uint256) payable",
      "function bundleDiscountBps() view returns (uint16)",
    ],
    saleAddress,
    user
  );

  const execute = process.env.OG_SALE_EXECUTE === "1";
  console.log("Tester:", user.address);
  console.log("Sale:", saleAddress);
  console.log("Execute txs:", execute ? "YES" : "NO (static/read only)");

  let collections = [];
  if (process.env.OG_SALE_TEST_COLLECTIONS) {
    collections = process.env.OG_SALE_TEST_COLLECTIONS.split(",").map((x) => x.trim()).filter(Boolean);
  } else {
    collections = await sale.getCollections();
  }

  if (collections.length === 0) {
    throw new Error("No collections configured");
  }

  const active = [];
  for (const collection of collections) {
    const info = await sale.getCollectionInfo(collection);
    const current = await sale.quoteCurrent(collection);
    console.log({
      collection,
      enabled: info.enabled,
      sold: info.sold.toString(),
      inventory: info.inventory.toString(),
      base: ethers.formatEther(info.basePriceWei),
      step: ethers.formatEther(info.stepPriceWei),
      current: ethers.formatEther(current),
    });
    if (info.enabled && info.inventory > 0n) active.push(collection);
  }

  if (active.length === 0) {
    throw new Error("No active collections with inventory");
  }

  const c0 = active[0];
  const qSingle = await sale.quoteBuy(c0, 1);
  console.log("Single quote", c0, "=", ethers.formatEther(qSingle), "FLR");

  // Dry run using static call first.
  await sale.buySingle.staticCall(c0, qSingle + (qSingle * 300n) / 10_000n, { value: qSingle + (qSingle * 300n) / 10_000n });
  console.log("buySingle staticCall ✓");

  if (active.length >= 2) {
    const [raw, discounted] = await sale.quoteBundle(active.slice(0, 3));
    const discountBps = await sale.bundleDiscountBps();
    console.log("Bundle quote raw:", ethers.formatEther(raw), "discounted:", ethers.formatEther(discounted), `(${discountBps} bps)`);
    await sale.buyBundle.staticCall(active.slice(0, 3), discounted + (discounted * 300n) / 10_000n, {
      value: discounted + (discounted * 300n) / 10_000n
    });
    console.log("buyBundle staticCall ✓");
  }

  if (execute) {
    const maxSingle = qSingle + (qSingle * 300n) / 10_000n;
    const tx = await sale.buySingle(c0, maxSingle, { value: maxSingle });
    const receipt = await tx.wait();
    console.log("buySingle tx:", receipt.hash);

    if (active.length >= 2) {
      const [, discounted] = await sale.quoteBundle(active.slice(0, 3));
      const maxBundle = discounted + (discounted * 300n) / 10_000n;
      const tx2 = await sale.buyBundle(active.slice(0, 3), maxBundle, { value: maxBundle });
      const receipt2 = await tx2.wait();
      console.log("buyBundle tx:", receipt2.hash);
    }
  }

  console.log("OGSale flow test complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

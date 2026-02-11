const { ethers } = require("hardhat");

const STAKE_ADDR = "0xd973E756fCcB640108aAf17B3465a387802A6E49";
const POND_ADDR = "0x410c65DAb32709046B1BA63caBEB4d2824D9E902";
const GAS = { gasLimit: 500000 };

function fmt(val) { return ethers.formatEther(val); }

async function main() {
  const [user] = await ethers.getSigners();
  console.log("Tester:", user.address);
  console.log("Balance:", fmt(await ethers.provider.getBalance(user.address)), "C2FLR\n");

  const stake = await ethers.getContractAt("ToadzStake", STAKE_ADDR);
  const pond = await ethers.getContractAt("POND", POND_ADDR);

  // Check starting state (position already exists from previous run + debug)
  const pos0 = await stake.positions(user.address);
  console.log("--- Current Position ---");
  await printPosition(user.address, stake);

  if (pos0.wflrStaked === 0n) {
    console.log("ERROR: No position found. Run setup first.");
    return;
  }

  // The debug script already did one successful addToStake (100 + 100 = 200 now)
  // Let's verify then run Test 2 (tier upgrade) and Test 3 (lower tier keeps multiplier)

  // ===== TEST 1: addToStake — same tier =====
  console.log("\n========================================");
  console.log("TEST 1: addToStake — SAME TIER (keep lock)");
  console.log("========================================");

  const posBefore1 = await stake.positions(user.address);
  const add1 = ethers.parseEther("50");
  console.log("Adding:", fmt(add1), "WNat, tier 0 (1x)");

  let tx = await stake.addToStake(add1, 0, GAS);
  await tx.wait();
  console.log("TX confirmed ✓");

  const posAfter1 = await stake.positions(user.address);
  await printPosition(user.address, stake);

  const t1_wflr = posAfter1.wflrStaked === posBefore1.wflrStaked + add1;
  const t1_lock = posAfter1.lockExpiry === posBefore1.lockExpiry;
  const t1_mult = posAfter1.lockMultiplier === posBefore1.lockMultiplier;
  console.log("wflrStaked correct:      ", t1_wflr ? "PASS ✓" : "FAIL ✗");
  console.log("lockExpiry unchanged:    ", t1_lock ? "PASS ✓" : "FAIL ✗");
  console.log("lockMultiplier unchanged:", t1_mult ? "PASS ✓" : "FAIL ✗");

  // ===== TEST 2: addToStake — higher tier (upgrade to 4x) =====
  console.log("\n========================================");
  console.log("TEST 2: addToStake — UPGRADE TO TIER 2 (4x, 360 min)");
  console.log("========================================");

  const posBefore2 = await stake.positions(user.address);
  const add2 = ethers.parseEther("50");
  console.log("Adding:", fmt(add2), "WNat, tier 2 (4x)");
  console.log("Current multiplier:", posBefore2.lockMultiplier.toString() + "x");

  tx = await stake.addToStake(add2, 2, GAS);
  await tx.wait();
  console.log("TX confirmed ✓");

  const posAfter2 = await stake.positions(user.address);
  await printPosition(user.address, stake);

  const t2_wflr = posAfter2.wflrStaked === posBefore2.wflrStaked + add2;
  const t2_mult = posAfter2.lockMultiplier === 4n;
  const t2_lock = posAfter2.lockExpiry > posBefore2.lockExpiry;
  const t2_weighted = await stake.getWeightedShares(user.address);
  const expectedWeighted = posAfter2.wflrStaked * 4n;
  const t2_shares = t2_weighted === expectedWeighted;
  console.log("wflrStaked correct:  ", t2_wflr ? "PASS ✓" : "FAIL ✗");
  console.log("multiplier now 4x:   ", t2_mult ? "PASS ✓" : "FAIL ✗");
  console.log("lockExpiry reset:    ", t2_lock ? "PASS ✓" : "FAIL ✗");
  console.log("weightedShares = wflr*4:", t2_shares ? "PASS ✓" : "FAIL ✗",
    `(${fmt(t2_weighted)} vs ${fmt(expectedWeighted)})`);

  // ===== TEST 3: addToStake — lower tier (should keep 4x) =====
  console.log("\n========================================");
  console.log("TEST 3: addToStake — LOWER TIER (should keep 4x)");
  console.log("========================================");

  const posBefore3 = await stake.positions(user.address);
  const add3 = ethers.parseEther("50");
  console.log("Adding:", fmt(add3), "WNat, tier 0 (1x) — should NOT downgrade");

  tx = await stake.addToStake(add3, 0, GAS);
  await tx.wait();
  console.log("TX confirmed ✓");

  const posAfter3 = await stake.positions(user.address);
  await printPosition(user.address, stake);

  const t3_wflr = posAfter3.wflrStaked === posBefore3.wflrStaked + add3;
  const t3_mult = posAfter3.lockMultiplier === 4n;
  const t3_lock = posAfter3.lockExpiry === posBefore3.lockExpiry;
  console.log("wflrStaked correct:      ", t3_wflr ? "PASS ✓" : "FAIL ✗");
  console.log("multiplier still 4x:     ", t3_mult ? "PASS ✓" : "FAIL ✗");
  console.log("lockExpiry unchanged:    ", t3_lock ? "PASS ✓" : "FAIL ✗");

  // ===== FINAL =====
  console.log("\n========================================");
  console.log("FINAL STATE");
  console.log("========================================");
  console.log("totalWflrStaked:", fmt(await stake.totalWflrStaked()));
  console.log("totalPondStaked:", fmt(await stake.totalPondStaked()));
  console.log("totalDeposited: ", fmt(await stake.totalDeposited(user.address)));
  await printPosition(user.address, stake);

  const allPassed = t1_wflr && t1_lock && t1_mult && t2_wflr && t2_mult && t2_lock && t2_shares && t3_wflr && t3_mult && t3_lock;
  console.log("\n" + (allPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"));
}

async function printPosition(user, stake) {
  const pos = await stake.positions(user);
  const weighted = await stake.getWeightedShares(user);
  const effective = await stake.getEffectiveShares(user);
  console.log("  wflrStaked:     ", fmt(pos.wflrStaked));
  console.log("  pondStaked:     ", fmt(pos.pondStaked));
  console.log("  earnedWflr:     ", fmt(pos.earnedWflr));
  console.log("  lockExpiry:     ", new Date(Number(pos.lockExpiry) * 1000).toISOString());
  console.log("  lockMultiplier: ", pos.lockMultiplier.toString() + "x");
  console.log("  weightedShares: ", fmt(weighted));
  console.log("  effectiveShares:", fmt(effective));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

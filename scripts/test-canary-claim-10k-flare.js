const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const canaryPath = process.env.CANARY_JSON || path.join(process.cwd(), "scripts", "tadz-canary-flare.json");
  if (!fs.existsSync(canaryPath)) throw new Error(`Missing canary file: ${canaryPath}`);
  const canary = JSON.parse(fs.readFileSync(canaryPath, "utf8"));

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const claimerAddr = canary.contracts.claimerProxy;
  const allocation = BigInt(canary.canary.allocation);
  const proof = canary.canary.proof || [];
  const batchSize = BigInt(process.env.BATCH_SIZE || "250");
  const targetTotal = BigInt(process.env.TARGET_TOTAL || "10000");

  const claimer = await ethers.getContractAt(
    [
      "function claimPartial(uint256 amount, uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claim(uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimed(address) view returns (uint256)",
      "function getClaimable(address user, uint256 totalAllocation, bytes32[] calldata proof) view returns (uint256)",
      "function availableTokens() view returns (uint256)"
    ],
    claimerAddr,
    signer
  );

  const beforeClaimed = await claimer.claimed(signerAddress);
  let remaining = await claimer.getClaimable(signerAddress, allocation, proof);
  const beforeAvail = await claimer.availableTokens();

  console.log("Signer:", signerAddress);
  console.log("Claimer:", claimerAddr);
  console.log("Allocation:", allocation.toString());
  console.log("Before claimed:", beforeClaimed.toString());
  console.log("Before claimable:", remaining.toString());
  console.log("Before available:", beforeAvail.toString());
  console.log("Batch size:", batchSize.toString());

  if (remaining < targetTotal) {
    throw new Error(`Claimable ${remaining.toString()} is below target ${targetTotal.toString()}`);
  }

  let batch = 0;
  let totalClaimedNow = 0n;
  let totalGasUsed = 0n;
  const t0 = Date.now();

  while (totalClaimedNow < targetTotal) {
    batch += 1;
    const step = targetTotal - totalClaimedNow > batchSize ? batchSize : targetTotal - totalClaimedNow;
    const latestBlock = await ethers.provider.getBlock("latest");
    const blockLimit = latestBlock?.gasLimit ? BigInt(latestBlock.gasLimit.toString()) : 15000000n;
    const maxGasLimit = blockLimit > 100000n ? blockLimit - 100000n : blockLimit;

    const est = await claimer.claimPartial.estimateGas(step, allocation, proof);
    const padded = (est * 110n) / 100n + 50000n;
    const gasLimit = padded < maxGasLimit ? padded : maxGasLimit;

    console.log(`[${batch}] claimPartial(${step}) est=${est} gasLimit=${gasLimit}`);
    const tx = await claimer.claimPartial(step, allocation, proof, { gasLimit });
    const rcpt = await tx.wait();

    totalClaimedNow += step;
    totalGasUsed += BigInt(rcpt.gasUsed.toString());
    remaining = await claimer.getClaimable(signerAddress, allocation, proof);
    console.log(`    tx=${tx.hash} gasUsed=${rcpt.gasUsed.toString()} progress=${totalClaimedNow.toString()}/${targetTotal.toString()} remaining=${remaining.toString()}`);
  }

  const afterClaimed = await claimer.claimed(signerAddress);
  const afterClaimable = await claimer.getClaimable(signerAddress, allocation, proof);
  const afterAvail = await claimer.availableTokens();
  const elapsedSec = Math.round((Date.now() - t0) / 1000);

  console.log("\nFinal:");
  console.log("  After claimed:", afterClaimed.toString());
  console.log("  After claimable:", afterClaimable.toString());
  console.log("  After available:", afterAvail.toString());
  console.log("  Batches:", batch);
  console.log("  Total gas used:", totalGasUsed.toString());
  console.log("  Elapsed (sec):", elapsedSec);

  if (afterClaimed < beforeClaimed + targetTotal) {
    throw new Error("Claimed total did not increase by full target.");
  }
  if (afterClaimable !== remaining) {
    throw new Error("Claimable mismatch at end.");
  }

  console.log("\nPASS: 10k claim succeeded in 250-sized batches.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


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
  if (signerAddress.toLowerCase() !== String(canary.deployer).toLowerCase()) {
    throw new Error(`Signer ${signerAddress} does not match canary deployer ${canary.deployer}`);
  }

  const allocation = BigInt(canary.canary.allocation);
  const proof = canary.canary.proof || [];

  const claimer = await ethers.getContractAt(
    [
      "function claim(uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimPartial(uint256 amount, uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimed(address) view returns (uint256)",
      "function getClaimable(address user, uint256 totalAllocation, bytes32[] calldata proof) view returns (uint256)",
      "function availableTokens() view returns (uint256)"
    ],
    canary.contracts.claimerProxy,
    signer
  );

  const beforeClaimed = await claimer.claimed(signerAddress);
  const beforeClaimable = await claimer.getClaimable(signerAddress, allocation, proof);
  const beforeAvailable = await claimer.availableTokens();
  const block = await ethers.provider.getBlock("latest");
  const blockGasLimit = BigInt(block?.gasLimit?.toString() || "0");
  const usableGas = (blockGasLimit * 90n) / 100n;

  console.log("Canary claimer:", canary.contracts.claimerProxy);
  console.log("Signer:", signerAddress);
  console.log("Claimed:", beforeClaimed.toString());
  console.log("Claimable:", beforeClaimable.toString());
  console.log("Available tokens:", beforeAvailable.toString());
  console.log("Block gas limit:", blockGasLimit.toString());
  console.log("Usable @90%:", usableGas.toString());

  const claimableNum = Number(beforeClaimable);
  const sampleTargets = [1, 10, 50, 100, 200, 300, 500, 700, 900].filter((x) => x <= claimableNum);
  const estimates = [];

  console.log("\nEstimate claimPartial gas:");
  for (const amt of sampleTargets) {
    try {
      const g = await claimer.claimPartial.estimateGas(BigInt(amt), allocation, proof);
      estimates.push({ amount: amt, gas: Number(g.toString()) });
      console.log(`  amount=${amt} => gas=${g.toString()}`);
    } catch (err) {
      console.log(`  amount=${amt} => estimate failed: ${err?.shortMessage || err?.message || "unknown"}`);
    }
  }

  if (estimates.length >= 2) {
    const a = estimates[0];
    const b = estimates[estimates.length - 1];
    const perToken = (b.gas - a.gas) / (b.amount - a.amount);
    const base = a.gas - perToken * a.amount;

    const projected10k = Math.round(base + perToken * 10000);
    const projected50k = Math.round(base + perToken * 50000);
    const maxSingleTx = Math.max(0, Math.floor((Number(usableGas) - base) / perToken));

    console.log("\nProjection from live mainnet canary estimates:");
    console.log("  approx base gas:", Math.round(base));
    console.log("  approx gas per Tadz:", perToken.toFixed(0));
    console.log("  projected gas for 10,000 in one tx:", projected10k);
    console.log("  projected gas for 50,000 in one tx:", projected50k);
    console.log("  max Tadz in one tx (@90% block gas):", maxSingleTx);
    console.log("  10k one tx feasible:", projected10k <= Number(usableGas) ? "YES" : "NO");
    console.log("  50k one tx feasible:", projected50k <= Number(usableGas) ? "YES" : "NO");
  }

  const liveAmount = BigInt(process.env.CANARY_LIVE_AMOUNT || "700");
  if (beforeClaimable >= liveAmount) {
    const est = await claimer.claimPartial.estimateGas(liveAmount, allocation, proof);
    const padded = (est * 110n) / 100n + 50000n;
    const maxGasLimit = blockGasLimit > 100000n ? blockGasLimit - 100000n : blockGasLimit;
    const gasLimit = padded < maxGasLimit ? padded : maxGasLimit;
    console.log(`\nSubmitting live claimPartial(${liveAmount.toString()})...`);
    console.log("estimated gas:", est.toString());
    console.log("tx gas limit:", gasLimit.toString());
    const tx = await claimer.claimPartial(liveAmount, allocation, proof, { gasLimit });
    console.log("tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("status:", receipt.status);
    console.log("gasUsed:", receipt.gasUsed.toString());

    const afterClaimed = await claimer.claimed(signerAddress);
    const afterClaimable = await claimer.getClaimable(signerAddress, allocation, proof);
    const afterAvailable = await claimer.availableTokens();
    console.log("After claimed:", afterClaimed.toString());
    console.log("After claimable:", afterClaimable.toString());
    console.log("After available tokens:", afterAvailable.toString());
  } else {
    console.log(`\nSkipping live claim tx: claimable ${beforeClaimable.toString()} < ${liveAmount.toString()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const { ethers } = require("hardhat");

async function main() {
  const proxy = process.env.STAKE_PROXY;
  if (!proxy) {
    throw new Error("Missing STAKE_PROXY env");
  }

  const minFlr = process.env.MIN_DEPOSIT_FLR;
  const maxFlr = process.env.MAX_DEPOSIT_FLR;
  if (!minFlr || !maxFlr) {
    throw new Error("Missing MIN_DEPOSIT_FLR or MAX_DEPOSIT_FLR env");
  }

  const minWei = ethers.parseEther(minFlr);
  const maxWei = ethers.parseEther(maxFlr);

  const signer = (await ethers.getSigners())[0];
  console.log("Signer:", signer.address);
  console.log("Proxy:", proxy);
  console.log("Target min:", minFlr, "FLR");
  console.log("Target max:", maxFlr, "FLR");

  const stake = await ethers.getContractAt(
    ["function minDeposit() view returns (uint256)", "function maxDeposit() view returns (uint256)", "function setMinMax(uint256 _min, uint256 _max)"],
    proxy,
    signer
  );

  const beforeMin = await stake.minDeposit();
  const beforeMax = await stake.maxDeposit();
  console.log("Before min:", ethers.formatEther(beforeMin));
  console.log("Before max:", ethers.formatEther(beforeMax));

  const tx = await stake.setMinMax(minWei, maxWei);
  console.log("Tx:", tx.hash);
  await tx.wait();

  const afterMin = await stake.minDeposit();
  const afterMax = await stake.maxDeposit();
  console.log("After min:", ethers.formatEther(afterMin));
  console.log("After max:", ethers.formatEther(afterMax));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const { ethers } = require("hardhat");

async function main() {
  const proxy = process.env.STAKE_PROXY;
  const minFlr = process.env.MIN_DEPOSIT_FLR;
  if (!proxy || !minFlr) {
    throw new Error("Missing STAKE_PROXY or MIN_DEPOSIT_FLR env");
  }

  const signer = (await ethers.getSigners())[0];
  const stake = await ethers.getContractAt(
    ["function minDeposit() view returns (uint256)", "function setMinDeposit(uint256 _min)"],
    proxy,
    signer
  );

  const target = ethers.parseEther(minFlr);
  const before = await stake.minDeposit();
  console.log("Signer:", signer.address);
  console.log("Proxy:", proxy);
  console.log("Before min:", ethers.formatEther(before));
  console.log("Target min:", minFlr);

  const tx = await stake.setMinDeposit(target);
  console.log("Tx:", tx.hash);
  await tx.wait();

  const after = await stake.minDeposit();
  console.log("After min:", ethers.formatEther(after));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

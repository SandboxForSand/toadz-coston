const { ethers } = require("hardhat");

async function main() {
  const proxy = process.env.STAKE_PROXY || "0xd973E756fCcB640108aAf17B3465a387802A6E49";
  const lock90 = Number(process.env.LOCK_90_SECONDS || 86400);
  const lock180 = Number(process.env.LOCK_180_SECONDS || 172800);
  const lock365 = Number(process.env.LOCK_365_SECONDS || 604800);

  if (!Number.isFinite(lock90) || !Number.isFinite(lock180) || !Number.isFinite(lock365)) {
    throw new Error("Invalid lock values");
  }

  const signer = (await ethers.getSigners())[0];
  const stake = await ethers.getContractAt(
    [
      "function LOCK_90_DAYS() view returns (uint256)",
      "function LOCK_180_DAYS() view returns (uint256)",
      "function LOCK_365_DAYS() view returns (uint256)",
      "function setLockPeriods(uint256 _lock90, uint256 _lock180, uint256 _lock365) external"
    ],
    proxy,
    signer
  );

  const [before90, before180, before365] = await Promise.all([
    stake.LOCK_90_DAYS(),
    stake.LOCK_180_DAYS(),
    stake.LOCK_365_DAYS()
  ]);

  console.log("Signer:", signer.address);
  console.log("Stake proxy:", proxy);
  console.log("Before:", before90.toString(), before180.toString(), before365.toString());
  console.log("Target:", lock90, lock180, lock365);

  const tx = await stake.setLockPeriods(lock90, lock180, lock365);
  console.log("Tx:", tx.hash);
  await tx.wait();

  const [after90, after180, after365] = await Promise.all([
    stake.LOCK_90_DAYS(),
    stake.LOCK_180_DAYS(),
    stake.LOCK_365_DAYS()
  ]);

  console.log("After:", after90.toString(), after180.toString(), after365.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

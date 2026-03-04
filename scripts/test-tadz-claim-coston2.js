const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  if (network.name !== "coston2") {
    throw new Error("This script is intended for --network coston2");
  }

  const [signer] = await ethers.getSigners();
  const me = signer.address.toLowerCase();

  const stackPath = process.env.STACK_JSON || path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  const defaultMerklePath = fs.existsSync(path.join(process.cwd(), "scripts", "tadz-merkle-coston2.json"))
    ? path.join(process.cwd(), "scripts", "tadz-merkle-coston2.json")
    : path.join(process.cwd(), "merkle-tree.json");
  const merklePath = process.env.MERKLE_JSON || defaultMerklePath;

  if (!fs.existsSync(stackPath)) throw new Error(`Missing stack file: ${stackPath}`);
  if (!fs.existsSync(merklePath)) throw new Error(`Missing merkle file: ${merklePath}`);

  const stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));
  const merkle = JSON.parse(fs.readFileSync(merklePath, "utf8"));
  const proofEntry = merkle.proofs?.[me];
  if (!proofEntry) throw new Error(`No proof for signer ${me}`);

  const claimer = await ethers.getContractAt(
    [
      "function claim(uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimed(address) view returns (uint256)",
      "function merkleRoot() view returns (bytes32)"
    ],
    stack.claimer,
    signer
  );

  const before = await claimer.claimed(signer.address);
  const root = await claimer.merkleRoot();
  console.log("Signer:", signer.address);
  console.log("Claimer:", stack.claimer);
  console.log("Merkle root:", root);
  console.log("Before claimed:", before.toString());
  console.log("Attempting claim allocation:", proofEntry.tadzAllocation);

  const tx = await claimer.claim(proofEntry.tadzAllocation, proofEntry.proof);
  console.log("Tx:", tx.hash);
  await tx.wait();

  const after = await claimer.claimed(signer.address);
  console.log("After claimed:", after.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

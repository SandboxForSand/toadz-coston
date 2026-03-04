const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  if (network.name !== "coston2") {
    throw new Error("This script is intended for --network coston2");
  }

  const [signer] = await ethers.getSigners();
  const stackPath = process.env.STACK_JSON || path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  if (!fs.existsSync(stackPath)) throw new Error(`Missing stack file: ${stackPath}`);
  const stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));

  const ogCollection = await ethers.getContractAt(
    [
      "function ownerOf(uint256 tokenId) view returns (address)",
      "function setApprovalForAll(address operator, bool approved) external",
      "function isApprovedForAll(address owner, address operator) view returns (bool)"
    ],
    stack.ogCollection,
    signer
  );
  const ogVault = await ethers.getContractAt(
    [
      "function lock(address collection, uint256 tokenId) external",
      "function getOGCount(address user) view returns (uint256)"
    ],
    stack.ogVault,
    signer
  );
  const claimer = await ethers.getContractAt(
    [
      "function claim(uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimed(address) view returns (uint256)",
      "function getClaimable(address user, uint256 totalAllocation, bytes32[] calldata proof) view returns (uint256)",
      "function getAutoAllocation(address user) view returns (uint256)",
      "function ogVault() view returns (address)"
    ],
    stack.claimer,
    signer
  );
  const tadz = await ethers.getContractAt(
    ["function balanceOf(address owner) view returns (uint256)"],
    stack.tadzCollection,
    signer
  );

  console.log("Signer:", signer.address);
  console.log("Claimer ogVault:", await claimer.ogVault());
  console.log("OG count before:", (await ogVault.getOGCount(signer.address)).toString());
  console.log("Claimed before:", (await claimer.claimed(signer.address)).toString());
  console.log("Auto allocation before:", (await claimer.getAutoAllocation(signer.address)).toString());

  // Lock token #2 if signer still owns it.
  const owner2 = await ogCollection.ownerOf(2).catch(() => ethers.ZeroAddress);
  if (owner2.toLowerCase() === signer.address.toLowerCase()) {
    const approved = await ogCollection.isApprovedForAll(signer.address, stack.ogVault);
    if (!approved) {
      const approveTx = await ogCollection.setApprovalForAll(stack.ogVault, true);
      await approveTx.wait();
    }

    const lockTx = await ogVault.lock(stack.ogCollection, 2);
    await lockTx.wait();
    console.log("Locked token #2:", lockTx.hash);
  } else {
    console.log("Token #2 not owned by signer, skipping lock step.");
  }

  const ogAfter = await ogVault.getOGCount(signer.address);
  const claimedBeforeClaim = await claimer.claimed(signer.address);
  const allocation = await claimer.getAutoAllocation(signer.address);
  const claimable = await claimer.getClaimable(signer.address, 0, []);
  console.log("OG count after:", ogAfter.toString());
  console.log("Auto allocation after:", allocation.toString());
  console.log("Claimable:", claimable.toString());

  if (claimable > 0n) {
    const tx = await claimer.claim(0, []);
    await tx.wait();
    console.log("Claim tx:", tx.hash);
  } else {
    console.log("Nothing claimable.");
  }

  const claimedAfter = await claimer.claimed(signer.address);
  const tadzBal = await tadz.balanceOf(signer.address);
  console.log("Claimed before tx:", claimedBeforeClaim.toString());
  console.log("Claimed after tx:", claimedAfter.toString());
  console.log("Signer Tadz balance:", tadzBal.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


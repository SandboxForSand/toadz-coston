const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  if (network.name !== "coston2") {
    throw new Error("Run with --network coston2");
  }

  const [signer] = await ethers.getSigners();
  const stackPath = process.env.STACK_JSON || path.join(process.cwd(), "scripts", "tadz-automation-coston2.json");
  if (!fs.existsSync(stackPath)) throw new Error(`Missing stack file: ${stackPath}`);
  const stack = JSON.parse(fs.readFileSync(stackPath, "utf8"));

  const ogCollection = await ethers.getContractAt(
    [
      "function nextTokenId() view returns (uint256)",
      "function mintBatch(address to, uint256 count) external returns (uint256 firstId, uint256 lastId)",
      "function setApprovalForAll(address operator, bool approved) external",
      "function isApprovedForAll(address owner, address operator) view returns (bool)"
    ],
    stack.ogCollection,
    signer
  );

  const ogVault = await ethers.getContractAt(
    [
      "function lockBatch(address collection, uint256[] calldata tokenIds) external",
      "function getOGCount(address user) view returns (uint256)"
    ],
    stack.ogVault,
    signer
  );

  const claimer = await ethers.getContractAt(
    [
      "function claim(uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimPartial(uint256 amount, uint256 totalAllocation, bytes32[] calldata proof) external",
      "function claimed(address) view returns (uint256)",
      "function getAutoAllocation(address user) view returns (uint256)",
      "function getClaimable(address user, uint256 totalAllocation, bytes32[] calldata proof) view returns (uint256)",
      "function availableTokens() view returns (uint256)"
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
  console.log("Claimer:", stack.claimer);

  const beforeClaimed = await claimer.claimed(signer.address);
  const beforeAlloc = await claimer.getAutoAllocation(signer.address);
  const beforeClaimable = await claimer.getClaimable(signer.address, 0, []);
  const beforeTadzBal = await tadz.balanceOf(signer.address);
  const beforeAvail = await claimer.availableTokens();
  const beforeOgCount = await ogVault.getOGCount(signer.address);

  console.log("Before:");
  console.log("  OG locked:", beforeOgCount.toString());
  console.log("  Auto allocation:", beforeAlloc.toString());
  console.log("  Claimed:", beforeClaimed.toString());
  console.log("  Claimable:", beforeClaimable.toString());
  console.log("  Wallet Tadz:", beforeTadzBal.toString());
  console.log("  Claimer available tokens:", beforeAvail.toString());

  const mintCount = 2n; // +6 Tadz allocation
  const nextTokenId = await ogCollection.nextTokenId();
  const mintTx = await ogCollection.mintBatch(signer.address, Number(mintCount));
  await mintTx.wait();
  const tokenIdsToLock = [];
  for (let i = 0n; i < mintCount; i++) {
    tokenIdsToLock.push(nextTokenId + i);
  }
  console.log(`Minted OG token IDs: ${tokenIdsToLock.map((x) => x.toString()).join(", ")}`);

  const approved = await ogCollection.isApprovedForAll(signer.address, stack.ogVault);
  if (!approved) {
    const approveTx = await ogCollection.setApprovalForAll(stack.ogVault, true);
    await approveTx.wait();
    console.log("Approved OGVault for OG collection.");
  }

  const lockTx = await ogVault.lockBatch(stack.ogCollection, tokenIdsToLock);
  await lockTx.wait();
  console.log("Locked new OG tokens:", lockTx.hash);

  const midClaimed = await claimer.claimed(signer.address);
  const midAlloc = await claimer.getAutoAllocation(signer.address);
  const midClaimable = await claimer.getClaimable(signer.address, 0, []);
  const midTadzBal = await tadz.balanceOf(signer.address);
  const midAvail = await claimer.availableTokens();

  console.log("After lock:");
  console.log("  Auto allocation:", midAlloc.toString());
  console.log("  Claimed:", midClaimed.toString());
  console.log("  Claimable:", midClaimable.toString());
  console.log("  Wallet Tadz:", midTadzBal.toString());
  console.log("  Claimer available tokens:", midAvail.toString());

  if (midClaimable < 3n) {
    throw new Error(`Expected claimable >= 3 after lock, got ${midClaimable.toString()}`);
  }

  const partialAmount = 2n;
  const partialTx = await claimer.claimPartial(partialAmount, 0, []);
  await partialTx.wait();
  console.log(`claimPartial(${partialAmount}) tx:`, partialTx.hash);

  const afterPartialClaimed = await claimer.claimed(signer.address);
  const afterPartialClaimable = await claimer.getClaimable(signer.address, 0, []);
  const afterPartialTadzBal = await tadz.balanceOf(signer.address);
  const afterPartialAvail = await claimer.availableTokens();

  console.log("After partial claim:");
  console.log("  Claimed:", afterPartialClaimed.toString());
  console.log("  Claimable:", afterPartialClaimable.toString());
  console.log("  Wallet Tadz:", afterPartialTadzBal.toString());
  console.log("  Claimer available tokens:", afterPartialAvail.toString());

  if (afterPartialClaimed !== midClaimed + partialAmount) {
    throw new Error("Partial claim did not increment claimed by expected amount.");
  }
  if (afterPartialTadzBal !== midTadzBal + partialAmount) {
    throw new Error("Partial claim did not transfer expected number of Tadz.");
  }

  const finalTx = await claimer.claim(0, []);
  await finalTx.wait();
  console.log("Final full claim tx:", finalTx.hash);

  const finalClaimed = await claimer.claimed(signer.address);
  const finalAlloc = await claimer.getAutoAllocation(signer.address);
  const finalClaimable = await claimer.getClaimable(signer.address, 0, []);
  const finalTadzBal = await tadz.balanceOf(signer.address);
  const finalAvail = await claimer.availableTokens();

  console.log("Final:");
  console.log("  Auto allocation:", finalAlloc.toString());
  console.log("  Claimed:", finalClaimed.toString());
  console.log("  Claimable:", finalClaimable.toString());
  console.log("  Wallet Tadz:", finalTadzBal.toString());
  console.log("  Claimer available tokens:", finalAvail.toString());

  if (finalClaimed !== finalAlloc) {
    throw new Error("Final claimed does not match allocation.");
  }
  if (finalClaimable !== 0n) {
    throw new Error("Final claimable should be 0.");
  }

  console.log("\nPASS: partial claim + full claim flow works on upgraded claimer.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


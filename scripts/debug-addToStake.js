const { ethers } = require("hardhat");

const WNAT = "0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273";
const POND_ADDR = "0x410c65DAb32709046B1BA63caBEB4d2824D9E902";
const STAKE_ADDR = "0xd973E756fCcB640108aAf17B3465a387802A6E49";

async function main() {
  const [user] = await ethers.getSigners();
  const stakeContract = await ethers.getContractAt("ToadzStake", STAKE_ADDR);

  const addAmount = ethers.parseEther("100");

  console.log("Sending addToStake with explicit gas limit...");
  try {
    const tx = await stakeContract.addToStake(addAmount, 0, { gasLimit: 500000 });
    console.log("TX hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Status:", receipt.status);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Logs:", receipt.logs.length);
    for (const log of receipt.logs) {
      console.log("  Log:", log.address, log.topics[0]?.substring(0, 10));
    }
  } catch (err) {
    console.log("Error:", err.shortMessage || err.message?.substring(0, 300));
    if (err.receipt) {
      console.log("Receipt status:", err.receipt.status);
      console.log("Gas used:", err.receipt.gasUsed.toString());

      // Try to decode the revert
      try {
        const code = await ethers.provider.call({
          to: STAKE_ADDR,
          data: stakeContract.interface.encodeFunctionData("addToStake", [addAmount, 0]),
          from: user.address,
        });
        console.log("eth_call result:", code);
      } catch (callErr) {
        console.log("eth_call revert:", callErr.reason || callErr.message?.substring(0, 300));
      }
    }
  }
}

main().catch(console.error);

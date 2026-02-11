const { ethers } = require("hardhat");

const CONTRACTS = {
  WFLR: "0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273",
  POND: "0x410c65DAb32709046B1BA63caBEB4d2824D9E902",
  TOADZ_STAKE: "0xd973E756fCcB640108aAf17B3465a387802A6E49",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "C2FLR");

  const stake = await ethers.getContractAt(
    ["function owner() view returns (address)", "function setZapContract(address) external", "function zapContract() view returns (address)"],
    CONTRACTS.TOADZ_STAKE
  );
  const pond = await ethers.getContractAt(
    ["function owner() view returns (address)", "function setZapContract(address) external", "function zapContract() view returns (address)"],
    CONTRACTS.POND
  );

  console.log("Stake owner:", await stake.owner());
  console.log("POND owner:", await pond.owner());
  console.log("Current stake zap:", await stake.zapContract());
  console.log("Current pond zap:", await pond.zapContract());

  const Zap = await ethers.getContractFactory("ZapDeposit");
  const zap = await Zap.deploy(CONTRACTS.WFLR, CONTRACTS.POND, CONTRACTS.TOADZ_STAKE);
  await zap.waitForDeployment();
  const zapAddress = await zap.getAddress();
  console.log("Zap deployed:", zapAddress);

  const tx1 = await stake.setZapContract(zapAddress);
  await tx1.wait();
  console.log("stake.setZapContract ✓");

  const tx2 = await pond.setZapContract(zapAddress);
  await tx2.wait();
  console.log("pond.setZapContract ✓");

  console.log("Final stake zap:", await stake.zapContract());
  console.log("Final pond zap:", await pond.zapContract());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


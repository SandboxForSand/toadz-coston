const { ethers } = require("hardhat");

async function main() {
  const WFLR = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";
  const POND = "0x9c71462248801D430A7d06de502D2324abCE517E";
  const TOADZSTAKE = "0xef3722efB994bb7657616763ffD7e70f5E1b2999";
  
  console.log("Deploying ZapDeposit...");
  
  const Zap = await ethers.getContractFactory("ZapDeposit");
  const zap = await Zap.deploy(WFLR, POND, TOADZSTAKE);
  await zap.waitForDeployment();
  
  console.log("ZapDeposit deployed:", await zap.getAddress());
}

main().catch(console.error);

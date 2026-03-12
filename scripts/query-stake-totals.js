const { ethers, network } = require('hardhat');

const ADDR = {
  flare: '0xef3722efB994bb7657616763ffD7e70f5E1b2999',
  coston2: '0xd973E756fCcB640108aAf17B3465a387802A6E49'
};

async function main() {
  const stake = await ethers.getContractAt([
    'function totalWflrStaked() view returns (uint256)',
    'function totalPondStaked() view returns (uint256)',
    'function totalPGSDistributed() view returns (uint256)',
    'function totalFtsoRewardsClaimed() view returns (uint256)',
    'function poolCap() view returns (uint256)'
  ], ADDR[network.name]);

  const [w,p,pgs,ftso,cap] = await Promise.all([
    stake.totalWflrStaked(),
    stake.totalPondStaked(),
    stake.totalPGSDistributed(),
    stake.totalFtsoRewardsClaimed(),
    stake.poolCap()
  ]);

  console.log(JSON.stringify({
    network: network.name,
    totalWflrStaked: Number(ethers.formatEther(w)),
    totalPondStaked: Number(ethers.formatEther(p)),
    totalPGSDistributed: Number(ethers.formatEther(pgs)),
    totalFtsoRewardsClaimed: Number(ethers.formatEther(ftso)),
    poolCap: Number(ethers.formatEther(cap))
  }, null, 2));
}

main().catch((e)=>{console.error(e);process.exit(1);});

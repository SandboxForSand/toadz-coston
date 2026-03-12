const { ethers, network } = require('hardhat');

const ADDR = {
  coston2: '0x410c65DAb32709046B1BA63caBEB4d2824D9E902',
  flare: '0x9c71462248801D430A7d06de502D2324abCE517E'
};

async function main() {
  const addr = ADDR[network.name];
  if (!addr) throw new Error(`No POND address for ${network.name}`);

  const pond = await ethers.getContractAt([
    'function totalSupply() view returns (uint256)',
    'function getCurrentPrice() view returns (uint256)',
    'function getPondForWflr(uint256 wflrAmount) view returns (uint256)',
    'function getCostForPond(uint256 pondAmount) view returns (uint256 totalCost, uint256 floorPortion, uint256 spread)'
  ], addr);

  const spend = ethers.parseEther('100');
  const [supply, price, pondOut] = await Promise.all([
    pond.totalSupply(),
    pond.getCurrentPrice(),
    pond.getCurrentPrice().then(() => pond.getPondForWflr(spend))
  ]);

  const [totalCost, floor, spread] = await pond.getCostForPond(pondOut);
  const spreadPct = Number(spread) / Number(totalCost) * 100;

  console.log(JSON.stringify({
    network: network.name,
    pond: addr,
    totalSupplyPond: Number(ethers.formatEther(supply)),
    currentPriceFlr: Number(ethers.formatEther(price)),
    spendFlr: 100,
    pondOut: Number(ethers.formatEther(pondOut)),
    totalCostFlr: Number(ethers.formatEther(totalCost)),
    floorToStakersFlr: Number(ethers.formatEther(floor)),
    spreadToBufferFlr: Number(ethers.formatEther(spread)),
    spreadPct
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

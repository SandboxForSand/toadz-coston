const { ethers } = require('hardhat');

const POND = '0x410c65DAb32709046B1BA63caBEB4d2824D9E902';

async function main() {
  const provider = ethers.provider;
  const pond = await ethers.getContractAt([
    'function getPondForWflr(uint256 wflrAmount) view returns (uint256 pondAmount)',
    'function getCostForPond(uint256 pondAmount) view returns (uint256 totalCost, uint256 floorPortion, uint256 spread)',
    'event PondPurchased(address indexed buyer, uint256 pondAmount, uint256 wflrPaid, uint256 floorToStakers, uint256 spreadToBuffer)'
  ], POND);

  const oneHundred = ethers.parseEther('100');
  const pondOut = await pond.getPondForWflr(oneHundred);
  const [totalCost, floorPortion, spread] = await pond.getCostForPond(pondOut);

  console.log('--- Simulated for 100 FLR spend (current curve state) ---');
  console.log('pondOut:', ethers.formatEther(pondOut));
  console.log('totalCost:', ethers.formatEther(totalCost));
  console.log('floorToStakers:', ethers.formatEther(floorPortion));
  console.log('spreadToBuffer:', ethers.formatEther(spread));

  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - 2000);
  const logs = await provider.getLogs({
    address: POND,
    fromBlock: from,
    toBlock: latest,
    topics: [ethers.id('PondPurchased(address,uint256,uint256,uint256,uint256)')]
  });

  console.log('\n--- Recent PondPurchased events (latest 5) ---');
  const iface = pond.interface;
  for (const log of logs.slice(-5).reverse()) {
    const p = iface.parseLog(log);
    console.log({
      tx: log.transactionHash,
      buyer: p.args.buyer,
      wflrPaid: ethers.formatEther(p.args.wflrPaid),
      floorToStakers: ethers.formatEther(p.args.floorToStakers),
      spreadToBuffer: ethers.formatEther(p.args.spreadToBuffer),
      block: log.blockNumber
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

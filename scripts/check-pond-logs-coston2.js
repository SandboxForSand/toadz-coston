const { ethers } = require('hardhat');

const POND = '0x410c65DAb32709046B1BA63caBEB4d2824D9E902';
const STAKE = '0xd973E756fCcB640108aAf17B3465a387802A6E49';

async function main() {
  const provider = ethers.provider;
  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - 360);

  const topicPondPurchased = ethers.id('PondPurchased(address,uint256,uint256,uint256,uint256)');
  const topicPGS = ethers.id('PGSReceived(uint256)');

  const chunkSize = 30;
  const pondLogs = [];
  const pgsLogs = [];

  for (let start = from; start <= latest; start += chunkSize) {
    const end = Math.min(latest, start + chunkSize - 1);
    const [a, b] = await Promise.all([
      provider.getLogs({ address: POND, fromBlock: start, toBlock: end, topics: [topicPondPurchased] }).catch(() => []),
      provider.getLogs({ address: STAKE, fromBlock: start, toBlock: end, topics: [topicPGS] }).catch(() => []),
    ]);
    pondLogs.push(...a);
    pgsLogs.push(...b);
  }

  const pondIface = new ethers.Interface(['event PondPurchased(address indexed buyer, uint256 pondAmount, uint256 wflrPaid, uint256 floorToStakers, uint256 spreadToBuffer)']);
  const pgsIface = new ethers.Interface(['event PGSReceived(uint256 amount)']);

  console.log('Recent PGSReceived (latest 10):');
  for (const log of pgsLogs.slice(-10).reverse()) {
    const p = pgsIface.parseLog(log);
    console.log({ tx: log.transactionHash, block: log.blockNumber, amount: ethers.formatEther(p.args.amount) });
  }

  console.log('\nMatching PondPurchased for same tx (if any):');
  const byTx = new Map();
  for (const log of pondLogs) byTx.set(log.transactionHash, log);
  for (const log of pgsLogs.slice(-10).reverse()) {
    const pgs = pgsIface.parseLog(log);
    const pondLog = byTx.get(log.transactionHash);
    if (!pondLog) {
      console.log({ tx: log.transactionHash, pgs: ethers.formatEther(pgs.args.amount), pond: null });
      continue;
    }
    const pp = pondIface.parseLog(pondLog);
    console.log({
      tx: log.transactionHash,
      pgs: ethers.formatEther(pgs.args.amount),
      wflrPaid: ethers.formatEther(pp.args.wflrPaid),
      floorToStakers: ethers.formatEther(pp.args.floorToStakers),
      spreadToBuffer: ethers.formatEther(pp.args.spreadToBuffer),
      buyer: pp.args.buyer
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

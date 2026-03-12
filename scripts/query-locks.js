const { ethers, network } = require('hardhat');

const STAKE = {
  flare: '0xef3722efB994bb7657616763ffD7e70f5E1b2999',
  coston2: '0xd973E756fCcB640108aAf17B3465a387802A6E49'
};

async function main() {
  const addr = STAKE[network.name];
  if (!addr) throw new Error(`No stake address for ${network.name}`);
  const stake = await ethers.getContractAt([
    'function LOCK_90_DAYS() view returns (uint256)',
    'function LOCK_180_DAYS() view returns (uint256)',
    'function LOCK_365_DAYS() view returns (uint256)'
  ], addr);

  const [l90, l180, l365] = await Promise.all([
    stake.LOCK_90_DAYS(),
    stake.LOCK_180_DAYS(),
    stake.LOCK_365_DAYS()
  ]);

  const fmt = (s) => ({
    seconds: Number(s),
    days: Number(s) / 86400,
    hours: Number(s) / 3600
  });

  console.log(JSON.stringify({
    network: network.name,
    stake: addr,
    lock90: fmt(l90),
    lock180: fmt(l180),
    lock365: fmt(l365)
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

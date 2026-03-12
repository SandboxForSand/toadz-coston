const { ethers, network } = require('hardhat');

const ADDR = {
  flare: {
    POND: '0x9c71462248801D430A7d06de502D2324abCE517E',
    BUFFER: '0x76613C34bBA7cF6283d448adb2fFdf4d96eee176'
  },
  coston2: {
    POND: '0x410c65DAb32709046B1BA63caBEB4d2824D9E902',
    BUFFER: '0xB5cF60df70BDD3E343f7A4be2053140b26273427'
  }
};

const FLOOR_PRICE = 0.5;
const REDEMPTION_PERCENT = 0.5;
const LIAB_PER_POND = FLOOR_PRICE * REDEMPTION_PERCENT; // 0.25
const K = 0.00001;

function solveDeltaForSpread(supply, neededSpread) {
  if (neededSpread <= 0) return 0;
  // 0.5*K*((s+d)^2 - s^2) = neededSpread
  // 0.5*K*(2*s*d + d^2) = neededSpread
  // d^2 + 2*s*d - 2*neededSpread/K = 0
  const A = 1;
  const B = 2 * supply;
  const C = -2 * neededSpread / K;
  const disc = B * B - 4 * A * C;
  return (-B + Math.sqrt(disc)) / (2 * A);
}

async function main() {
  const cfg = ADDR[network.name];
  if (!cfg) throw new Error(`Unsupported network ${network.name}`);

  const pond = await ethers.getContractAt([
    'function totalSupply() view returns (uint256)',
    'function getTotalLiability() view returns (uint256)',
    'function getCurrentPrice() view returns (uint256)',
    'function getPondForWflr(uint256) view returns (uint256)',
    'function getCostForPond(uint256) view returns (uint256,uint256,uint256)'
  ], cfg.POND);

  const buffer = await ethers.getContractAt([
    'function getBalance() view returns (uint256)'
  ], cfg.BUFFER);

  const [totalSupplyWei, liabilityWei, bufferWei, priceWei] = await Promise.all([
    pond.totalSupply(),
    pond.getTotalLiability(),
    buffer.getBalance(),
    pond.getCurrentPrice()
  ]);

  const supply = Number(ethers.formatEther(totalSupplyWei));
  const liability = Number(ethers.formatEther(liabilityWei));
  const bufferBal = Number(ethers.formatEther(bufferWei));
  const price = Number(ethers.formatEther(priceWei));
  const coverage = liability > 0 ? (bufferBal / liability) * 100 : 0;
  const gap = Math.max(0, liability - bufferBal);

  const d = solveDeltaForSpread(supply, gap);
  const floorSpend = 0.5 * d;
  const spreadSpend = gap;
  const totalBuySpend = floorSpend + spreadSpend;

  const spend100 = ethers.parseEther('100');
  const pondOut100 = Number(ethers.formatEther(await pond.getPondForWflr(spend100)));
  const costTuple = await pond.getCostForPond(await pond.getPondForWflr(spend100));
  const floor100 = Number(ethers.formatEther(costTuple[1]));
  const spread100 = Number(ethers.formatEther(costTuple[2]));

  console.log(JSON.stringify({
    network: network.name,
    totalSupplyPOND: supply,
    currentPriceFLR: price,
    liabilityFLR: liability,
    bufferFLR: bufferBal,
    coveragePct: coverage,
    shortfallFLR: gap,
    buyVolumeToCloseShortfallFLR: totalBuySpend,
    pondMintNeeded: d,
    flrPer100Buy: {
      floorToStakers: floor100,
      spreadToBuffer: spread100
    },
    note: 'buyVolumeToCloseShortfall assumes spread-only funding, no restake/claim outflows during accrual.'
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

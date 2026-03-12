const { ethers, network } = require('hardhat');

const MARKET = process.env.MARKET_PROXY || '0xa36a221F9BAc3691BfD69A23AB67d2f6F7F40A7d';
const TADZ = '0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6'.toLowerCase();
const FTOADZ = '0xE789bD16752Bf4C4CFE92BC5f95675ed007e3dDd';
const TARGET_USERS = (process.env.TARGET_USERS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

async function main() {
  if (network.name !== 'flare') {
    throw new Error('Run with --network flare');
  }

  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);
  console.log('Market:', MARKET);

  const market = await ethers.getContractAt(
    [
      'function owner() view returns (address)',
      'function whitelisted(address) view returns (bool)',
      'function setWhitelisted(address,bool) external',
      'function bonusListingSlots(address) view returns (uint256)',
      'function setBonusListingSlots(address,uint256) external',
      'function getAllActiveListings() view returns (address[] collections, uint256[] tokenIds, address[] sellers, uint256[] prices, uint256[] commitmentDays, uint256[] listedAts)',
      'function getAllActiveRentalListings() view returns (address[] collections, uint256[] tokenIds, address[] owners, uint256[] dailyRates, uint256[] commitmentEnds)'
    ],
    MARKET,
    signer
  );

  const owner = await market.owner();
  console.log('Owner:', owner);
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error('Signer is not market owner');
  }

  const [saleCols, , saleSellers] = await market.getAllActiveListings();
  const [rentCols, , rentOwners] = await market.getAllActiveRentalListings();

  const perUserLegacy = new Map();

  for (let i = 0; i < saleCols.length; i++) {
    const col = saleCols[i].toLowerCase();
    if (col === TADZ) continue;
    const u = saleSellers[i].toLowerCase();
    perUserLegacy.set(u, (perUserLegacy.get(u) || 0) + 1);
  }

  for (let i = 0; i < rentCols.length; i++) {
    const col = rentCols[i].toLowerCase();
    if (col === TADZ) continue;
    const u = rentOwners[i].toLowerCase();
    perUserLegacy.set(u, (perUserLegacy.get(u) || 0) + 1);
  }

  const users = TARGET_USERS.length
    ? TARGET_USERS.map((u) => u.toLowerCase())
    : Array.from(perUserLegacy.keys());

  console.log('Users to migrate:', users.length);

  for (const user of users) {
    const legacyCount = perUserLegacy.get(user) || 0;
    const currentBonus = await market.bonusListingSlots(user);
    if (currentBonus !== BigInt(legacyCount)) {
      console.log(`setBonusListingSlots ${user}: ${currentBonus.toString()} -> ${legacyCount}`);
      const tx = await market.setBonusListingSlots(user, legacyCount);
      await tx.wait();
      console.log(`  tx: ${tx.hash}`);
    } else {
      console.log(`bonus ok ${user}: ${legacyCount}`);
    }
  }

  const ftoadzWhitelisted = await market.whitelisted(FTOADZ);
  console.log('FToadz whitelisted:', ftoadzWhitelisted);
  if (ftoadzWhitelisted) {
    const tx = await market.setWhitelisted(FTOADZ, false);
    await tx.wait();
    console.log('Disabled FToadz whitelist tx:', tx.hash);
  }

  console.log('Done');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

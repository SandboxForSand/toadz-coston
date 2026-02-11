// Flare Mainnet Contract Addresses
export const CONTRACTS = {
  WFLR: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
  Buffer: '0x76613C34bBA7cF6283d448adb2fFdf4d96eee176',
  POND: '0x9c71462248801D430A7d06de502D2324abCE517E',
  OGVaultOracle: '0x5fADe844b333de50ef4876334d5432703D92D302',
  BoostRegistry: '0x62a47BD9fba669a2BE0641f4cB1c987698605e69',
  ToadzStake: '0xef3722efB994bb7657616763ffD7e70f5E1b2999',
  ToadzMint: '0x2Cf03400B8622eACCA7D2c9A0cc114b1C8df0654',
  ToadzMarket: '0xa36a221F9BAc3691BfD69A23AB67d2f6F7F40A7d',
  FToadz: '0xE789bD16752Bf4C4CFE92BC5f95675ed007e3dDd',
  Zap: '0x7ce7Ed829aee992dC1966D97FA336bB0eba3b01e',
};

// OG Vault eligible collections (lock forever for 2x)
export const OG_COLLECTIONS = [
  { 
    name: 'sToadz', 
    address: '0x35afb6Ba51839dEDD33140A3b704b39933D1e642',
    emoji: '🐸'
  },
  { 
    name: 'Luxury Lofts', 
    address: '0x91Aa85a172DD3e7EEA4ad1A4B33E90cbF3B99ed8',
    emoji: '🏢'
  },
  { 
    name: 'Songbird City', 
    address: '0x360f8B7d9530F55AB8E52394E6527935635f51E7',
    emoji: '🌆'
  },
];

export const FLARE_CHAIN = {
  chainId: '0xe',  // 14 in hex
  chainName: 'Flare',
  nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
  rpcUrls: ['https://flare-api.flare.network/ext/C/rpc'],
  blockExplorerUrls: ['https://flare-explorer.flare.network/'],
};

export const SONGBIRD_CHAIN = {
  chainId: '0x13',  // 19 in hex
  chainName: 'Songbird',
  nativeCurrency: { name: 'Songbird', symbol: 'SGB', decimals: 18 },
  rpcUrls: ['https://songbird-api.flare.network/ext/C/rpc'],
  blockExplorerUrls: ['https://songbird-explorer.flare.network/'],
};

// Songbird contracts
export const SONGBIRD_CONTRACTS = {
  OGVault: '0x6E4eE531b636e3c389F37082eBdEeB6cbB98f2dA',
  ToadzMarket: '0x410c65DAb32709046B1BA63caBEB4d2824D9E902',
};

// ABIs - only functions we need
export const ABIS = {
  WFLR: [
    'function deposit() external payable',
    'function withdraw(uint256 amount) external',
    'function balanceOf(address account) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ],
  
  ToadzStake: [
    'function deposit(uint256 wflrAmount, uint8 lockTier, address _referrer) external',
    'function exit() external',
    'function restake(uint8 newLockTier) external',
    'function positions(address user) view returns (uint256 wflrStaked, uint256 pondStaked, uint256 earnedWflr, uint256 lockExpiry, uint256 lockMultiplier, uint256 rewardDebt, uint256 lastUpdateTime)',
    'function totalWflrStaked() view returns (uint256)',
    'function totalPondStaked() view returns (uint256)',
    'function getPendingRewards(address user) view returns (uint256)',
    'function poolCap() view returns (uint256)',
    'function getPondRequired(uint256 wflrAmount) view returns (uint256)',
    'function totalDeposited(address) view returns (uint256)',
    'function totalFtsoRewardsClaimed() view returns (uint256)',
    'function totalPGSDistributed() view returns (uint256)',
    'function getPercentGain(address user) view returns (uint256)',
    'function addStaker(address) external',
    'event Deposited(address indexed user, uint256 wflrAmount, uint256 pondAmount, uint256 lockDays, uint256 multiplier)',
  ],
  
  POND: [
    'function buy(uint256 wflrAmount) external',
    'function startRedemption(uint256 pondAmount) external',
    'function claimRedemption() external',
    'function balanceOf(address account) view returns (uint256)',
    'function stakedPond(address account) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function getCurrentPrice() view returns (uint256)',
    'function getCostForPond(uint256 pondAmount) view returns (uint256 totalCost, uint256 floorPortion, uint256 spread)',
    'function getAveragePrice(address user) view returns (uint256)',
    'function getAvailableBalance(address user) view returns (uint256)',
    'function redemptions(address user) view returns (uint256 totalOwed, uint256 totalClaimed, uint256 dripEndTime, uint256 dripStartTime)',
  ],
  
  Zap: [
    'function zapDeposit(uint256 stakeAmount, uint8 lockTier, address referrer) external payable',
    'function previewDeposit(uint256 stakeAmount, address user) view returns (uint256 totalFLR, uint256 pondCost, uint256 pondToBuy)',
  ],
  
  BoostRegistry: [
    'function getUserBoost(address user) view returns (uint256)',
    'function getBoostBreakdown(address user) view returns (uint256 ogCount, uint256 listingCount, uint256 ogBoost, uint256 listingBoost, uint256 totalBoost)',
    'function getListingCount(address user) view returns (uint256)',
  ],
  
  ToadzMint: [
    'function mint(uint256 dropId, uint256 quantity) external',
    'function buyMpond(uint256 dropId, uint256 amount) external',
    'function getMintCost(uint256 dropId, address user, uint256 quantity) view returns (uint256 pondCost, uint256 mpondUsed, uint256 discount)',
    'function getUserDiscount(address user) view returns (uint256)',
    'function mpondBalance(address user) view returns (uint256)',
    'function getDrop(uint256 dropId) view returns (tuple(address collection, uint256 supply, uint256 minted, uint256 pondPrice, uint256 startTime, uint256 endTime, bool active))',
    'function dropCount() view returns (uint256)',
  ],
  
  ToadzMarket: [
    'function list(address collection, uint256 tokenId, uint256 price) external',
    'function buy(address collection, uint256 tokenId) external payable',
    'function cancel(address collection, uint256 tokenId) external',
    'function updatePrice(address collection, uint256 tokenId, uint256 newPrice) external',
    'function getListing(address collection, uint256 tokenId) view returns (address seller, uint256 price)',
    'function isListed(address collection, uint256 tokenId) view returns (bool)',
    'function getUserListingCount(address user) view returns (uint256)',
    'function whitelisted(address collection) view returns (bool)',
    'function listForRent(address collection, uint256 tokenId, uint256 dailyRate, uint256 commitmentDays) external',
    'function cancelRentalListing(address collection, uint256 tokenId) external',
    'function getRentalListing(address collection, uint256 tokenId) view returns (address owner, uint256 dailyRate, uint256 commitmentEnd, uint256 daysRemaining, bool isActive, bool isRented)',
  ],
  
  Buffer: [
    'function getBalance() view returns (uint256)',
    'function totalFtsoRewardsClaimed() view returns (uint256)',
  ],
  
  ERC721: [
    'function balanceOf(address owner) view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function approve(address to, uint256 tokenId) external',
    'function setApprovalForAll(address operator, bool approved) external',
    'function isApprovedForAll(address owner, address operator) view returns (bool)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  ],
  
  OGVault: [
    'function lock(address collection, uint256 tokenId) external',
    'function lockBatch(address collection, uint256[] calldata tokenIds) external',
    'function getOGCount(address user) view returns (uint256)',
    'function getLockedNfts(address user, address collection) view returns (uint256[])',
    'function getEligibleCollections() view returns (address[])',
    'function getLockedByCollection(address user) view returns (address[] collections, uint256[] counts)',
    'function checkEligible(address collection) view returns (bool)',
    'function getAllLockers() view returns (address[] lockers, uint256[] counts, uint256 total)',
    'function getLockerCount() view returns (uint256)',
    'function getTotalLocked() view returns (uint256)',
  ],
};

// Lock tier config (matches contract)
export const LOCK_TIERS = [
  { days: '1h', duration: 3600, multiplier: 1.0 },
  { days: '24h', duration: 86400, multiplier: 2.0 },
  { days: '72h', duration: 259200, multiplier: 4.0 },
];

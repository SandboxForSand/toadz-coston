// force rebuild 12345

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, COSTON2_CHAIN, ABIS, LOCK_TIERS, OG_COLLECTIONS } from './contracts.js';
const merkleTreeData = { proofs: {}, root: '0x' + '0'.repeat(64) }; // Placeholder for testnet

// TadzClaimer on Flare
const TADZ_CLAIMER = {
  address: '0x08e687aC00311F4683eBEbEc0d234193EA9AD319',
  abi: [
    'function claim(uint256 totalAllocation, bytes32[] calldata proof) external',
    'function claimed(address) view returns (uint256)',
    'function getClaimable(address user, uint256 totalAllocation, bytes32[] calldata proof) view returns (uint256)',
    'function availableTokens() view returns (uint256)',
    'function verifyProof(address user, uint256 totalAllocation, bytes32[] calldata proof) view returns (bool)'
  ]
};

// Boost-eligible collections (Flare only for now)
const BOOST_COLLECTIONS = [
  // No NFT collections on Coston2 testnet
];

// Platform wallets get 10 free listings
const PLATFORM_WALLETS = [
  '0x9bDB29529016a15754373B9D5B5116AB728E916e',
  '0x6D69E5d3E51ef1eE47d3C73112aa74F6eA944895',
  '0xcf64CA3A422054DEb35C829a3fc79E03955daf4B'
].map(a => a.toLowerCase());

const ToadzFinal = () => {
  // Core navigation
  const [activeTab, setActiveTab] = useState('pool');
  const [marketSubTab, setMarketSubTab] = useState('flare'); // 'flare' or 'og'
  const [marketCollectionFilter, setMarketCollectionFilter] = useState('');
  const [marketSortBy, setMarketSortBy] = useState('price');
  const [marketSortDir, setMarketSortDir] = useState('asc');
  const [sweepSelection, setSweepSelection] = useState([]);
  const [flareListings, setFlareListings] = useState([]);
  const [userRentals, setUserRentals] = useState([]); // User's active rentals
  const [marketRefresh, setMarketRefresh] = useState(0); // Trigger refresh
  const [blockBonezImages, setBlockBonezImages] = useState({}); // tokenId -> image URL
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 375);
  const [showSyncModal, setShowSyncModal] = useState(false);
  
  // Toast notification system
  const [toast, setToast] = useState(null); // { type: 'success'|'error'|'info', message: string }
  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };
  
  // Android/Bifrost detection for nav bar padding
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  
  // Wallet connection
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  
  // Mint page - Fox Girls drops in 30 days
  const [isLive, setIsLive] = useState(false);
  const [mintTargetDate] = useState(() => {
    const target = new Date();
    target.setDate(target.getDate() + 30);
    return target;
  });
  const [countdown, setCountdown] = useState({ days: 30, hours: 0, minutes: 0, seconds: 0 });
  const [mintCount, setMintCount] = useState(1);
  const [recentMints, setRecentMints] = useState([]);
  
  // Stake page (lifted from PoolPage)
  const [depositFlr, setDepositFlr] = useState('');
  const [depositPond, setDepositPond] = useState('');
  const [flrInputFocused, setFlrInputFocused] = useState(false);
  const [lockTier, setLockTier] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCustomDeposit, setShowCustomDeposit] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [showRedemption, setShowRedemption] = useState(false);
  const [lockExpired, setLockExpired] = useState(false);
  const [swapMode, setSwapMode] = useState(null);
  const [swapAmount, setSwapAmount] = useState('');
  const [simFlr, setSimFlr] = useState('');
  
  // Vault page
  const [vaultTab, setVaultTab] = useState('og');
  const [showNFTPanel, setShowNFTPanel] = useState(false);
  const [nftTab, setNftTab] = useState('staked');
  const [drillLevel, setDrillLevel] = useState(0);
  const [drillCategory, setDrillCategory] = useState(null);
  const [drillCollection, setDrillCollection] = useState(null);
  
  // Refer page (lifted from ReferPage)
  const [refSlug, setRefSlug] = useState('');
  const [slugClaimed, setSlugClaimed] = useState(false);
  const [usedReferral, setUsedReferral] = useState(false);
  const [slugInput, setSlugInput] = useState('');
  const [referrerFromUrl, setReferrerFromUrl] = useState('0x0000000000000000000000000000000000000000');
  
  // Parse referrer from URL on load
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref.startsWith('0x') && ref.length === 42) {
      setReferrerFromUrl(ref);
    }
  }, []);
  
  // Market page (lifted from MarketPage)
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [buyModal, setBuyModal] = useState(null);
  const [listModal, setListModal] = useState(null);
  
  // Pool modals
  const [showRestakeModal, setShowRestakeModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [restakeLockTier, setRestakeLockTier] = useState(2);
  
  // Vault modals
  const [stakeNftModal, setStakeNftModal] = useState(null);
  const [unstakeNftModal, setUnstakeNftModal] = useState(null);
  const [lockInfoModal, setLockInfoModal] = useState(null); // 'toadz' | 'discount' | 'rental'
  const [selectedNfts, setSelectedNfts] = useState([]);
  
  // UI state
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [saleNotification, setSaleNotification] = useState(null);
  const [boostSyncNeeded, setBoostSyncNeeded] = useState(false);
  
  // Profile editor
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [userPfp, setUserPfp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('toadz_pfp') || 'green';
    }
    return 'green';
  });
  const [userName, setUserName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('toadz_name') || '';
    }
    return '';
  });
  const [tempUserName, setTempUserName] = useState('');
  
  // Tadz PFP options - use minted tokens (1-1020)
  const tadzPfpOptions = [
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16
  ];
  
  // Legacy - keeping for backwards compat, maps old color IDs to first Tadz
  const legacyPfpMap = {
    'green': 1, 'purple': 2, 'blue': 3, 'pink': 4,
    'gold': 5, 'red': 6, 'cyan': 7, 'orange': 8,
    'magenta': 9, 'lime': 10, 'yellow-green': 11, 'white': 12,
    'silver': 13, 'violet': 14, 'rose': 15, 'teal': 16
  };

  // Persist profile changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('toadz_pfp', userPfp);
    }
  }, [userPfp]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('toadz_name', userName);
    }
  }, [userName]);

  const isDesktop = windowWidth >= 768;

  // Contract state
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contracts, setContracts] = useState({});
  const [userPosition, setUserPosition] = useState(null);
  const [pondBalance, setPondBalance] = useState(0);
  const [wflrBalance, setWflrBalance] = useState(0);
  const [poolStats, setPoolStats] = useState({ totalWflr: 0, totalPond: 0, cap: 0, totalPGS: 0, totalFtsoRewards: 0, topStakerReturn: 0 });
  const [boostData, setBoostData] = useState({ boost: 0, stakedNfts: [] });
  const [fomoFlrExtra, setFomoFlrExtra] = useState(0);
  const [fomoBoostExtra, setFomoBoostExtra] = useState(0);
  const [mintData, setMintData] = useState({ isLive: false, totalMinted: 0, maxSupply: 0, credits: 0 });
  const [ogNftData, setOgNftData] = useState({ 
    collections: [], // { address, name, emoji, owned, locked }
    totalOwned: 0,
    totalLocked: 0
  });
  const [tadzClaimData, setTadzClaimData] = useState({
    allocation: 0,
    claimed: 0,
    claimable: 0,
    proof: [],
    loading: false
  });
  const [allLockers, setAllLockers] = useState([]); // [{ address, count }]
  const [loading, setLoading] = useState(false);
  const [currentNetwork, setCurrentNetwork] = useState('flare'); // 'flare' or 'songbird'
  const [syncPending, setSyncPending] = useState(false);

  // Marketplace state
 const [marketListings, setMarketListings] = useState([]);
  const [showListModal, setShowListModal] = useState(false);
  const [listingCollection, setListingCollection] = useState('');
  const [listingTokenId, setListingTokenId] = useState('');
  const [listingPrice, setListingPrice] = useState('');
  const [listModalNfts, setListModalNfts] = useState([]);
  const [listModalLoading, setListModalLoading] = useState(false);
  const [listModalCollection, setListModalCollection] = useState(null);
  const [listModalCollectionNfts, setListModalCollectionNfts] = useState([]);
  const [listModalFetchingNfts, setListModalFetchingNfts] = useState(false);
  const [selectedNft, setSelectedNft] = useState(null);

  // Boost Market State - NEW
  const [showBoostListModal, setShowBoostListModal] = useState(false);
  const [showBoostRentModal, setShowBoostRentModal] = useState(false);
  const [boostListStep, setBoostListStep] = useState(1);
  const [boostRentStep, setBoostRentStep] = useState(1);
  const [boostListType, setBoostListType] = useState(null);
  const [boostDuration, setBoostDuration] = useState(127);
  const [selectedBoostNft, setSelectedBoostNft] = useState(null);
  const [userBoostNfts, setUserBoostNfts] = useState([]);
  const [fetchingBoostNfts, setFetchingBoostNfts] = useState(false);
  const [boostSellPrice, setBoostSellPrice] = useState('');
  const [nftDetailModal, setNftDetailModal] = useState(null); // { tokenId, collection, image, animatedUrl, rank, traits }
  const [nftMetadata, setNftMetadata] = useState(null);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [yourFToadzSort, setYourFToadzSort] = useState('all'); // 'all', 'listed', 'unlisted'
  const [marketFilter, setMarketFilter] = useState('all'); // 'all', 'available', 'forSale'
  const [selectedRentalListing, setSelectedRentalListing] = useState(null);
  const [rarityRanks, setRarityRanks] = useState(null); // array where index = tokenId - 1, value = rank
  const [expandedMobileRow, setExpandedMobileRow] = useState(null); // for mobile market tap-to-expand
  const [showLpRequiredModal, setShowLpRequiredModal] = useState(false); // LP gate for listing

  // Fetch rarity ranks on mount
  useEffect(() => {
    fetch('https://ipfs.io/ipfs/bafybeib4xvjclo334wse7zdfryfnve6vfaqrb3xk7hczylhbn5rajen4bm')
      .then(res => res.json())
      .then(data => setRarityRanks(data))
      .catch(err => console.log('Rarity ranks not loaded:', err));
  }, []);

  // Fetch metadata when detail modal opens
  useEffect(() => {
    if (nftDetailModal && nftDetailModal.collection?.toLowerCase() === '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6') {
      setFetchingMetadata(true);
      fetch(`https://ipfs.io/ipfs/QmZchogrQg5oxnKA8azWPS6YtnGXyb6XsgWXt4kw7tuYby/${nftDetailModal.tokenId}.json`)
        .then(res => res.json())
        .then(data => {
          setNftMetadata(data);
          setFetchingMetadata(false);
        })
        .catch(() => setFetchingMetadata(false));
    } else {
      setNftMetadata(null);
    }
  }, [nftDetailModal]);

  const resetBoostListModal = () => {
    setShowBoostListModal(false);
    setBoostListStep(1);
    setBoostListType(null);
    setSelectedBoostNft(null);
    setBoostSellPrice('');
  };

  // Handle listing NFT for sale/rent
  const handleBoostList = async () => {
    if (!selectedBoostNft || !signer) {
      showToast('error', 'No NFT selected or wallet not connected');
      return;
    }
    
    if (boostListType === 'sell' && !boostSellPrice) {
      showToast('error', 'Enter a sell price');
      return;
    }
    
    // Check listing limit
    const isPlatform = PLATFORM_WALLETS.includes(walletAddress.toLowerCase());
    const stakeBonus = Math.floor(user.lpPosition / 10000);
    const maxListings = isPlatform ? 10 + stakeBonus : stakeBonus;
    const currentListings = flareListings.filter(l => l.seller?.toLowerCase() === walletAddress.toLowerCase() && l.collection?.toLowerCase() === '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6').length;
    
    if (currentListings >= maxListings) {
      if (maxListings === 0) {
        showToast('error', 'Stake FLR to unlock listings (10k FLR = 1 listing)');
      } else {
        showToast('error', `Listing limit reached (${maxListings}). Stake more FLR for additional listings.`);
      }
      return;
    }
    
    setLoading(true);
    try {
      const nftContract = new ethers.Contract(selectedBoostNft.address, [
        'function approve(address, uint256) external',
        'function getApproved(uint256) view returns (address)',
        'function setApprovalForAll(address, bool) external',
        'function isApprovedForAll(address, address) view returns (bool)',
      ], signer);
      
      const marketAddress = CONTRACTS.ToadzMarket;
      
      // Check/set approval
      const isApprovedAll = await nftContract.isApprovedForAll(walletAddress, marketAddress);
      if (!isApprovedAll) {
        const approved = await nftContract.getApproved(selectedBoostNft.tokenId);
        if (approved.toLowerCase() !== marketAddress.toLowerCase()) {
          const approveTx = await nftContract.approve(marketAddress, selectedBoostNft.tokenId);
          await approveTx.wait();
        }
      }
      
      if (boostListType === 'sell') {
        // List for sale (V5: no dailyRate for sales)
        const marketContract = new ethers.Contract(marketAddress, [
          'function list(address collection, uint256 tokenId, uint256 price, uint256 commitmentDays) external',
        ], signer);
        
        const priceWei = ethers.parseEther(boostSellPrice || '0');
        const tx = await marketContract.list(
          selectedBoostNft.address,
          selectedBoostNft.tokenId,
          priceWei,
          boostDuration
        );
        await tx.wait();
        showToast('success', 'NFT listed for sale');
      } else {
        // List for rent
        const marketContract = new ethers.Contract(marketAddress, [
          'function listForRent(address collection, uint256 tokenId, uint256 dailyRate, uint256 commitmentDays) external',
        ], signer);
        
        const dailyRateWei = ethers.parseEther(rentalPrice);
        const tx = await marketContract.listForRent(
          selectedBoostNft.address,
          selectedBoostNft.tokenId,
          dailyRateWei,
          boostDuration
        );
        await tx.wait();
        showToast('success', 'NFT listed for rent');
      }
      
      resetBoostListModal();
    } catch (err) {
      console.error('Error listing NFT:', err);
      showToast('error', 'Failed to list: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const resetBoostRentModal = () => {
    setShowBoostRentModal(false);
    setBoostRentStep(1);
    setSelectedRentalListing(null);
  };

  // Boost Market Logic - calculations using actual user LP
  const actualUserLP = userPosition?.wflrStaked || 0;
  const lpFactor = actualUserLP / 25000;
  const durationFactor = boostDuration / 100;
  const finalBoost = Math.max(1.0, Math.min(5.0, 1 + lpFactor + durationFactor)); 
  const rentalPrice = (finalBoost * 0.001).toFixed(4);
  const sellFinalBoost = finalBoost;
  const sellRentalPrice = rentalPrice;

  // Fetch user's boost-eligible NFTs
  const [boostNftsPage, setBoostNftsPage] = useState(0);
  const BOOST_PAGE_SIZE = 100;

  const fetchUserBoostNfts = async () => {
    if (!walletAddress) return;
    setFetchingBoostNfts(true);
    const nfts = [];
    
    // Use read-only provider - doesn't depend on wallet provider state
    const readProvider = new ethers.JsonRpcProvider('https://coston2-api.flare.network/ext/C/rpc');
    
    for (const col of BOOST_COLLECTIONS) {
      try {
        const contract = new ethers.Contract(col.address, [
          'function balanceOf(address) view returns (uint256)',
          'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
        ], readProvider);
        
        const balance = await contract.balanceOf(walletAddress);
        for (let i = 0; i < Number(balance); i++) {
          try {
            const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
            nfts.push({
              collection: col.name,
              address: col.address,
              tokenId: Number(tokenId),
            });
          } catch (e) {
            break;
          }
        }
      } catch (e) {
        console.log(`Error fetching ${col.name}:`, e.message);
      }
    }
    
    setUserBoostNfts(nfts);
    setBoostNftsPage(0);
    setFetchingBoostNfts(false);
  };

  // Fetch user's Tadz when connected
  useEffect(() => {
    if (connected && walletAddress) {
      fetchUserBoostNfts();
    }
  }, [connected, walletAddress]);

  // Fetch NFTs when collection selected in ListModal
  useEffect(() => {
    if (!showListModal || !walletAddress || !listModalCollection) return;
    
    const isFlare = marketSubTab === 'flare';
    
    const fetchCollectionNfts = async () => {
      setListModalFetchingNfts(true);
      const nfts = [];
      
      try {
        if (false) {
          // Disabled on Coston2 - no indexer
          const res = await fetch(`https://toadz-indexer-production.up.railway.app/live-nfts/${walletAddress}`);
          const data = await res.json();
          
          // Known image patterns for Songbird collections
          const imagePatterns = {
            '0x35afb6ba51839dedd33140a3b704b39933d1e642': (id) => `https://ipfs.io/ipfs/QmP45Rfhy75RybFuLcwd1CR9vF6qznw95qQPxcA5TeBNYk/${id}.png`,
            '0x91aa85a172dd3e7eea4ad1a4b33e90cbf3b99ed8': (id) => `https://ipfs.io/ipfs/QmZ42mWPA3xihoQxnm7ufKh51n5fhJe7hwfN7VPfy4cZcg`,
            '0x360f8b7d9530f55ab8e52394e6527935635f51e7': (id) => `https://ipfs.io/ipfs/QmY5ZwdLP4z2PBXmRgh3djcDYzWvMuizyqfTDhPnXErgBm`,
          };
          
          for (const nft of data.nfts || []) {
            if (nft.collection.toLowerCase() === listModalCollection.address.toLowerCase()) {
              const pattern = imagePatterns[nft.collection.toLowerCase()];
              const image = pattern ? pattern(nft.tokenId) : listModalCollection.image;
              nfts.push({
                collection: nft.collection,
                collectionName: listModalCollection.name,
                tokenId: nft.tokenId,
                image
              });
            }
          }
        } else {
          // Flare - use RPC with known image patterns (Sparkles gateway)
          const flareImagePatterns = {
            '0xd1ef6460d9d06a4ce74d9800b1bc11ade822b349': null, // Block Bonez - unique CID per token
            '0x94aa172076a59baa1b5d63ae4dbf722f74e45e57': () => `https://sparklesnft.imgix.net/ipfs/bafybeiaz7eo2nrfdetw2ffxctcxdu6y5rcmyct6humpmptfghesaav3wuy/Wood.png`,
            '0x862b713fecebe5304ed7af993d79a3a6ae8747dd': (id) => `https://sparklesnft.imgix.net/ipfs/bafybeid2vv7bfz3q5m5wesks4tkhtxflnppj42z2xikzqozvv4bcakpl2u/${id}.jpg`,
            '0xc5f0c8b27dd920f4f469a857d6f0fecf0fa2bdb8': (id) => `https://sparklesnft.imgix.net/ipfs/QmauUguWjX69wC5crvN7HubGuqgSUrRbRBaU8JTqQbehd2/${id}Security.png`,
            '0x9d8644a5d8a4ed0b4ca462ef32a6d47eb03c59db': (id) => `https://bafybeih2j7otrs4q4moxfgtepl6ywfhukdu5oe66g5krlymcqq4u7mwt2i.ipfs.nftstorage.link/${id}.png`,
            '0x595fa9effad5c0c214b00b1e3004302519bfc1db': (id) => `https://sparklesnft.imgix.net/ipfs/QmTNmPZTGqsoRxLmj9idjCpdxLsY434PgTsHB2FkoiXEUE/${id}.png`,
            '0x93365aace3db5407b0976c0a6c5f46b21bad3923': (id) => `https://sparklesnft.imgix.net/ipfs/QmcgHXTumCVC4jd77LZi6iTcDcZDWTRKqRvy5ar6psnTot/${id}.png`,
            '0x2959d636871d9714dd6e00f4e9700ccc346cc39e': (id) => `https://sparklesnft.imgix.net/ipfs/bafybeiag4m2aohwz23fitflnoe4z7jmy33wftlma3gzrrgigikgnhluomy/${id}.png`,
            '0xe2432f1e376482ec914ebbb910d3bfd8e3f3f29e': (id) => `https://sparklesnft.imgix.net/ipfs/QmTaY5MS9trVXjFywtxW4D927KDY5r2GWthvdnwE2u1TQ8/${id}.png`,
            '0xe6e5fa0b12d9e8ed12cb8ab733e6444f3c74c68c': (id) => `https://sparklesnft.imgix.net/ipfs/bafybeicd3jwz5j3sbyjadl6zwot3jaamwqsrmgq25gvxkj25ttdqzic4zy/${id}.png`,
            '0x5f4283cf126a4dcce16b66854cc9a713893c0000': () => `https://sparklesnft.imgix.net/ipfs/bafybeigc3gqqb3gmzoela6zqb2ixxnp53bixcaj6jpjoehyyb22kh65sji/Deep_Ocean.png`,
            '0x127bb21a24b8ea5913f1c8c9868800fbcef1316e': (id) => `https://sparklesnft.imgix.net/ipfs/Qmd4n9MSWS1APF6Uh4aG43iCwMFJDBXcoXLbmyoRRmXBYF/export-resize-sbm/${id}.png`,
            '0xd2516a06d1fabb9ba84b5fd1de940f6f0eae3673': () => `https://sparklesnft.imgix.net/ipfs/QmagMFqse3TgMvjgZfUXASLqq4qiboBiG5cqvpFtbgo5CW/still.png`,
            '0xa574dd4393e828b8cf7c3c379861c748d321bbfd': () => `https://backend.truegems.io/public/studio/images/image_1725809975432.png`,
            '0x9f338ac5d000baab73f619fc75115f2fe9773736': (id) => `https://bafybeib2nj2c77jbolzs5qrmfntbsvcwqu2uzntycy35fhylwp3fejx7mi.ipfs.nftstorage.link/${id}.png`,
            '0xbc25d2997a7a7b42d2501a4c4d0169f135743a64': (id) => `https://sparklesnft.imgix.net/ipfs/bafybeihlyofvjfavatfm3oyfog53mtxgvarphef2pumfweztpitb5xjznm/${id}.png`,
            '0xbc42e9a6c24664749b2a0d571fd67f23386e34b8': (id) => `https://sparklesnft.imgix.net/ipfs/QmRCttzFebHEkmLzadbhkm2Wgy2Rh1FibrxXxRD93tr7Gp/${id}.png`,
          };
          
          const provider = new ethers.JsonRpcProvider('https://coston2-api.flare.network/ext/C/rpc');
          
          const nftContract = new ethers.Contract(listModalCollection.address, [
            'function balanceOf(address) view returns (uint256)',
            'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
            'function tokenURI(uint256 tokenId) view returns (string)'
          ], provider);
          
          const balance = await nftContract.balanceOf(walletAddress);
          const count = Math.min(Number(balance), 50);
          
          const collAddr = listModalCollection.address.toLowerCase();
          const knownPattern = flareImagePatterns[collAddr];
          
          for (let i = 0; i < count; i++) {
            try {
              const tokenId = await nftContract.tokenOfOwnerByIndex(walletAddress, i);
              let image = knownPattern ? knownPattern(Number(tokenId)) : listModalCollection.image;
              
              // Only fetch metadata if no known pattern (Block Bonez or unknown)
              if (!knownPattern || knownPattern === null) {
                try {
                  let uri = await nftContract.tokenURI(tokenId);
                  if (uri.startsWith('ipfs://')) {
                    uri = uri.replace('ipfs://', 'https://sparklesnft.imgix.net/ipfs/');
                  }
                  const metaRes = await fetch(uri);
                  const meta = await metaRes.json();
                  if (meta.image) {
                    image = meta.image;
                    if (image.startsWith('ipfs://')) {
                      image = image.replace('ipfs://', 'https://sparklesnft.imgix.net/ipfs/');
                    }
                  }
                } catch (e) {
                  console.log('Failed to fetch metadata for token', Number(tokenId));
                }
              }
              
              nfts.push({
                collection: listModalCollection.address,
                collectionName: listModalCollection.name,
                tokenId: Number(tokenId),
                image
              });
            } catch (e) {
              break;
            }
          }
        }
      } catch (e) {
        console.log('Failed to fetch NFTs:', e);
      }
      
      setListModalCollectionNfts(nfts);
      setListModalFetchingNfts(false);
    };
    
    fetchCollectionNfts();
  }, [showListModal, walletAddress, marketSubTab, listModalCollection]);
  
  // Switch to Coston2 testnet
  const switchToFlare = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: COSTON2_CHAIN.chainId }],
      });
      setCurrentNetwork('flare');
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [COSTON2_CHAIN],
        });
        setCurrentNetwork('flare');
      }
    }
  };

  // Load public pool stats (no wallet needed)
  const loadPublicStats = async () => {
    try {
      const rpcProvider = new ethers.JsonRpcProvider(COSTON2_CHAIN.rpcUrls[0]);
      const toadzStake = new ethers.Contract(CONTRACTS.ToadzStake, ABIS.ToadzStake, rpcProvider);
      const buffer = new ethers.Contract(CONTRACTS.Buffer, ABIS.Buffer, rpcProvider);
      
      const pond = new ethers.Contract(CONTRACTS.POND, ABIS.POND, rpcProvider);
      const [totalWflr, totalPond, cap, totalPGS, stakeFtso, bufferFtso, pondPrice] = await Promise.all([
        toadzStake.totalWflrStaked(),
        toadzStake.totalPondStaked(),
        toadzStake.poolCap(),
        toadzStake.totalPGSDistributed().catch(() => 0n),
        toadzStake.totalFtsoRewardsClaimed().catch(() => 0n),
        buffer.totalFtsoRewardsClaimed().catch(() => 0n),
        pond.getCurrentPrice().catch(() => ethers.parseEther("0.5")),
      ]);

      // Top staker return - skip indexer on testnet
      let topReturn = 0;

      setPoolStats({
        pondPrice: Number(ethers.formatEther(pondPrice)),
        totalWflr: Number(ethers.formatEther(totalWflr)),
        totalPond: Number(ethers.formatEther(totalPond)),
        cap: Number(ethers.formatEther(cap)),
        totalPGS: Number(ethers.formatEther(totalPGS)),
        totalFtsoRewards: Number(ethers.formatEther(stakeFtso)) + Number(ethers.formatEther(bufferFtso)),
        topStakerReturn: topReturn,
      });
    } catch (err) {
      console.error('Failed to load public stats:', err);
    }
  };

  // Load public stats on mount
  React.useEffect(() => {
    loadPublicStats();
  }, []);

 // Load marketplace listings - disabled on Coston2 (no getAllActiveListings)
React.useEffect(() => {
  // ToadzMarket on Coston2 doesn't have getAllActiveListings
  setMarketListings([]);
}, []);
  
  // Sync OG count from Songbird to Flare (calls backend)
const syncToFlare = async () => {
  if (!walletAddress) return;
  setSyncPending(true);
  try {
    // Read from Songbird
    const songbirdProvider = new ethers.JsonRpcProvider('https://coston2-api.flare.network/ext/C/rpc');
    
    const ogVaultSongbird = new ethers.Contract(
      CONTRACTS.BoostRegistry,
     ['function lockedCount(address) view returns (uint256)'],
      songbirdProvider
    );
    let ogCount = 0;
    try { ogCount = await ogVaultSongbird.lockedCount(walletAddress); } catch (e) {}
    
    const marketSongbird = new ethers.Contract(
      '0x410c65DAb32709046B1BA63caBEB4d2824D9E902',
      ['function getUserListingCount(address) view returns (uint256)'],
      songbirdProvider
    );
    let listingCount = 0;
    try { listingCount = await marketSongbird.getUserListingCount(walletAddress); } catch (e) {}
    
    const response = await fetch('/api/sync-og', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        address: walletAddress,
        ogCount: ogCount.toString(),
        listingCount: listingCount.toString()
      }),
    });
    
    if (response.ok) {
      showToast('success', 'Boost synced');
      setBoostSyncNeeded(false);
      await loadUserData(walletAddress, contracts);
    } else {
      showToast('error', 'Sync failed. Please try again.');
    }
  } catch (err) {
    console.error('Sync error:', err);
    showToast('error', 'Sync failed: ' + (err.reason || err.message));
  }
  setSyncPending(false);
};

  // Wallet connection
  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      showToast('error', 'Please install MetaMask or another Web3 wallet');
      return;
    }
    
    try {
      // Request accounts first
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        showToast('error', 'No accounts found. Please unlock your wallet.');
        return;
      }
      
      // Then switch network
      await switchToFlare();
      
      // Small delay for wallet to settle after network switch
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const address = accounts[0];
      setWalletAddress(address);
      setConnected(true);
      
      // Setup ethers provider and signer
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const web3Signer = await web3Provider.getSigner();
      setProvider(web3Provider);
      setSigner(web3Signer);
      
      // Get native balance + WFLR balance (show combined available)
      const nativeBalance = await web3Provider.getBalance(address);
      const wflrContract = new ethers.Contract(CONTRACTS.WFLR, ABIS.WFLR, web3Signer);
      const wflrBalance = await wflrContract.balanceOf(address);
      setWalletBalance(Number(ethers.formatEther(nativeBalance + wflrBalance)));
      
      // Setup contracts
      const toadzStake = new ethers.Contract(CONTRACTS.ToadzStake, ABIS.ToadzStake, web3Signer);
      const pond = new ethers.Contract(CONTRACTS.POND, ABIS.POND, web3Signer);
      const wflr = new ethers.Contract(CONTRACTS.WFLR, ABIS.WFLR, web3Signer);
      const boostRegistry = new ethers.Contract(CONTRACTS.BoostRegistry, ABIS.BoostRegistry, web3Signer);
      const toadzMint = CONTRACTS.ToadzMint ? new ethers.Contract(CONTRACTS.ToadzMint, ABIS.ToadzMint, web3Signer) : null;

      setContracts({ toadzStake, pond, wflr, boostRegistry, toadzMint });

      // Load user data
      await loadUserData(address, { toadzStake, pond, wflr, boostRegistry, toadzMint });
      
    } catch (err) {
      console.error('Wallet connection failed:', err);
      showToast('error', 'Connection failed: ' + (err.message || 'Unknown error'));
    }
  };

  // Load user data from contracts
  const loadUserData = async (address, contractInstances) => {
    try {
      const { toadzStake, pond, wflr, boostRegistry, toadzMint } = contractInstances;
      
      // Get position
      const position = await toadzStake.positions(address);
const pendingRewards = await toadzStake.getPendingRewards(address);
const totalDeposited = await toadzStake.totalDeposited(address);
const lockExpiry = Number(position[3]);
const now = Math.floor(Date.now() / 1000);
const isExpired = lockExpiry > 0 && lockExpiry < now;

setUserPosition({
  wflrStaked: Number(ethers.formatEther(position[0])),
  pondStaked: Number(ethers.formatEther(position[1])),
  earnedWflr: Number(ethers.formatEther(position[2])) + Number(ethers.formatEther(pendingRewards)),
  lockExpiry: lockExpiry,
  lockMultiplier: Number(position[4]),
  totalDeposited: Number(ethers.formatEther(totalDeposited)),  
});

setLockExpired(isExpired);
      
      // Get balances
      const pondBal = await pond.balanceOf(address);
      const wflrBal = await wflr.balanceOf(address);
      setPondBalance(Number(ethers.formatEther(pondBal)));
      setWflrBalance(Number(ethers.formatEther(wflrBal)));
      
      // Get pool stats
      const totalWflr = await toadzStake.totalWflrStaked();
      const totalPond = await toadzStake.totalPondStaked();
      const cap = await toadzStake.poolCap();
      const totalPGS = await toadzStake.totalPGSDistributed().catch(() => 0n);
      const stakeFtso = await toadzStake.totalFtsoRewardsClaimed().catch(() => 0n);
      const buffer = new ethers.Contract(CONTRACTS.Buffer, ABIS.Buffer, toadzStake.runner);
      const bufferFtso = await buffer.totalFtsoRewardsClaimed().catch(() => 0n);
      
      // Top staker return - skip indexer on testnet
      let topReturn = 0;
      
      const pondContract = new ethers.Contract(CONTRACTS.POND, ABIS.POND, toadzStake.runner);
      const pondPrice = await pondContract.getCurrentPrice().catch(() => ethers.parseEther("0.5"));
      setPoolStats({
        pondPrice: Number(ethers.formatEther(pondPrice)),
        totalWflr: Number(ethers.formatEther(totalWflr)),
        totalPond: Number(ethers.formatEther(totalPond)),
        cap: Number(ethers.formatEther(cap)),
        totalPGS: Number(ethers.formatEther(totalPGS)),
        totalFtsoRewards: Number(ethers.formatEther(stakeFtso)) + Number(ethers.formatEther(bufferFtso)),
        topStakerReturn: topReturn,
      });
      
      // Get boost (may fail on Coston2 if ogVaultOracle is not a contract)
      try {
        const boost = await boostRegistry.getUserBoost(address);
        setBoostData({
          boost: Number(boost) / 1e18,
          stakedNfts: [],
        });
      } catch (e) {
        console.log('Boost not available on testnet');
        setBoostData({ boost: 0, stakedNfts: [] });
      }
      
      // Boost sync not needed on Coston2 testnet
      setBoostSyncNeeded(false);
      
      // Mint not available on Coston2
      setMintData({ isLive: false, totalMinted: 0, maxSupply: 0, credits: 0 });
      
      // OG NFT data / OGVault / TadzClaimer — not available on Coston2 testnet
      setOgNftData({ collections: [], totalOwned: 0, totalLocked: 0 });
      setTadzClaimData({ allocation: 0, claimed: 0, claimable: 0, proof: [], loading: false });
      setAllLockers([]);
      
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  };

  // Refresh data periodically
  useEffect(() => {
    if (connected && walletAddress && Object.keys(contracts).length > 0) {
      const interval = setInterval(() => {
        loadUserData(walletAddress, contracts);
      }, 30000); // every 30 seconds
      return () => clearInterval(interval);
    }
  }, [connected, walletAddress, contracts]);

  // Auto-reconnect wallet on page load
  useEffect(() => {
    const autoConnect = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            connectWallet();
          }
        } catch (err) {
          console.log('Auto-connect check failed:', err);
        }
      }
    };
    autoConnect();
  }, []);

useEffect(() => {
    const loadMarketListings = async () => {
      try {
        // Coston2 ToadzMarket doesn't have getAllActiveListings - skip
        setFlareListings([]);
        return;
        const [collections, tokenIds, sellers, prices, commitmentDays, listedAts] = [[], [], [], [], [], []];
        const saleListings = collections.map((c, i) => ({
          collection: c,
          tokenId: tokenIds[i].toString(),
          seller: sellers[i],
          price: ethers.formatEther(prices[i]),
          dailyRate: '0', // Sales don't have rental rate in V5
          commitmentDays: Number(commitmentDays[i]),
          listedAt: Number(listedAts[i]),
          isRentOnly: false
        }));
        
        // Fetch rental-only listings
        const [rCollections, rTokenIds, rOwners, rDailyRates, rCommitmentEnds] = await market.getAllActiveRentalListings();
        const nowSec = Math.floor(Date.now() / 1000);
        const rentalListings = rCollections.map((c, i) => {
          const endTime = Number(rCommitmentEnds[i]);
          const secondsRemaining = endTime - nowSec;
          const daysRemaining = secondsRemaining > 0 ? Math.max(1, Math.ceil(secondsRemaining / 86400)) : 0;
          return {
            collection: c,
            tokenId: rTokenIds[i].toString(),
            seller: rOwners[i],
            price: '0',
            dailyRate: ethers.formatEther(rDailyRates[i]),
            commitmentDays: daysRemaining,
            listedAt: 0,
            isRentOnly: true
          };
        });
        
        // Merge and dedupe (sale listings take priority)
        const allListings = [...saleListings];
        for (const rental of rentalListings) {
          const exists = allListings.some(l => 
            l.collection.toLowerCase() === rental.collection.toLowerCase() && 
            l.tokenId === rental.tokenId
          );
          if (!exists) allListings.push(rental);
        }
        
        // Fetch active rental status for ALL Tadz listings (not just rent-only)
        const tadzAddr = '0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6'.toLowerCase();
        const tadzListings = allListings.filter(l => 
          l.collection.toLowerCase() === tadzAddr
        );
        
        for (const listing of tadzListings) {
          try {
            const [renter, startTime, endTime] = await market.getActiveRental(listing.collection, parseInt(listing.tokenId));
            if (renter !== '0x0000000000000000000000000000000000000000' && Number(endTime) > nowSec) {
              listing.renter = renter;
              listing.rentalExpiry = Number(endTime);
            }
          } catch (e) {
            // No active rental
          }
        }
        
        setFlareListings(allListings);
        
        // Fetch Block Bonez images (composable - mixed formats)
        const blockBonezAddr = '0xd1ef6460d9d06a4ce74d9800b1bc11ade822b349';
        const bonezListings = allListings.filter(l => l.collection.toLowerCase() === blockBonezAddr);
        if (bonezListings.length > 0) {
          const nftContract = new ethers.Contract(blockBonezAddr, [
            'function tokenURI(uint256 tokenId) view returns (string)'
          ], provider);
          
          const imageCache = {};
          for (const listing of bonezListings) {
            try {
              let uri = await nftContract.tokenURI(listing.tokenId);
              
              // bafk = unfused, show base layer from Sparkles (only place it exists)
              if (uri.includes('bafk')) {
                imageCache[listing.tokenId] = 'https://sparklesnft.imgix.net/ipfs/bafybeiaz7eo2nrfdetw2ffxctcxdu6y5rcmyct6humpmptfghesaav3wuy/Bones.png';
              } else {
                // Qm = fused, fetch metadata JSON for composed image via ipfs.io
                if (uri.startsWith('ipfs://')) {
                  uri = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
                }
                const metaRes = await fetch(uri);
                const meta = await metaRes.json();
                let image = meta.image || '';
                if (image.startsWith('ipfs://')) {
                  image = image.replace('ipfs://', 'https://ipfs.io/ipfs/');
                }
                imageCache[listing.tokenId] = image;
              }
            } catch (e) {
              console.log('Failed to fetch Block Bonez image:', listing.tokenId, e);
              imageCache[listing.tokenId] = 'https://sparklesnft.imgix.net/ipfs/bafybeiaz7eo2nrfdetw2ffxctcxdu6y5rcmyct6humpmptfghesaav3wuy/Bones.png';
            }
          }
          setBlockBonezImages(imageCache);
        }
      } catch (err) {
        console.error('Failed to load Flare listings:', err);
      }
    };
    loadMarketListings();
  }, [marketRefresh]);

  // Update userRentals when wallet or listings change
  useEffect(() => {
    if (walletAddress && flareListings.length > 0) {
      const myRentals = flareListings.filter(l => 
        l.renter && l.renter.toLowerCase() === walletAddress.toLowerCase()
      );
      setUserRentals(myRentals);
    } else {
      setUserRentals([]);
    }
  }, [walletAddress, flareListings]);

  const disconnectWallet = () => {
    setConnected(false);
    setWalletAddress('');
    setWalletBalance(0);
    setProvider(null);
    setSigner(null);
    setContracts({});
    setUserPosition(null);
  };

  // Contract actions
  const handleDeposit = async (amount, tier) => {
    // Ensure on Coston2 network
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== COSTON2_CHAIN.chainId) {
      await switchToFlare();
    }

    setLoading(true);
    try {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const web3Signer = await web3Provider.getSigner();
      const address = await web3Signer.getAddress();

      const wflr = new ethers.Contract(CONTRACTS.WFLR, ABIS.WFLR, web3Signer);
      const pond = new ethers.Contract(CONTRACTS.POND, ABIS.POND, web3Signer);
      const toadzStake = new ethers.Contract(CONTRACTS.ToadzStake, ABIS.ToadzStake, web3Signer);

      const stakeAmount = ethers.parseEther(amount.toString());

      // Figure out how much POND is needed for this stake
      const pondRequired = await toadzStake.getPondRequired(stakeAmount);
      const existingPond = await pond.balanceOf(address);
      const pondToBuy = pondRequired > existingPond ? pondRequired - existingPond : 0n;

      // Calculate WFLR needed for POND purchase (add 2% buffer for rounding)
      let wflrForPond = 0n;
      if (pondToBuy > 0n) {
        const [cost] = await pond.getCostForPond(pondToBuy);
        wflrForPond = cost + (cost / 50n); // +2% buffer
      }

      // Total WFLR needed = stake amount + WFLR to buy POND
      const totalWflrNeeded = stakeAmount + wflrForPond;
      const existingWflr = await wflr.balanceOf(address);
      const needToWrap = totalWflrNeeded > existingWflr ? totalWflrNeeded - existingWflr : 0n;

      // 1. Wrap only what's needed
      if (needToWrap > 0n) {
        showToast('info', 'Wrapping C2FLR...');
        const wrapTx = await wflr.deposit({ value: needToWrap });
        await wrapTx.wait();
      }

      // 2. Buy POND if needed
      if (pondToBuy > 0n) {
        const allowancePond = await wflr.allowance(address, CONTRACTS.POND);
        if (allowancePond < wflrForPond) {
          showToast('info', 'Approving WFLR for POND...');
          const appTx = await wflr.approve(CONTRACTS.POND, ethers.MaxUint256);
          await appTx.wait();
        }
        showToast('info', 'Buying POND...');
        const buyTx = await pond.buy(wflrForPond);
        await buyTx.wait();
      }

      // 3. POND approval NOT needed — ToadzStake calls pond.stake() directly

      // 4. Approve WFLR for staking
      const wflrAllowance = await wflr.allowance(address, CONTRACTS.ToadzStake);
      if (wflrAllowance < stakeAmount) {
        showToast('info', 'Approving WFLR...');
        const appTx = await wflr.approve(CONTRACTS.ToadzStake, ethers.MaxUint256);
        await appTx.wait();
      }

      // 5. Deposit
      showToast('info', 'Depositing...');
      const tx = await toadzStake.deposit(stakeAmount, tier, referrerFromUrl || ethers.ZeroAddress, { gasLimit: 3000000 });
      await tx.wait();
      
      showToast('success', 'Deposit successful!');
      await loadUserData(walletAddress, contracts);
      setShowCustomDeposit(false);
      setDepositFlr('');
    } catch (err) {
      console.error('Deposit failed:', err);
      showToast('error', 'Deposit failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleWithdraw = async () => {
    if (!contracts.toadzStake) return;
    setLoading(true);
    try {
      const tx = await contracts.toadzStake.exit({ gasLimit: 500000 });
      await tx.wait();
      await loadUserData(walletAddress, contracts);
      setShowWithdrawModal(false);
    } catch (err) {
      console.error('Withdraw failed:', err);
      showToast('error', 'Withdraw failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleClaim = async () => {
    if (!contracts.toadzStake) return;
    setLoading(true);
    try {
      const tx = await contracts.toadzStake.claim({ gasLimit: 500000 });
      await tx.wait();
      await loadUserData(walletAddress, contracts);
    } catch (err) {
      console.error('Claim failed:', err);
      showToast('error', 'Claim failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleBuyPond = async (wflrAmount) => {
    if (!contracts.pond || !contracts.wflr) return;
    setLoading(true);
    try {
      const amountWei = ethers.parseEther(wflrAmount.toString());
      
      // Check WFLR balance
      const wflrBal = await contracts.wflr.balanceOf(walletAddress);
      if (wflrBal < amountWei) {
        const wrapTx = await contracts.wflr.deposit({ value: amountWei - wflrBal, gasLimit: 500000 });
        await wrapTx.wait();
      }
      
      // Approve
      const allowance = await contracts.wflr.allowance(walletAddress, CONTRACTS.POND);
      if (allowance < amountWei) {
        const approveTx = await contracts.wflr.approve(CONTRACTS.POND, ethers.MaxUint256, { gasLimit: 500000 });
        await approveTx.wait();
      }
      
      const data = contracts.pond.interface.encodeFunctionData('buy', [amountWei]);
      
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: CONTRACTS.POND,
          data: data,
          gas: '0xF4240'
        }]
      });
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      let receipt = null;
      while (!receipt) {
        await new Promise(r => setTimeout(r, 2000));
        receipt = await provider.getTransactionReceipt(txHash);
      }
      const tx = { wait: async () => receipt };

      
      await tx.wait();
      await loadUserData(walletAddress, contracts);
      setSwapMode(null);
      setSwapAmount('');
    } catch (err) {
      console.error('Buy POND failed:', err);
      showToast('error', 'Buy failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleSellPond = async (pondAmount) => {
    if (!contracts.pond) return;
    setLoading(true);
    try {
      const amountWei = ethers.parseEther(pondAmount.toString());
     const tx = await contracts.pond.startRedemption(amountWei, { gasLimit: 500000 });
      await tx.wait();
      await loadUserData(walletAddress, contracts);
      setSwapMode(null);
      setSwapAmount('');
      showToast('success', 'Redemption started');
    } catch (err) {
      console.error('Redeem POND failed:', err);
      showToast('error', 'Redeem failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleStakeNFT = async (collection, tokenId) => {
    if (!contracts.boostRegistry) return;
    setLoading(true);
    try {
      // Approve NFT
      const nftContract = new ethers.Contract(collection, ABIS.ERC721, signer);
      const isApproved = await nftContract.isApprovedForAll(walletAddress, CONTRACTS.BoostRegistry);
      if (!isApproved) {
        const approveTx = await nftContract.setApprovalForAll(CONTRACTS.BoostRegistry, true, { gasLimit: 500000 });
        await approveTx.wait();
      }
      
      const tx = await contracts.boostRegistry.stake(collection, tokenId, { gasLimit: 500000 });
      await tx.wait();
      await loadUserData(walletAddress, contracts);
      setStakeNftModal(null);
    } catch (err) {
      console.error('Stake NFT failed:', err);
      showToast('error', 'Stake failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleLockOG = async (collection, tokenId) => {
    showToast('error', 'OG Vault not available on Coston2 testnet');
  };

  // Claim Tadz - not available on Coston2
  const handleClaimTadz = async () => {
    showToast('error', 'Tadz claim not available on Coston2 testnet');
  };

  const handleUnstakeNFT = async (collection, tokenId) => {
    if (!contracts.boostRegistry) return;
    setLoading(true);
    try {
      await contracts.boostRegistry.unstake(collection, tokenId, { gasLimit: 500000 });
      await tx.wait();
      await loadUserData(walletAddress, contracts);
      setUnstakeNftModal(null);
    } catch (err) {
      console.error('Unstake NFT failed:', err);
      showToast('error', 'Unstake failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleMint = async (quantity) => {
    if (!contracts.toadzMint) return;
    setLoading(true);
    try {
      await contracts.toadzMint.mint(quantity, { gasLimit: 500000 });
      await tx.wait();
      await loadUserData(walletAddress, contracts);
    } catch (err) {
      console.error('Mint failed:', err);
      showToast('error', 'Mint failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleCancelListing = async (collection, tokenId, isRentOnly) => {
    if (!signer) return;
    setLoading(true);
    try {
      if (isRentOnly) {
        const market = new ethers.Contract('0x58128c30cFAFCd8508bB03fc396c5a61FBC6Bf2F', [
          'function cancelRentalListing(address,uint256)'
        ], signer);
        const tx = await market.cancelRentalListing(collection, tokenId);
        await tx.wait();
      } else {
        const market = new ethers.Contract('0x58128c30cFAFCd8508bB03fc396c5a61FBC6Bf2F', [
          'function cancel(address,uint256)'
        ], signer);
        const tx = await market.cancel(collection, tokenId);
        await tx.wait();
      }
      setFlareListings(prev => prev.filter(l => !(l.collection === collection && l.tokenId === tokenId)));
    } catch (err) {
      console.error('Cancel failed:', err);
      showToast('error', 'Cancel failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleBuyNFT = async (collection, tokenId, price) => {
    if (!signer) return;
    setLoading(true);
    try {
      const market = new ethers.Contract('0x58128c30cFAFCd8508bB03fc396c5a61FBC6Bf2F', [
        'function buy(address,uint256) payable'
      ], signer);
      const tx = await market.buy(collection, tokenId, { value: ethers.parseEther(price) });
      await tx.wait();
      setFlareListings(prev => prev.filter(l => !(l.collection === collection && l.tokenId === tokenId)));
      showToast('success', 'NFT purchased successfully');
    } catch (err) {
      console.error('Buy failed:', err);
      showToast('error', 'Buy failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleRentNFT = async (listing, days) => {
    if (!signer) {
      showToast('error', 'Please connect wallet');
      return;
    }
    setLoading(true);
    try {
      const marketContract = new ethers.Contract(CONTRACTS.ToadzMarket, [
        'function rent(address collection, uint256 tokenId, uint256 rentalDays) external'
      ], signer);
      
      // V5: No upfront payment - daily LP deduction from stake position
      const tx = await marketContract.rent(
        listing.collection,
        parseInt(listing.tokenId),
        days
      );
      await tx.wait();
      
      showToast('success', `Boost rented for ${days} days (daily LP deduction)`);
      resetBoostRentModal();
      setMarketRefresh(prev => prev + 1); // Refresh listings
    } catch (err) {
      console.error('Rent failed:', err);
      showToast('error', 'Rent failed: ' + (err.reason || err.message));
    }
    setLoading(false);
  };

  const formatAddress = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : '';

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // User data - real contract data only
  const getUserPfpTokenId = () => {
    // If userPfp is a number, use it directly. If legacy string, map it.
    if (typeof userPfp === 'number' || !isNaN(parseInt(userPfp))) {
      return parseInt(userPfp);
    }
    return legacyPfpMap[userPfp] || 121;
  };
  
  const user = {
    address: walletAddress,
    pfp: userPfp,
    pfpTokenId: getUserPfpTokenId(),
    displayName: userName,
    lpPosition: userPosition ? userPosition.wflrStaked : 0,
    pondBalance: pondBalance,
    wflrBalance: wflrBalance,
    flrBalance: walletBalance,
    isOG: ogNftData.totalLocked > 0,
    freeNFTs: mintData.credits,
    weight: (() => {
      const nftBoost = boostData.boost || 0;
      const lockMult = userPosition?.lockMultiplier || 1;
      const totalBoost = lockMult * (1 + nftBoost);
      return `${totalBoost.toFixed(2)}x`;
    })(),
    flrPerDay: 0, // calculated from contract
    pondPerDay: 0, // calculated from contract
    // Fixed earnings: position = wflrStaked + earnedWflr, earned = position - deposited
    totalPosition: userPosition ? (userPosition.wflrStaked + userPosition.earnedWflr) : 0,
    totalEarned: userPosition ? Math.max(0, (userPosition.wflrStaked + userPosition.earnedWflr) - userPosition.totalDeposited) : 0,
    // Keep old fields for compatibility
    principalEarned: userPosition ? Math.max(0, userPosition.wflrStaked - userPosition.totalDeposited) : 0,
    yieldEarned: userPosition?.earnedWflr || 0,
    totalNFTs: ogNftData.totalOwned,
    lockEnd: userPosition?.lockExpiry || 0,
    lockTier: userPosition?.lockMultiplier || 0,
    pondStaked: userPosition?.pondStaked || 0,
    totalDeposited: userPosition?.totalDeposited || 0,
  };
  
  // Pool info - real contract data only
  const poolInfo = {
    totalWflr: poolStats.totalWflr,
    totalPond: poolStats.totalPond,
    cap: poolStats.cap,
    isCapped: poolStats.cap > 0 && poolStats.totalWflr >= poolStats.cap,
    principalGrowthPct: poolStats.totalWflr > 0 ? (poolStats.totalPGS / poolStats.totalWflr * 100).toFixed(1) : '0',
    yieldPct: poolStats.totalWflr > 0 ? (poolStats.totalFtsoRewards / poolStats.totalWflr * 100).toFixed(1) : '0',
    totalPaid: poolStats.totalPGS + poolStats.totalFtsoRewards,
    topStakerPct: (poolStats.topStakerReturn || 0).toFixed(1),
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const diff = mintTargetDate - now;
      
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        setIsLive(true);
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdown({ days, hours, minutes, seconds });
    }, 1000);
    return () => clearInterval(timer);
  }, [mintTargetDate]);

  const pad = (n) => String(n).padStart(2, '0');
  const getRarityColor = (r) => ({ Legendary: '#f59e0b', Epic: '#a855f7', Rare: '#3b82f6', Common: '#6b7280' }[r] || '#6b7280');

  // SVG Icons for bottom nav
  const NavIcons = {
    pool: ({ color }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v6"/>
        <path d="M12 22c-4-3-8-6-8-11a8 8 0 1 1 16 0c0 5-4 8-8 11z"/>
      </svg>
    ),
    mint: ({ color }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
    vault: ({ color }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    refer: ({ color }) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    )
  };
  
  const navLabels = {
    pool: 'Stake',
    mint: 'Boost',
    vault: 'Lock',
    refer: 'Refer'
  };

  // Toast Notification Component
  const Toast = () => {
    if (!toast) return null;
    
    const colors = {
      success: { bg: 'rgba(0,255,136,0.15)', border: 'rgba(0,255,136,0.3)', icon: '#00ff88', iconBg: 'rgba(0,255,136,0.2)' },
      error: { bg: 'rgba(255,100,100,0.15)', border: 'rgba(255,100,100,0.3)', icon: '#ff6b6b', iconBg: 'rgba(255,100,100,0.2)' },
      info: { bg: 'rgba(0,212,255,0.15)', border: 'rgba(0,212,255,0.3)', icon: '#00d4ff', iconBg: 'rgba(0,212,255,0.2)' }
    };
    const c = colors[toast.type] || colors.info;
    
    return (
      <div style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        maxWidth: '90%'
      }}>
        <div style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: c.iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: c.icon,
          flexShrink: 0
        }}>
          {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'i'}
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{toast.message}</span>
        <button 
          onClick={() => setToast(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 14,
            cursor: 'pointer',
            marginLeft: 8,
            padding: 0
          }}
        >✕</button>
      </div>
    );
  };

  const BottomNav = () => (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      background: 'rgba(3,3,5,0.95)',
      backdropFilter: 'blur(24px)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      paddingTop: 10,
      paddingBottom: isAndroid ? 56 : 'calc(12px + env(safe-area-inset-bottom, 20px))',
      display: 'flex',
      justifyContent: 'space-around'
    }}>
      {['pool', 'mint', 'vault', 'refer'].map(tab => {
        const IconComponent = NavIcons[tab];
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <IconComponent color={isActive ? '#00ff88' : 'rgba(255,255,255,0.4)'} />
            <span style={{ 
              fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
              color: isActive ? '#00ff88' : 'rgba(255,255,255,0.4)',
              opacity: isActive ? 1 : 0.7
            }}>{navLabels[tab]}</span>
          </button>
        );
      })}
    </nav>
  );

  // ============ PROFILE DROPDOWN ============
    const ProfileDropdown = () => {
    const percentGain = user.totalDeposited > 0 
      ? (((user.lpPosition - user.totalDeposited) / user.totalDeposited) * 100).toFixed(1)
      : 0;
    const totalEarned = user.totalDeposited > 0 
      ? (user.lpPosition - user.totalDeposited).toFixed(2) 
      : 0;
    const lockDaysLeft = userPosition?.lockExpiry 
      ? Math.max(0, Math.ceil((userPosition.lockExpiry * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;
    const lockTier = userPosition?.lockMultiplier === 4 ? '365d' : userPosition?.lockMultiplier === 2 ? '180d' : '90d';
    
    return (
    <div 
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 8,
        width: 280,
        background: 'rgba(12,12,15,0.98)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        zIndex: 500
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => { setTempUserName(userName); setShowProfileEditor(true); setShowProfileDropdown(false); }}
          style={{
            width: 44, height: 44, borderRadius: 12,
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', position: 'relative'
          }}
        >
          <img src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${user.pfpTokenId}.svg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 16, height: 16, borderRadius: 8,
            background: '#1a1a1f', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8
          }}>✏️</span>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{userName || formatAddress(walletAddress)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{userName ? formatAddress(walletAddress) : `${walletBalance.toFixed(0)} FLR`}</div>
        </div>
      </div>

      {/* Stats Grid - NEUTRAL */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: 12,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: user.lpPosition > 0 ? '#fff' : 'rgba(255,255,255,0.3)' }}>{user.lpPosition > 0 ? user.lpPosition.toLocaleString() : '—'}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>LP POSITION</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: 12,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{user.weight}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>BOOST</div>
        </div>
      </div>

      {/* Lifetime Return - GREEN HIGHLIGHT */}
      {user.lpPosition > 0 && (
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,255,136,0.1) 0%, rgba(0,255,136,0.04) 100%)',
        border: '1px solid rgba(0,255,136,0.15)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>LIFETIME RETURN</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#00ff88' }}>+{percentGain}%</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>({totalEarned} FLR)</span>
        </div>
      </div>
      )}

      {/* Lock Status */}
      {user.lpPosition > 0 && (
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>LOCK</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{lockTier}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>REMAINING</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: lockDaysLeft <= 7 ? '#ffaa00' : '#fff' }}>
            {lockDaysLeft}d left
          </div>
        </div>
      </div>
      )}

      {/* Referrals */}
      <button 
        onClick={() => { setActiveTab('refer'); setShowProfileDropdown(false); }}
        style={{
          width: '100%',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '12px 14px',
          cursor: 'pointer',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 12
        }}
      >
        <span>🔗 Referrals</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>0 earned</span>
      </button>

      {/* Add to LP - Main CTA */}
      <button 
        onClick={() => { setActiveTab('pool'); setShowProfileDropdown(false); }}
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
          border: 'none',
          borderRadius: 10,
          padding: '12px',
          cursor: 'pointer',
          color: '#000',
          fontSize: 13,
          fontWeight: 700
        }}
      >Add to LP</button>

      {/* Admin Link - only for admin wallet */}
      {walletAddress?.toLowerCase() === '0x9bDB29529016a15754373B9D5B5116AB728E916e'.toLowerCase() && (
        <button 
          onClick={() => { setActiveTab('admin'); setShowProfileDropdown(false); }}
          style={{
            width: '100%',
            marginTop: 8,
            background: 'rgba(255,100,100,0.1)',
            border: '1px solid rgba(255,100,100,0.2)',
            borderRadius: 8,
            padding: '10px',
            cursor: 'pointer',
            color: '#ff6b6b',
            fontSize: 12,
            fontWeight: 600
          }}
        >🔧 Admin Dashboard</button>
      )}

      {/* Disconnect */}
      <button 
        onClick={() => { disconnectWallet(); setShowProfileDropdown(false); }}
        style={{
          width: '100%',
          marginTop: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)',
          fontSize: 11,
          padding: '8px'
        }}
      >Disconnect</button>
    </div>
    );
  };

  // ============ PROFILE EDITOR MODAL ============
  // Profile editor modal rendered inline below to prevent focus loss

  const NavTab = ({ id, label }) => (
    <button onClick={() => setActiveTab(id)} style={{
      padding: '10px 22px', fontSize: 13, fontWeight: 600,
      background: activeTab === id ? 'rgba(255,255,255,0.08)' : 'transparent',
      color: activeTab === id ? '#fff' : 'rgba(255,255,255,0.4)',
      border: 'none', borderRadius: 9, cursor: 'pointer', letterSpacing: 0.2,
      boxShadow: activeTab === id ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
    }}>{label}</button>
  );

  // ============ NFT STAKING PANEL ============
  const NFTPanel = () => {
    const stakedCount = user.stakedCollections.reduce((sum, c) => sum + c.count, 0);
    const unstakedCount = user.unstakedCollections.reduce((sum, c) => sum + c.count, 0);
    const totalWeight = user.stakedCollections.reduce((sum, c) => sum + c.weight, 0);
    const potentialWeight = user.unstakedCollections.reduce((sum, c) => sum + c.weight, 0);
    
    return (
    <div style={{
      position: 'fixed', 
      top: 0, 
      right: 0, 
      bottom: 0, 
      left: isDesktop ? 'auto' : 0,
      width: isDesktop ? 420 : 'auto',
      background: 'linear-gradient(180deg, #0c0c0f 0%, #08080a 100%)', 
      borderLeft: isDesktop ? '1px solid rgba(255,255,255,0.06)' : 'none',
      zIndex: 400, 
      display: 'flex', 
      flexDirection: 'column',
      boxShadow: isDesktop ? '-20px 0 60px rgba(0,0,0,0.5)' : 'none'
    }}>
      {/* Header */}
      <div style={{
        padding: isDesktop ? '20px 24px' : '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(255,255,255,0.01)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}><img src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${user.pfpTokenId}.svg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3 }}>{formatAddress(walletAddress)}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              {user.totalNFTs} NFTs
            </div>
          </div>
        </div>
        <button onClick={() => setShowNFTPanel(false)} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', 
          color: 'rgba(255,255,255,0.5)',
          fontSize: 18, cursor: 'pointer', padding: '6px 10px', borderRadius: 8,
          lineHeight: 1
        }}>×</button>
      </div>

      {/* Earnings Summary */}
      <div style={{ 
        padding: '18px 26px', 
        background: 'linear-gradient(165deg, rgba(0,255,136,0.08) 0%, rgba(0,255,136,0.02) 100%)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, marginBottom: 4 }}>FLR EARNINGS</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#00ff88', letterSpacing: -0.5 }}>{user.flrPerDay}/day</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, marginBottom: 4 }}>NFT BOOST</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{user.weight}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 10 }}>
          +{user.pondPerDay} POND/day • Requires LP position
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
        <button onClick={() => setNftTab('staked')} style={{
          flex: 1, padding: '15px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          background: nftTab === 'staked' ? 'rgba(0,255,136,0.06)' : 'transparent',
          color: nftTab === 'staked' ? '#00ff88' : 'rgba(255,255,255,0.35)',
          border: 'none', borderBottom: nftTab === 'staked' ? '2px solid #00ff88' : '2px solid transparent',
          letterSpacing: 0.3
        }}>Earning ({stakedCount})</button>
        <button onClick={() => setNftTab('unstaked')} style={{
          flex: 1, padding: '15px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          background: nftTab === 'unstaked' ? 'rgba(255,100,100,0.06)' : 'transparent',
          color: nftTab === 'unstaked' ? '#ff6b6b' : 'rgba(255,255,255,0.35)',
          border: 'none', borderBottom: nftTab === 'unstaked' ? '2px solid #ff6b6b' : '2px solid transparent',
          letterSpacing: 0.3
        }}>Not Earning ({unstakedCount})</button>
      </div>

      {/* NFT List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
        {nftTab === 'staked' ? (
          <div>
            {/* Ecosystem */}
            {user.stakedCollections.filter(c => c.type === 'ecosystem').length > 0 && (
              <>
                <div style={{ fontSize: 10, color: 'rgba(0,255,136,0.7)', marginBottom: 10 }}>ECOSYSTEM • 2.5× FLOOR</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {user.stakedCollections.filter(c => c.type === 'ecosystem').map((col, i) => (
                    <div key={i} style={{
                      background: 'linear-gradient(165deg, rgba(0,255,136,0.08) 0%, rgba(0,255,136,0.02) 100%)', 
                      border: '1px solid rgba(0,255,136,0.15)',
                      borderRadius: 14, padding: 16, textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{col.emoji}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{col.name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{col.count} staked</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#00ff88' }}>+{col.weight}x</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            
            {/* Outside */}
            {user.stakedCollections.filter(c => c.type === 'outside').length > 0 && (
              <>
                <div style={{ fontSize: 10, color: 'rgba(192,132,252,0.7)', marginBottom: 10 }}>OUTSIDE • 1.5× FLOOR</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {user.stakedCollections.filter(c => c.type === 'outside').map((col, i) => (
                    <div key={i} style={{
                      background: 'linear-gradient(165deg, rgba(192,132,252,0.08) 0%, rgba(192,132,252,0.02) 100%)', 
                      border: '1px solid rgba(192,132,252,0.15)',
                      borderRadius: 14, padding: 16, textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{col.emoji}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{col.name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{col.count} @ {col.listPrice} FLR</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#c084fc' }}>+{col.weight}x</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            
            {stakedCount === 0 && (
              <div style={{ textAlign: 'center', padding: 50, color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                No NFTs earning yet
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* FOMO Banner */}
            <div style={{
              background: 'linear-gradient(165deg, rgba(255,100,100,0.12) 0%, rgba(255,150,50,0.08) 100%)',
              border: '1px solid rgba(255,100,100,0.25)',
              borderRadius: 16, padding: 20, marginBottom: 18, textAlign: 'center'
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Missing boost</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>+{potentialWeight.toFixed(1)}x</div>
            </div>

            {/* Ecosystem */}
            {user.unstakedCollections.filter(c => c.type === 'ecosystem').length > 0 && (
              <>
                <div style={{ fontSize: 10, color: 'rgba(0,255,136,0.7)', marginBottom: 10 }}>ECOSYSTEM • 2.5× FLOOR</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {user.unstakedCollections.filter(c => c.type === 'ecosystem').map((col, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 14, padding: 16, textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>{col.emoji}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{col.name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{col.count} in wallet</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>+{col.weight}x boost</div>
                      <button style={{
                        width: '100%', background: '#00ff88', color: '#000', border: 'none',
                        borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                      }}>Stake</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            
            {/* Outside */}
            {user.unstakedCollections.filter(c => c.type === 'outside').length > 0 && (
              <>
                <div style={{ fontSize: 10, color: 'rgba(192,132,252,0.7)', marginBottom: 10 }}>OUTSIDE • 1.5× FLOOR</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {user.unstakedCollections.filter(c => c.type === 'outside').map((col, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 14, padding: 16, textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>{col.emoji}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{col.name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{col.count} NFTs</div>
                      <div style={{ fontSize: 9, color: 'rgba(192,132,252,0.6)', marginBottom: 8 }}>@ {col.listPrice} FLR</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>+{col.weight}x boost</div>
                      <button style={{
                        width: '100%', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                      }}>Stake</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )};

  // ============ PRE-MINT ============
  const PreMintPage = () => {
    // Mobile-first: EXCITING, PREMIUM
    if (!isDesktop) {
      return (
        <div style={{ paddingTop: 12, paddingBottom: 40 }}>
          {/* Page Title + Tagline */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, letterSpacing: -1 }}>Mint</h1>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Spend POND, earn Boosts</div>
          </div>

          {/* Centered title with gradient */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ 
              display: 'inline-block',
              background: 'rgba(255,200,100,0.15)', 
              border: '1px solid rgba(255,200,100,0.3)',
              padding: '6px 14px', 
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 700,
              color: '#ffc864',
              marginBottom: 8,
              letterSpacing: 1
            }}>DROPPING SOON</div>
            <h1 style={{ 
              fontSize: 36, 
              fontWeight: 900, 
              letterSpacing: -1.5, 
              margin: 0,
              background: 'linear-gradient(135deg, #ff6b9d 0%, #c084fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>Fox Girls</h1>
          </div>

          {/* BIG Art with glow + stats overlay */}
          <div style={{
            aspectRatio: '1',
            borderRadius: 20,
            background: 'linear-gradient(165deg, #2d7d6d 0%, #1a5a4a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            position: 'relative',
            boxShadow: '0 0 60px rgba(0,255,136,0.15), 0 20px 40px -20px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            <span style={{ fontSize: 120 }}>🦊</span>
            {/* Stats overlay at bottom */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              padding: '14px 20px',
              display: 'flex',
              justifyContent: 'space-around'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>5,000</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>Supply</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>100</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>FLR</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#00ff88' }}>FREE</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>w/ LP</div>
              </div>
            </div>
          </div>

          {/* Countdown - BIG colorful boxes */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: 8, 
            marginBottom: 16 
          }}>
            {[
              { val: countdown.days, label: 'DAYS', color: '#ff6b9d' },
              { val: countdown.hours, label: 'HRS', color: '#c084fc' },
              { val: countdown.minutes, label: 'MIN', color: '#00ff88' },
              { val: countdown.seconds, label: 'SEC', color: '#f59e0b' }
            ].map((item, i) => (
              <div key={i} style={{
                background: `${item.color}10`,
                border: `1px solid ${item.color}30`,
                borderRadius: 14,
                padding: '14px 8px',
                textAlign: 'center'
              }}>
                <div style={{ 
                  fontSize: 28, 
                  fontWeight: 900, 
                  fontFamily: 'monospace',
                  color: item.color
                }}>{pad(item.val)}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Your position or connect */}
          {connected ? (
            <div style={{
              background: 'linear-gradient(165deg, rgba(0,255,136,0.1) 0%, rgba(0,255,136,0.02) 100%)',
              border: '1px solid rgba(0,255,136,0.2)',
              borderRadius: 16,
              padding: 20
            }}>
              <div style={{ fontSize: 10, color: '#00ff88', marginBottom: 12, fontWeight: 600, letterSpacing: 0.5 }}>YOUR POSITION</div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: 10,
                marginBottom: 16
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{user.lpPosition.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>LP</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#00ff88' }}>{user.freeNFTs}</div>
                  <div style={{ fontSize: 9, color: '#00ff88' }}>FREE</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{user.weight}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>WEIGHT</div>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('pool')}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 12,
                  padding: '16px',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(0,255,136,0.3)'
                }}
              >Add LP → More Free NFTs</button>
            </div>
          ) : (
            <button 
              onClick={connectWallet}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                color: '#000',
                border: 'none',
                borderRadius: 14,
                padding: '18px',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,255,136,0.3)'
              }}
            >Connect Wallet</button>
          )}
        </div>
      );
    }

    // Desktop version
    return (
      <div style={{ paddingTop: 40, paddingBottom: 40 }}>
        {/* Page Title + Tagline */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8, letterSpacing: -1 }}>Mint</h1>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Spend POND, earn Boosts</div>
        </div>

        <div style={{ 
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 48,
          alignItems: 'center',
          marginBottom: 40
        }}>
          {/* Art */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', inset: '-25%', background: 'radial-gradient(circle, rgba(255,100,150,0.15) 0%, transparent 55%)', filter: 'blur(60px)', zIndex: 0 }} />
            <div style={{
              width: '100%', aspectRatio: '1', maxWidth: 420, borderRadius: 24,
              background: 'linear-gradient(165deg, #2d7d6d 0%, #1a5a4a 100%)',
              position: 'relative', zIndex: 1,
              boxShadow: '0 40px 80px -20px rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
            }}>
              <span style={{ fontSize: 160 }}>🦊</span>
              <div style={{
                position: 'absolute', bottom: 16, left: 16, right: 16,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Fox Girls #???</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Rarity on mint</span>
              </div>
            </div>
          </div>

          {/* Info */}
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(255,200,100,0.1)', border: '1px solid rgba(255,200,100,0.2)',
              padding: '8px 14px', borderRadius: 20, marginBottom: 20
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ffc864' }}>DROPPING SOON</span>
            </div>

            <h1 style={{
              fontSize: 52, fontWeight: 900, letterSpacing: -2.5, marginBottom: 12,
              background: 'linear-gradient(135deg, #ff6b9d 0%, #c084fc 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>Fox Girls</h1>

            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 32, lineHeight: 1.6 }}>
              5,000 unique fox girls. Stake LP to mint free.<br/>
              Every NFT increases your boost to earn more FLR.
            </p>

            {/* Countdown */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 12, fontWeight: 600, letterSpacing: 1 }}>DROP STARTS IN</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {[{ val: countdown.days, label: 'DAYS' }, { val: countdown.hours, label: 'HRS' }, { val: countdown.minutes, label: 'MIN' }, { val: countdown.seconds, label: 'SEC' }].map((item, i) => (
                  <div key={i} style={{
                    minWidth: 75,
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 14, padding: '16px 20px', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'monospace' }}>{pad(item.val)}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 32 }}>
              <div><div style={{ fontSize: 26, fontWeight: 800 }}>5,000</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Supply</div></div>
              <div><div style={{ fontSize: 26, fontWeight: 800 }}>50 POND</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Price</div></div>
              <div><div style={{ fontSize: 26, fontWeight: 800, color: '#00ff88' }}>FREE</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>With LP</div></div>
            </div>
          </div>
        </div>

        {/* User Position - COMMENTED OUT FOR NOW }
        {connected && (
          <div style={{
            background: 'rgba(0,255,136,0.06)',
            border: '1px solid rgba(0,255,136,0.15)', borderRadius: 20, padding: 28, marginBottom: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#00ff88', marginBottom: 4 }}>YOUR POSITION</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Based on your LP stake</div>
              </div>
              {user.isOG && (
                <div style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)', padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#a78bfa' }}>OG ✓</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
              {[
                { label: 'LP POSITION', value: user.lpPosition.toLocaleString(), sub: 'FLR', bg: 'rgba(0,0,0,0.25)' },
                { label: 'POND', value: user.pondBalance.toLocaleString(), sub: 'POND', bg: 'rgba(0,0,0,0.25)' },
                { label: 'FREE NFTs', value: user.freeNFTs, sub: 'at drop', bg: 'rgba(0,255,136,0.08)', color: '#00ff88' },
                { label: 'NFT BOOST', value: user.weight, sub: 'earnings', bg: 'rgba(0,255,136,0.08)', color: '#fff' }
              ].map((s, i) => (
                <div key={i} style={{ 
                  background: s.bg, 
                  borderRadius: 16, 
                  padding: 22, 
                  textAlign: 'center',
                  border: s.color ? `1px solid ${s.color}20` : '1px solid rgba(255,255,255,0.04)'
                }}>
                  <div style={{ fontSize: 10, color: s.color || 'rgba(255,255,255,0.35)', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: s.color || '#fff' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Want more free NFTs? <span style={{ color: '#00ff88' }}>Add to LP</span></div>
              <button onClick={() => setActiveTab('pool')} style={{ 
                background: '#00ff88', 
                color: '#000', border: 'none', borderRadius: 12, padding: '13px 26px', fontSize: 13, fontWeight: 700, cursor: 'pointer'
              }}>Add Liquidity</button>
            </div>
          </div>
        */} 

        {/* Not Connected CTA */}
        {!connected && (
          <div style={{
            background: 'rgba(255,255,255,0.02)', 
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 24, padding: 48, textAlign: 'center'
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Connect to see your allocation</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 28 }}>Stake FLR + POND to claim FREE NFTs at drop</div>
            <button onClick={connectWallet} style={{
              background: '#00ff88', color: '#000', border: 'none', borderRadius: 14,
              padding: '17px 52px', fontSize: 16, fontWeight: 700, cursor: 'pointer'
            }}>Connect Wallet</button>
          </div>
        )}
      </div>
    );
  };

  // ============ LIVE MINT ============
  const LiveMintPage = () => {
    const minted = 2847;
    const total = 5000;
    const percent = Math.round((minted / total) * 100);
    
    // Recent mints - FOMO feed
    const recentMintsWithBoost = [
      { rarity: 'Legendary', boost: '+0.2x', id: '#4721', time: '2s' },
      { rarity: 'Epic', boost: '+0.12x', id: '#4720', time: '8s' },
      { rarity: 'Common', boost: '+0.05x', id: '#4719', time: '12s' },
      { rarity: 'Rare', boost: '+0.08x', id: '#4718', time: '19s' },
      { rarity: 'Epic', boost: '+0.12x', id: '#4717', time: '31s' },
      { rarity: 'Common', boost: '+0.05x', id: '#4716', time: '45s' },
    ];
    
    return (
      <div style={{ paddingTop: isDesktop ? 40 : 16, paddingBottom: isDesktop ? 60 : 100 }}>
        
        {/* Title - centered */}
        <div style={{ textAlign: 'center', marginBottom: isDesktop ? 32 : 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ 
              width: 10, height: 10, 
              background: '#ff4444', 
              borderRadius: '50%', 
              boxShadow: '0 0 12px #ff4444',
              animation: 'pulse 1s infinite' 
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ff4444', letterSpacing: 1 }}>LIVE NOW</span>
          </div>
          <h1 style={{ fontSize: isDesktop ? 42 : 28, fontWeight: 900, letterSpacing: -1, margin: 0 }}>Fox Girls</h1>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            {minted.toLocaleString()} / {total.toLocaleString()} minted
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ maxWidth: 500, margin: '0 auto 24px', padding: '0 20px' }}>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${percent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #00ff88, #00cc6a)',
              borderRadius: 4
            }} />
          </div>
        </div>

        {/* Desktop: side by side / Mobile: stacked */}
        <div style={{
          display: isDesktop ? 'grid' : 'block',
          gridTemplateColumns: isDesktop ? '1fr 1fr' : 'none',
          gap: isDesktop ? 40 : 0,
          alignItems: 'start'
        }}>
          
          {/* LEFT/TOP: Main Art */}
          <div style={{ marginBottom: isDesktop ? 0 : 20 }}>
            <div style={{
              aspectRatio: '1',
              borderRadius: isDesktop ? 24 : 16,
              background: 'linear-gradient(165deg, #2d7d6d 0%, #1a5a4a 100%)',
              boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <span style={{ fontSize: isDesktop ? 180 : 120 }}>🦊</span>
            </div>
          </div>

          {/* RIGHT/BOTTOM: Controls */}
          <div>
            {/* MINT BUTTON FIRST - drives sales */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: isDesktop ? 24 : 20,
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button onClick={() => setMintCount(Math.max(1, mintCount - 1))} style={{
                    width: 48, height: 48,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 24,
                    cursor: 'pointer'
                  }}>−</button>
                  <span style={{ fontSize: 32, fontWeight: 900, minWidth: 50, textAlign: 'center' }}>{mintCount}</span>
                  <button onClick={() => setMintCount(Math.min(10, mintCount + 1))} style={{
                    width: 48, height: 48,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 24,
                    cursor: 'pointer'
                  }}>+</button>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{mintCount * 50} POND</div>
              </div>
              
              <button 
                onClick={() => handleMint(mintCount)}
                disabled={loading}
                style={{
                width: '100%',
                background: loading ? 'rgba(255,68,68,0.5)' : 'linear-gradient(165deg, #ff4444 0%, #cc2222 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                padding: '18px',
                fontSize: 18,
                fontWeight: 800,
                cursor: loading ? 'default' : 'pointer',
                boxShadow: loading ? 'none' : '0 8px 32px rgba(255,68,68,0.4)'
              }}>{loading ? 'Minting...' : 'Mint Now'}</button>
            </div>

            {/* FREE CLAIM - secondary */}
            {connected && user.freeNFTs > 0 && (
              <div style={{
                background: 'rgba(0,255,136,0.08)',
                border: '1px solid rgba(0,255,136,0.2)',
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 2 }}>FREE FROM LP</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{user.freeNFTs} NFTs</div>
                </div>
                <button 
                  onClick={() => handleMint(user.freeNFTs)}
                  disabled={loading}
                  style={{
                  background: loading ? 'rgba(0,255,136,0.5)' : '#00ff88',
                  color: '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: loading ? 'default' : 'pointer'
                }}>{loading ? '...' : 'Claim'}</button>
              </div>
            )}

            {/* LP Stats - compact */}
            {connected && (
              <div style={{
                display: 'flex',
                gap: 8,
                marginBottom: 16
              }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{user.lpPosition.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>LP</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(0,255,136,0.08)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{user.weight}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Boost</div>
                </div>
                <button 
                  onClick={() => setActiveTab('pool')}
                  style={{ 
                    flex: 1, 
                    background: 'rgba(0,255,136,0.1)', 
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: 10, 
                    padding: '12px 14px',
                    color: '#00ff88',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >Add LP</button>
              </div>
            )}

            {!connected && (
              <button 
                onClick={connectWallet}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '14px',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: 16
                }}
              >Connect for Free NFTs</button>
            )}
          </div>
        </div>

        {/* JUST MINTED - BIG, FOMO, EXCITING */}
        <div style={{ marginTop: isDesktop ? 40 : 24 }}>
          <div style={{ 
            fontSize: 11, 
            color: 'rgba(255,255,255,0.4)', 
            marginBottom: 16, 
            letterSpacing: 1,
            textAlign: 'center'
          }}>JUST MINTED</div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isDesktop ? 'repeat(6, 1fr)' : 'repeat(3, 1fr)', 
            gap: isDesktop ? 16 : 10 
          }}>
            {recentMintsWithBoost.slice(0, isDesktop ? 6 : 3).map((m, i) => {
              const rc = getRarityColor(m.rarity);
              return (
                <div 
                  key={i} 
                  style={{
                    background: `linear-gradient(165deg, ${rc}15 0%, ${rc}05 100%)`,
                    border: `1px solid ${rc}30`,
                    borderRadius: isDesktop ? 16 : 12,
                    padding: isDesktop ? 16 : 12,
                    textAlign: 'center',
                    boxShadow: i === 0 ? `0 0 30px ${rc}20` : 'none',
                    animation: i === 0 ? 'fadeIn 0.5s ease' : 'none'
                  }}
                >
                  <div style={{
                    aspectRatio: '1',
                    borderRadius: isDesktop ? 12 : 10,
                    background: 'linear-gradient(165deg, #2d7d6d 0%, #1a5a4a 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: isDesktop ? 40 : 32,
                    marginBottom: 10,
                    border: `2px solid ${rc}50`
                  }}>🦊</div>
                  <div style={{ 
                    fontSize: isDesktop ? 13 : 11, 
                    fontWeight: 800, 
                    color: rc,
                    marginBottom: 2
                  }}>{m.rarity}</div>
                  <div style={{ 
                    fontSize: isDesktop ? 12 : 10, 
                    color: 'rgba(255,255,255,0.5)'
                  }}>{m.boost}</div>
                  <div style={{ 
                    fontSize: 9, 
                    color: 'rgba(255,255,255,0.3)',
                    marginTop: 4
                  }}>{m.time} ago</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

// ============ BOOST MARKET SECTION (REPLACES OLD MARKETPLACE) ============
  const BoostMarketSection = () => {
    // Filter Tadz listings only
    const tadzAddr = '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6';
    const tadzListings = flareListings.filter(l => l.collection.toLowerCase() === tadzAddr);
    
    // Calculate stats
    const totalListed = tadzListings.length;
    const forSaleListings = tadzListings.filter(l => parseFloat(l.price) > 0);
    const rentOnlyListings = tadzListings.filter(l => parseFloat(l.price) === 0);
    const avgBoost = tadzListings.length > 0 
      ? (tadzListings.reduce((sum, l) => sum + Math.min(5.0, 1 + l.commitmentDays / 100), 0) / tadzListings.length).toFixed(1)
      : '0';
    const rentFloorVal = tadzListings.length > 0
      ? Math.min(...tadzListings.map(l => parseFloat(l.dailyRate)))
      : 0;
    const rentFloor = rentFloorVal < 1 ? rentFloorVal.toFixed(4) : rentFloorVal.toFixed(2);
    
    // Apply filter
    const filteredListings = marketFilter === 'forSale' 
      ? forSaleListings 
      : marketFilter === 'rentOnly'
        ? rentOnlyListings
        : tadzListings;
    
    // User's listed count
    const userListedCount = tadzListings.filter(l => 
      walletAddress && l.seller.toLowerCase() === walletAddress.toLowerCase()
    ).length;
    const userTadzCount = userBoostNfts.filter(n => n.address?.toLowerCase() === tadzAddr).length;

    return (
      <div style={{ marginTop: isDesktop ? 40 : 24, paddingBottom: 20 }}>
        {/* Header - centered white like other pages */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ 
            fontSize: isDesktop ? 28 : 24, 
            fontWeight: 800, 
            margin: 0,
            color: '#fff'
          }}>
            Boost Market
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', margin: '8px 0 0 0', fontSize: 13 }}>
            Rent or buy boost power from Tadz holders
          </p>
        </div>
        
        {/* List Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button 
            onClick={() => { 
              if (user.lpPosition <= 0) {
                setShowLpRequiredModal(true);
              } else {
                fetchUserBoostNfts(); 
                setShowBoostListModal(true); 
              }
            }}
            style={{
              background: '#00ff88',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            + List Tadz
          </button>
        </div>

        {/* Stats Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 20,
          padding: 16,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>LISTED</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{totalListed}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>FOR SALE</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#00ff88' }}>{forSaleListings.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>RENT ONLY</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#00d4ff' }}>{rentOnlyListings.length}</div>
          </div>
          {isDesktop && (
            <>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>AVG BOOST</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{avgBoost}x</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>RENT FLOOR</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{rentFloor} <span style={{ fontSize: 12, fontWeight: 400 }}>FLR/d</span></div>
              </div>
            </>
          )}
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'forSale', label: 'For Sale' },
            { id: 'rentOnly', label: 'Rent Only' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setMarketFilter(tab.id)}
              style={{
                background: marketFilter === tab.id ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
                color: marketFilter === tab.id ? '#00ff88' : 'rgba(255,255,255,0.6)',
                border: marketFilter === tab.id ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* Market Listings Table */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          overflow: 'hidden'
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? '60px 1fr 60px 80px 90px 140px' : '38px 36px 1fr auto 56px',
            padding: isDesktop ? '12px 16px' : '10px 14px',
            fontSize: 10,
            color: 'rgba(255,255,255,0.4)',
            fontWeight: 600,
            letterSpacing: 0.5,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.02)',
            gap: isDesktop ? 0 : 10
          }}>
            {isDesktop ? (
              <>
                <div>BOOST</div>
                <div>NFT</div>
                <div>DAYS</div>
                <div>RENT</div>
                <div>BUY</div>
                <div style={{ textAlign: 'right' }}>ACTIONS</div>
              </>
            ) : (
              <>
                <div>BOOST</div>
                <div></div>
                <div>NFT</div>
                <div style={{ textAlign: 'right', paddingRight: 12 }}>DAYS</div>
                <div style={{ textAlign: 'center' }}>ACTION</div>
              </>
            )}
          </div>
          
          {/* Listings */}
          {filteredListings.length === 0 ? (
            <div style={{
              padding: 60,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.4)'
            }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No Tadz listed yet</div>
              <div style={{ fontSize: 12 }}>Be the first to list your Tadz</div>
            </div>
          ) : (
            filteredListings.map((listing, i) => {
              const durationFactor = listing.commitmentDays / 100;
              const calculatedBoost = Math.min(5.0, 1 + durationFactor);
              const nftImage = `https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${listing.tokenId}.svg`;
              const animatedUrl = `https://ipfs.io/ipfs/QmUXYhSJYDPGWmxN5FCZ6Ebc8EVEzUTnZiaNfcrtGZyYZs/${listing.tokenId}_animated.svg`;
              const isOwner = walletAddress && listing.seller.toLowerCase() === walletAddress.toLowerCase();
              const nowSeconds = Math.floor(Date.now() / 1000);
              const elapsedDays = listing.listedAt > 0 ? Math.floor((nowSeconds - listing.listedAt) / 86400) : 0;
              const daysRemaining = listing.isRentOnly ? listing.commitmentDays : Math.max(0, listing.commitmentDays - elapsedDays);
              const hasPrice = parseFloat(listing.price) > 0;
              const dailyRate = parseFloat(listing.dailyRate);
              const price = parseFloat(listing.price);
              const rank = rarityRanks ? (rarityRanks[parseInt(listing.tokenId) - 1] || 0) : 0;
              
              // Check if rented (from contract or mock for demo)
              const isRented = listing.renter && listing.renter !== '0x0000000000000000000000000000000000000000';
              const rentalExpiresIn = listing.rentalExpiry ? Math.max(0, Math.ceil((listing.rentalExpiry - nowSeconds) / 86400)) : 0;
              
              // Progressive boost glow
              const getBoostStyle = (boost) => {
                if (boost >= 2.0) return { fontWeight: 800, fontSize: 14, textShadow: '0 0 14px rgba(0,255,136,0.7), 0 0 24px rgba(0,255,136,0.4), 0 0 32px rgba(0,255,136,0.2)' };
                if (boost >= 1.5) return { fontWeight: 800, fontSize: 14, textShadow: '0 0 12px rgba(0,255,136,0.6), 0 0 20px rgba(0,255,136,0.3)' };
                if (boost >= 1.3) return { fontWeight: 800, textShadow: '0 0 10px rgba(0,255,136,0.5)' };
                if (boost >= 1.2) return { textShadow: '0 0 6px rgba(0,255,136,0.3)' };
                return { opacity: 0.85 };
              };
              const boostStyle = getBoostStyle(calculatedBoost);
              
              // Mobile: determine primary action based on tab
              const mobilePrimaryAction = marketFilter === 'forSale' ? 'buy' : 'rent';
              const isExpanded = expandedMobileRow === i;
              
              // Desktop row
              if (isDesktop) {
                return (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 60px 80px 90px 140px',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    alignItems: 'center',
                    opacity: isRented ? 0.6 : 1
                  }}>
                    {/* BOOST */}
                    <div style={{ color: '#00ff88', fontWeight: 700, fontSize: 13, ...boostStyle }}>{calculatedBoost.toFixed(1)}x</div>
                    
                    {/* NFT */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img 
                        src={nftImage} 
                        onClick={() => setNftDetailModal({
                          tokenId: listing.tokenId,
                          collection: listing.collection,
                          image: nftImage,
                          animatedUrl: animatedUrl,
                          owner: listing.seller
                        })}
                        style={{ width: 36, height: 36, borderRadius: 6, cursor: 'pointer' }} 
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Tadz #{listing.tokenId}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                          {rarityRanks ? `Rank #${rank.toLocaleString()}` : '...'}
                          {isRented && rentalExpiresIn > 0 && (
                            <span style={{ marginLeft: 6, color: 'rgba(139,92,246,0.7)' }}>Available in {rentalExpiresIn}d</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* DAYS - cap display at 999 */}
                    <div style={{ fontSize: 12, color: daysRemaining <= 3 ? '#ff6b6b' : 'rgba(255,255,255,0.6)', fontWeight: daysRemaining <= 3 ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {daysRemaining > 999 ? '999+' : daysRemaining > 0 ? `${daysRemaining}d` : '✓'}
                    </div>
                    
                    {/* RENT - only show for rental listings */}
                    <div>
                      {listing.isRentOnly ? (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{dailyRate < 1 ? dailyRate.toFixed(4) : dailyRate.toFixed(2)} FLR</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>/day</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>—</div>
                      )}
                    </div>
                    
                    {/* BUY - only show for sale listings */}
                    <div style={{ fontSize: 12, color: !listing.isRentOnly && hasPrice ? '#00d4ff' : 'rgba(255,255,255,0.3)' }}>
                      {!listing.isRentOnly && hasPrice ? `${price.toLocaleString()} FLR` : '—'}
                    </div>
                    
                    {/* ACTIONS - V5: Sale=Buy only, Rent=Rent only */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {isRented ? (
                        <div style={{
                          background: 'rgba(139,92,246,0.1)',
                          border: '1px solid rgba(139,92,246,0.2)',
                          borderRadius: 6,
                          padding: '6px 0',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'rgba(139,92,246,0.7)',
                          letterSpacing: 0.5,
                          width: 70,
                          textAlign: 'center'
                        }}>RENTED</div>
                      ) : isOwner ? (
                        <button 
                          onClick={() => handleCancelListing(listing.collection, listing.tokenId, listing.isRentOnly)}
                          style={{
                            background: 'rgba(255,100,100,0.15)',
                            color: '#ff6b6b',
                            border: '1px solid rgba(255,100,100,0.3)',
                            borderRadius: 6,
                            padding: '6px 0',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            width: 70,
                            textAlign: 'center'
                          }}
                        >
                          Cancel
                        </button>
                      ) : listing.isRentOnly ? (
                        <button 
                          onClick={() => {
                            setSelectedRentalListing(listing);
                            setShowBoostRentModal(true);
                          }}
                          style={{
                            background: 'rgba(0,255,136,0.15)',
                            color: '#00ff88',
                            border: '1px solid rgba(0,255,136,0.3)',
                            borderRadius: 6,
                            padding: '6px 0',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            width: 70,
                            textAlign: 'center'
                          }}
                        >
                          Rent
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleBuyNFT(listing.collection, listing.tokenId, listing.price)}
                          style={{
                            background: 'rgba(0,212,255,0.15)',
                            color: '#00d4ff',
                            border: '1px solid rgba(0,212,255,0.3)',
                            borderRadius: 6,
                            padding: '6px 0',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            width: 70,
                            textAlign: 'center'
                          }}
                        >
                          Buy
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              
              // Mobile row with tap-to-expand
              return (
                <div key={i}>
                  <div 
                    onClick={() => !isRented && setExpandedMobileRow(isExpanded ? null : i)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '38px 36px 1fr auto 56px',
                      padding: '12px 14px',
                      borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)',
                      alignItems: 'center',
                      gap: 10,
                      cursor: isRented ? 'default' : 'pointer',
                      background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                      opacity: isRented ? 0.6 : 1
                    }}
                  >
                    {/* BOOST with progressive glow */}
                    <div style={{ color: '#00ff88', fontWeight: 700, fontSize: 13, ...boostStyle }}>{calculatedBoost.toFixed(1)}x</div>
                    
                    {/* THUMB */}
                    <img src={nftImage} style={{ width: 36, height: 36, borderRadius: 6 }} />
                    
                    {/* ID + Rank + Badge */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>#{listing.tokenId}</span>
                        {!isRented && (
                          <div style={{ display: 'flex', gap: 3, marginTop: 1 }}>
                            {listing.isRentOnly ? (
                              <span style={{ 
                                fontSize: 7, padding: '2px 4px', borderRadius: 2, fontWeight: 600, 
                                border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88', opacity: 0.5 
                              }}>R</span>
                            ) : (
                              <span style={{ 
                                fontSize: 7, padding: '2px 4px', borderRadius: 2, fontWeight: 600, 
                                border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff', opacity: 0.5 
                              }}>B</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                        {isRented && rentalExpiresIn > 0 ? (
                          <span style={{ color: 'rgba(139,92,246,0.7)' }}>Available in {rentalExpiresIn}d</span>
                        ) : (
                          rarityRanks ? `Rank #${rank.toLocaleString()}` : '...'
                        )}
                      </div>
                    </div>
                    
                    {/* DAYS with urgency - cap at 999 */}
                    <div style={{ 
                      fontSize: 13, fontWeight: 600, textAlign: 'right', paddingRight: 12,
                      color: daysRemaining <= 3 ? '#ff6b6b' : '#fff'
                    }}>
                      {daysRemaining > 999 ? '999+' : `${daysRemaining}d`}
                    </div>
                    
                    {/* PRIMARY ACTION or RENTED badge - V5: Sale=Buy only, Rent=Rent only */}
                    {isRented ? (
                      <div style={{
                        background: 'rgba(139,92,246,0.1)',
                        border: '1px solid rgba(139,92,246,0.2)',
                        borderRadius: 6,
                        padding: '8px 0',
                        fontSize: 9,
                        fontWeight: 600,
                        color: 'rgba(139,92,246,0.7)',
                        letterSpacing: 0.5,
                        textAlign: 'center'
                      }}>RENTED</div>
                    ) : isOwner ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleCancelListing(listing.collection, listing.tokenId, listing.isRentOnly); }}
                        style={{
                          background: 'rgba(255,100,100,0.15)',
                          border: '1px solid rgba(255,100,100,0.3)',
                          borderRadius: 6,
                          padding: '8px 0',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#ff6b6b',
                          cursor: 'pointer'
                        }}
                      >Cancel</button>
                    ) : listing.isRentOnly ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedRentalListing(listing); setShowBoostRentModal(true); }}
                        style={{
                          background: 'rgba(0,255,136,0.15)',
                          border: '1px solid rgba(0,255,136,0.3)',
                          borderRadius: 6,
                          padding: '8px 0',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#00ff88',
                          cursor: 'pointer'
                        }}
                      >Rent</button>
                    ) : (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleBuyNFT(listing.collection, listing.tokenId, listing.price); }}
                        style={{
                          background: 'rgba(0,212,255,0.15)',
                          border: '1px solid rgba(0,212,255,0.3)',
                          borderRadius: 6,
                          padding: '8px 0',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#00d4ff',
                          cursor: 'pointer'
                        }}
                      >Buy</button>
                    )}
                  </div>
                  
                  {/* EXPANDED VIEW - only if not rented - V5: Sale or Rent, not both */}
                  {isExpanded && !isOwner && !isRented && (
                    <div style={{
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.02)',
                      borderBottom: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      {listing.isRentOnly ? (
                        <>
                          <div style={{ textAlign: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{dailyRate < 1 ? dailyRate.toFixed(4) : dailyRate.toFixed(2)} FLR / day</div>
                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Deducted from your staked LP</div>
                          </div>
                          <button 
                            onClick={() => { setSelectedRentalListing(listing); setShowBoostRentModal(true); }}
                            style={{
                              width: '100%',
                              background: '#00ff88',
                              border: 'none',
                              borderRadius: 6,
                              padding: '10px',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#000',
                              cursor: 'pointer'
                            }}
                          >Rent This Boost</button>
                        </>
                      ) : (
                        <>
                          <div style={{ textAlign: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{price.toLocaleString()} FLR</div>
                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Buy Price</div>
                          </div>
                          <button 
                            onClick={() => handleBuyNFT(listing.collection, listing.tokenId, listing.price)}
                            style={{
                              width: '100%',
                              background: 'rgba(0,212,255,0.15)',
                              border: '1px solid rgba(0,212,255,0.3)',
                              borderRadius: 6,
                              padding: '10px',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#00d4ff',
                              cursor: 'pointer'
                            }}
                          >Buy for {price >= 1000 ? (price/1000).toFixed(0) + 'K' : price.toLocaleString()} FLR</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Your Active Rentals Section - ABOVE Your NFTs */}
        {connected && (
          <div style={{ marginTop: 32 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 16
            }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Your Active Rentals</div>
              {userRentals.length > 0 && (
                <div style={{
                  background: 'rgba(139,92,246,0.1)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: 'rgba(139,92,246,0.8)'
                }}>
                  {userRentals.length} active
                </div>
              )}
            </div>
            
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              overflow: 'hidden'
            }}>
              {userRentals.length === 0 ? (
                <div 
                  onClick={() => setMarketFilter('rentOnly')}
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>No active rentals</div>
                  <div style={{ fontSize: 13, color: '#00ff88', fontWeight: 600 }}>
                    Rent a boost to increase your rewards →
                  </div>
                </div>
              ) : (
                userRentals.map((rental, i) => {
                const nowSec = Math.floor(Date.now() / 1000);
                const daysLeft = rental.rentalExpiry ? Math.max(0, Math.ceil((rental.rentalExpiry - nowSec) / 86400)) : 0;
                const boost = Math.min(5.0, 1 + rental.commitmentDays / 100);
                const nftImage = `https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${rental.tokenId}.svg`;
                
                return (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: i < userRentals.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
                  }}>
                    <img src={nftImage} style={{ width: 40, height: 40, borderRadius: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Tadz #{rental.tokenId}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {boost.toFixed(1)}x boost
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: 14, 
                        fontWeight: 700, 
                        color: daysLeft <= 3 ? '#ff6b6b' : 'rgba(139,92,246,0.8)' 
                      }}>
                        {daysLeft}d left
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                        expires {new Date(rental.rentalExpiry * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </div>
        )}

        {/* Your NFTs Section */}
        {connected && (
          <div style={{ marginTop: 32 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 16
            }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Your NFTs</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {userListedCount > 0 && (
                  <div style={{
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid rgba(0,255,136,0.3)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: '#00ff88'
                  }}>
                    Listed: <strong>{userListedCount}</strong>
                  </div>
                )}
                <div style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.6)'
                }}>
                  Tadz: <strong>{userTadzCount}</strong>
                </div>
                {/* Sort tabs */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {['all', 'listed', 'unlisted'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setYourFToadzSort(filter)}
                      style={{
                        background: yourFToadzSort === filter ? 'rgba(0,255,136,0.15)' : 'transparent',
                        color: yourFToadzSort === filter ? '#00ff88' : 'rgba(255,255,255,0.4)',
                        border: yourFToadzSort === filter ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'capitalize'
                      }}
                    >{filter}</button>
                  ))}
                </div>
              </div>
            </div>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isDesktop ? 'repeat(8, 1fr)' : 'repeat(4, 1fr)', 
              gap: 12 
            }}>
              {(() => {
                const filteredNfts = userBoostNfts
                  .filter(n => n.address?.toLowerCase() === tadzAddr)
                  .filter(nft => {
                    const isListed = flareListings.some(
                      l => l.collection.toLowerCase() === nft.address?.toLowerCase() && 
                           l.tokenId.toString() === nft.tokenId.toString()
                    );
                    if (yourFToadzSort === 'listed') return isListed;
                    if (yourFToadzSort === 'unlisted') return !isListed;
                    return true;
                  });
                const totalPages = Math.ceil(filteredNfts.length / BOOST_PAGE_SIZE);
                const pagedNfts = filteredNfts.slice(boostNftsPage * BOOST_PAGE_SIZE, (boostNftsPage + 1) * BOOST_PAGE_SIZE);
                return pagedNfts;
              })()
                .map((nft, i) => {
                  const listing = flareListings.find(
                    l => l.collection.toLowerCase() === nft.address?.toLowerCase() && 
                         l.tokenId.toString() === nft.tokenId.toString()
                  );
                  const isListed = !!listing;
                  const hasPrice = listing && parseFloat(listing.price) > 0;
                  const boost = listing ? Math.min(5.0, 1 + listing.commitmentDays / 100) : 1.0;
                  
                  return (
                    <div 
                      key={i}
                      onClick={() => setNftDetailModal({
                        tokenId: nft.tokenId,
                        collection: nft.address,
                        image: `https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${nft.tokenId}.svg`,
                        animatedUrl: `https://ipfs.io/ipfs/QmUXYhSJYDPGWmxN5FCZ6Ebc8EVEzUTnZiaNfcrtGZyYZs/${nft.tokenId}_animated.svg`,
                        owner: walletAddress
                      })}
                      style={{
                        background: isListed ? 'rgba(0,255,136,0.05)' : 'rgba(255,255,255,0.02)',
                        border: isListed ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        padding: 8,
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      <img 
                        src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${nft.tokenId}.svg`}
                        style={{ 
                          width: '100%', 
                          aspectRatio: '1', 
                          borderRadius: 6,
                          marginBottom: 6
                        }}
                      />
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>#{nft.tokenId}</div>
                      {isListed && (
                        <>
                          <div style={{ fontSize: 10, color: '#00ff88', marginTop: 2 }}>{boost.toFixed(1)}x</div>
                          {hasPrice && (
                            <div style={{ 
                              fontSize: 9, 
                              color: '#00d4ff', 
                              marginTop: 2,
                              background: 'rgba(0,212,255,0.1)',
                              borderRadius: 4,
                              padding: '2px 4px'
                            }}>For Sale</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              {fetchingBoostNfts ? (
                <div style={{ 
                  gridColumn: isDesktop ? 'span 8' : 'span 4',
                  padding: 40,
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 13
                }}>
                  Loading your Tadz...
                </div>
              ) : userBoostNfts.filter(n => n.address?.toLowerCase() === tadzAddr).length === 0 ? (
                <div style={{ 
                  gridColumn: isDesktop ? 'span 8' : 'span 4',
                  padding: 40,
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 13
                }}>
                  No Tadz in wallet
                </div>
              ) : null}
            </div>
            {(() => {
              const filteredNfts = userBoostNfts
                .filter(n => n.address?.toLowerCase() === tadzAddr)
                .filter(nft => {
                  const isListed = flareListings.some(
                    l => l.collection.toLowerCase() === nft.address?.toLowerCase() && 
                         l.tokenId.toString() === nft.tokenId.toString()
                  );
                  if (yourFToadzSort === 'listed') return isListed;
                  if (yourFToadzSort === 'unlisted') return !isListed;
                  return true;
                });
              const totalPages = Math.ceil(filteredNfts.length / BOOST_PAGE_SIZE);
              if (totalPages <= 1) return null;
              return (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setBoostNftsPage(i)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        border: boostNftsPage === i ? '1px solid #00ff88' : '1px solid rgba(255,255,255,0.1)',
                        background: boostNftsPage === i ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.03)',
                        color: boostNftsPage === i ? '#00ff88' : 'rgba(255,255,255,0.5)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Gallery - shown when not connected */}
        {!walletAddress && (
          <div style={{ marginTop: 40 }}>
            <div style={{ 
              fontSize: 14, 
              fontWeight: 600, 
              color: 'rgba(255,255,255,0.5)', 
              marginBottom: 12,
              textAlign: 'left'
            }}>
              Gallery
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isDesktop ? 'repeat(10, 1fr)' : 'repeat(5, 1fr)', 
              gap: 4
            }}>
              {(() => {
                // Generate 100 random token IDs (seeded for consistency)
                const seed = 42;
                const randomIds = [];
                for (let i = 0; i < 100; i++) {
                  randomIds.push(((seed * (i + 1) * 7919) % 90000) + 1);
                }
                return randomIds.map((tokenId, idx) => (
                  <div
                    key={idx}
                    onClick={() => setNftDetailModal({
                      tokenId: tokenId.toString(),
                      collection: '0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6',
                      image: `https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${tokenId}.svg`,
                      animatedUrl: `https://ipfs.io/ipfs/QmUXYhSJYDPGWmxN5FCZ6Ebc8EVEzUTnZiaNfcrtGZyYZs/${tokenId}_animated.svg`,
                      rank: Math.floor(tokenId * 0.24) + 1000
                    })}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 4,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.05)',
                      background: 'rgba(255,255,255,0.02)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.border = '1px solid rgba(0,255,136,0.4)';
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.zIndex = '10';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.border = '1px solid rgba(255,255,255,0.05)';
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.zIndex = '1';
                    }}
                  >
                    <img
                      src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${tokenId}.svg`}
                      alt={`Tadz #${tokenId}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    );
  };

  // LP Required Modal - gates listing for non-LP users
  const LpRequiredModal = () => {
    if (!showLpRequiredModal) return null;

    return (
      <div 
        onClick={() => setShowLpRequiredModal(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}
      >
        <div 
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(180deg, #0f0f12 0%, #0a0a0c 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 22,
            maxWidth: 340,
            width: '100%',
            textAlign: 'center',
            position: 'relative'
          }}
        >
          {/* Close */}
          <button 
            onClick={() => setShowLpRequiredModal(false)}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 20,
              cursor: 'pointer'
            }}
          >×</button>
          
          {/* Lock Icon */}
          <div style={{
            width: 56,
            height: 56,
            background: 'rgba(255,170,0,0.1)',
            border: '1px solid rgba(255,170,0,0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffaa00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          
          {/* Title */}
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
            LP Required to List
          </div>
          
          {/* Subtitle */}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.4 }}>
            You need an active LP position to list NFTs on the marketplace. Stake FLR + POND to unlock listing.
          </div>
          
          {/* Benefits */}
          <div style={{
            background: 'rgba(0,255,136,0.05)',
            border: '1px solid rgba(0,255,136,0.1)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 18,
            textAlign: 'left'
          }}>
            <div style={{ fontSize: 10, color: '#00ff88', fontWeight: 600, marginBottom: 10, letterSpacing: 0.5 }}>
              WITH LP YOU GET
            </div>
            {['List NFTs for rent or sale', 'Earn passive FLR rewards', 'Boost earnings with staked NFTs', 'Access to free mints'].map((benefit, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < 3 ? 8 : 0 }}>
                <div style={{ 
                  width: 16, height: 16, 
                  background: 'rgba(0,255,136,0.15)',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ color: '#00ff88', fontSize: 10 }}>✓</span>
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{benefit}</span>
              </div>
            ))}
          </div>
          
          {/* CTA */}
          <button 
            onClick={() => { setShowLpRequiredModal(false); setActiveTab('pool'); }}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
              color: '#000',
              border: 'none',
              borderRadius: 10,
              padding: 14,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 10
            }}
          >Go to Pool →</button>
          
          {/* Maybe later */}
          <button 
            onClick={() => setShowLpRequiredModal(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >Maybe later</button>
        </div>
      </div>
    );
  };

  // Boost List Modal
  const BoostListModal = () => {
    if (!showBoostListModal) return null;

    return (
      <div 
        onClick={() => resetBoostListModal()}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isDesktop ? 40 : 20
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#0a0a0c',
            borderRadius: 6,
            padding: isDesktop ? 20 : 16,
            maxWidth: isDesktop ? 400 : 340,
            width: '100%',
            border: '1px solid rgba(255,255,255,0.08)',
            maxHeight: isDesktop ? 'none' : '90vh',
            overflow: 'auto'
          }}
        >
          {boostListStep === 1 && (
            <>
              <div style={{ fontSize: isDesktop ? 16 : 14, fontWeight: 700, marginBottom: 4 }}>Select Tadz</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: isDesktop ? 12 : 11, marginBottom: isDesktop ? 12 : 8 }}>
                Choose a Tadz to list
              </div>
              
              {/* Listing limit info */}
              {(() => {
                const isPlatform = PLATFORM_WALLETS.includes(walletAddress.toLowerCase());
                const stakeBonus = Math.floor(user.lpPosition / 10000);
                const maxListings = isPlatform ? 10 + stakeBonus : stakeBonus;
                const currentListings = flareListings.filter(l => l.seller?.toLowerCase() === walletAddress.toLowerCase() && l.collection?.toLowerCase() === '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6').length;
                return (
                  <div style={{
                    background: currentListings >= maxListings ? 'rgba(239,68,68,0.1)' : 'rgba(0,255,136,0.06)',
                    border: `1px solid ${currentListings >= maxListings ? 'rgba(239,68,68,0.2)' : 'rgba(0,255,136,0.15)'}`,
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: isDesktop ? 16 : 12,
                    fontSize: 11
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Listings</span>
                      <span style={{ fontWeight: 600, color: currentListings >= maxListings ? '#ef4444' : '#00ff88' }}>{currentListings} / {maxListings}</span>
                    </div>
                    {maxListings === 0 && (
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4 }}>Stake 10k FLR to unlock listings</div>
                    )}
                  </div>
                );
              })()}
              
              {fetchingBoostNfts ? (
                <div style={{ padding: isDesktop ? 32 : 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: isDesktop ? 13 : 12 }}>
                  Loading...
                </div>
              ) : userBoostNfts.filter(n => n.address?.toLowerCase() === '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6').length === 0 ? (
                <div style={{ padding: isDesktop ? 32 : 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: isDesktop ? 13 : 12 }}>
                  No Tadz in wallet
                </div>
              ) : (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: isDesktop ? 10 : 6, 
                  maxHeight: isDesktop ? 320 : 260, 
                  overflowY: 'auto' 
                }}>
                  {userBoostNfts
                    .filter(n => n.address?.toLowerCase() === '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6')
                    .map((nft, i) => {
                    const isListed = flareListings.some(
                      l => l.collection.toLowerCase() === nft.address?.toLowerCase() && 
                           l.tokenId.toString() === nft.tokenId.toString()
                    );
                    return (
                    <div
                      key={i}
                      onClick={() => !isListed && setSelectedBoostNft(nft)}
                      style={{
                        background: selectedBoostNft?.tokenId === nft.tokenId && selectedBoostNft?.address === nft.address
                          ? 'rgba(0,255,136,0.15)'
                          : isListed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
                        border: selectedBoostNft?.tokenId === nft.tokenId && selectedBoostNft?.address === nft.address
                          ? '1px solid rgba(0,255,136,0.5)'
                          : isListed ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 6,
                        padding: isDesktop ? 8 : 6,
                        cursor: isListed ? 'not-allowed' : 'pointer',
                        textAlign: 'center',
                        opacity: isListed ? 0.5 : 1
                      }}
                    >
                      <img 
                        src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${nft.tokenId}.svg`}
                        style={{ 
                          width: '100%', 
                          aspectRatio: '1', 
                          borderRadius: 4,
                          marginBottom: isDesktop ? 6 : 4
                        }}
                      />
                      <div style={{ fontSize: isDesktop ? 11 : 10, fontWeight: 600 }}>#{nft.tokenId}</div>
                      {isListed && <div style={{ fontSize: isDesktop ? 9 : 8, color: '#00ff88', marginTop: 2 }}>Listed</div>}
                    </div>
                  );
                  })}
                </div>
              )}
            </>
          )}

          {boostListStep === 2 && (
            <>
              <div style={{ fontSize: isDesktop ? 16 : 14, fontWeight: 700, marginBottom: 4 }}>List Your Tadz</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: isDesktop ? 12 : 11, marginBottom: isDesktop ? 16 : 12 }}>
                What do you want to do?
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 10 : 8 }}>
                <button 
                  onClick={() => { setBoostListType('sell'); setBoostListStep(3); }}
                  style={{
                    background: 'rgba(0,212,255,0.08)',
                    border: '1px solid rgba(0,212,255,0.2)',
                    borderRadius: 6,
                    padding: isDesktop ? 14 : 12,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ color: '#00d4ff', fontWeight: 700, fontSize: isDesktop ? 14 : 13, marginBottom: 2 }}>List for Sale</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: isDesktop ? 12 : 11 }}>Sell NFT + earn boost while listed</div>
                </button>
                
                <button 
                  onClick={() => { setBoostListType('rent'); setBoostListStep(3); }}
                  style={{
                    background: 'rgba(0,255,136,0.08)',
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: 6,
                    padding: isDesktop ? 14 : 12,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ color: '#00ff88', fontWeight: 700, fontSize: isDesktop ? 14 : 13, marginBottom: 2 }}>Rent Out Boost</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: isDesktop ? 12 : 11 }}>Earn rent + keep your boost</div>
                </button>
              </div>
            </>
          )}

          {boostListStep === 3 && (
            <>
              {boostListType === 'sell' && (
                <>
                  {/* Header with NFT */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 10,
                    marginBottom: 16
                  }}>
                    <img 
                      src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${selectedBoostNft?.tokenId || 0}.svg`}
                      style={{ width: isDesktop ? 40 : 32, height: isDesktop ? 40 : 32, borderRadius: 4 }}
                    />
                    <div>
                      <div style={{ fontSize: isDesktop ? 15 : 13, fontWeight: 700, color: '#00d4ff' }}>List for Sale</div>
                      <div style={{ fontSize: isDesktop ? 11 : 10, color: 'rgba(255,255,255,0.4)' }}>Tadz #{selectedBoostNft?.tokenId}</div>
                    </div>
                  </div>

                  {/* LP Row */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '10px 0' : '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: isDesktop ? 14 : 12, fontWeight: 600, color: '#fff' }}>
                        {actualUserLP >= 1000 ? (actualUserLP/1000).toFixed(1) + 'k' : actualUserLP.toFixed(0)} FLR
                      </div>
                      <div style={{ fontSize: isDesktop ? 10 : 9, color: 'rgba(255,255,255,0.4)' }}>Your LP</div>
                      <div style={{ 
                        width: '100%', 
                        height: 3, 
                        background: 'rgba(255,255,255,0.08)', 
                        borderRadius: 2,
                        marginTop: 4,
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${Math.min(100, (actualUserLP / 50000) * 100)}%`, 
                          height: '100%', 
                          background: '#00d4ff',
                          borderRadius: 2,
                          transition: 'width 120ms ease-out'
                        }} />
                      </div>
                    </div>
                    <div style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 600, color: '#00d4ff', marginLeft: 10 }}>
                      +{(actualUserLP / 25000).toFixed(2)}x
                    </div>
                  </div>

                  {/* Rarity Row */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '10px 0' : '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: isDesktop ? 14 : 12, fontWeight: 600, color: '#fff' }}>
                        #{rarityRanks && selectedBoostNft?.tokenId ? rarityRanks[parseInt(selectedBoostNft.tokenId) - 1]?.toLocaleString() : '—'}
                      </div>
                      <div style={{ fontSize: isDesktop ? 10 : 9, color: 'rgba(255,255,255,0.4)' }}>NFT Rarity</div>
                      <div style={{ 
                        width: '100%', 
                        height: 3, 
                        background: 'rgba(255,255,255,0.08)', 
                        borderRadius: 2,
                        marginTop: 4,
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${rarityRanks && selectedBoostNft?.tokenId ? Math.min(100, ((100001 - rarityRanks[parseInt(selectedBoostNft.tokenId) - 1]) / 100000) * 100) : 0}%`, 
                          height: '100%', 
                          background: '#00d4ff',
                          borderRadius: 2
                        }} />
                      </div>
                    </div>
                    <div style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 600, color: '#00d4ff', marginLeft: 10 }}>
                      +{rarityRanks && selectedBoostNft?.tokenId ? ((100001 - rarityRanks[parseInt(selectedBoostNft.tokenId) - 1]) / 1000000).toFixed(2) : '0.00'}x
                    </div>
                  </div>

                  {/* Lock Row */}
                  <div style={{ padding: isDesktop ? '10px 0' : '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: isDesktop ? 14 : 12, fontWeight: 600, color: '#fff' }}>{boostDuration} days</div>
                        <div style={{ fontSize: isDesktop ? 10 : 9, color: 'rgba(255,255,255,0.4)' }}>Lock Period</div>
                      </div>
                      <div style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 600, color: '#00d4ff' }}>
                        +{(boostDuration / 100).toFixed(2)}x
                      </div>
                    </div>
                    <input 
                      type="range"
                      min={7}
                      max={365}
                      value={boostDuration}
                      onChange={(e) => setBoostDuration(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        height: 3,
                        borderRadius: 2,
                        background: `linear-gradient(to right, #00d4ff ${(boostDuration - 7) / (365 - 7) * 100}%, rgba(255,255,255,0.1) ${(boostDuration - 7) / (365 - 7) * 100}%)`,
                        appearance: 'none',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  {/* Final Boost */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '12px 0' : '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ fontSize: isDesktop ? 10 : 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>FINAL BOOST</div>
                    <div style={{ 
                      fontSize: isDesktop ? 20 : 18, 
                      fontWeight: 800, 
                      color: '#00d4ff',
                      textShadow: '0 0 12px rgba(0,212,255,0.4)'
                    }}>{sellFinalBoost.toFixed(2)}x</div>
                  </div>

                  {/* Sell Price Input */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '10px 0' : '8px 0'
                  }}>
                    <div style={{ fontSize: isDesktop ? 10 : 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>SELL PRICE</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input 
                        type="text"
                        placeholder="5000"
                        value={boostSellPrice}
                        onChange={(e) => setBoostSellPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                        style={{
                          width: 100,
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(0,212,255,0.2)',
                          borderRadius: 4,
                          padding: '6px 10px',
                          color: '#fff',
                          fontSize: isDesktop ? 14 : 13,
                          fontWeight: 700,
                          outline: 'none',
                          textAlign: 'right'
                        }}
                      />
                      <span style={{ fontSize: isDesktop ? 12 : 11, color: 'rgba(255,255,255,0.5)' }}>FLR</span>
                    </div>
                  </div>
                </>
              )}
              
              {boostListType === 'rent' && (
                <>
                  {/* Header with NFT */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 10,
                    marginBottom: 16
                  }}>
                    <img 
                      src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${selectedBoostNft?.tokenId || 0}.svg`}
                      style={{ width: isDesktop ? 40 : 32, height: isDesktop ? 40 : 32, borderRadius: 4 }}
                    />
                    <div>
                      <div style={{ fontSize: isDesktop ? 15 : 13, fontWeight: 700, color: '#00ff88' }}>List for Rent</div>
                      <div style={{ fontSize: isDesktop ? 11 : 10, color: 'rgba(255,255,255,0.4)' }}>Tadz #{selectedBoostNft?.tokenId}</div>
                    </div>
                  </div>

                  {/* LP Row */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '10px 0' : '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: isDesktop ? 14 : 12, fontWeight: 600, color: '#fff' }}>
                        {actualUserLP >= 1000 ? (actualUserLP/1000).toFixed(1) + 'k' : actualUserLP.toFixed(0)} FLR
                      </div>
                      <div style={{ fontSize: isDesktop ? 10 : 9, color: 'rgba(255,255,255,0.4)' }}>Your LP</div>
                      <div style={{ 
                        width: '100%', 
                        height: 3, 
                        background: 'rgba(255,255,255,0.08)', 
                        borderRadius: 2,
                        marginTop: 4,
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${Math.min(100, (actualUserLP / 50000) * 100)}%`, 
                          height: '100%', 
                          background: '#00ff88',
                          borderRadius: 2,
                          transition: 'width 120ms ease-out'
                        }} />
                      </div>
                    </div>
                    <div style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 600, color: '#00ff88', marginLeft: 10 }}>
                      +{(actualUserLP / 25000).toFixed(2)}x
                    </div>
                  </div>

                  {/* Rarity Row */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '10px 0' : '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: isDesktop ? 14 : 12, fontWeight: 600, color: '#fff' }}>
                        #{rarityRanks && selectedBoostNft?.tokenId ? rarityRanks[parseInt(selectedBoostNft.tokenId) - 1]?.toLocaleString() : '—'}
                      </div>
                      <div style={{ fontSize: isDesktop ? 10 : 9, color: 'rgba(255,255,255,0.4)' }}>NFT Rarity</div>
                      <div style={{ 
                        width: '100%', 
                        height: 3, 
                        background: 'rgba(255,255,255,0.08)', 
                        borderRadius: 2,
                        marginTop: 4,
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${rarityRanks && selectedBoostNft?.tokenId ? Math.min(100, ((100001 - rarityRanks[parseInt(selectedBoostNft.tokenId) - 1]) / 100000) * 100) : 0}%`, 
                          height: '100%', 
                          background: '#00ff88',
                          borderRadius: 2
                        }} />
                      </div>
                    </div>
                    <div style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 600, color: '#00ff88', marginLeft: 10 }}>
                      +{rarityRanks && selectedBoostNft?.tokenId ? ((100001 - rarityRanks[parseInt(selectedBoostNft.tokenId) - 1]) / 1000000).toFixed(2) : '0.00'}x
                    </div>
                  </div>

                  {/* Lock Row */}
                  <div style={{ padding: isDesktop ? '10px 0' : '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: isDesktop ? 14 : 12, fontWeight: 600, color: '#fff' }}>{boostDuration} days</div>
                        <div style={{ fontSize: isDesktop ? 10 : 9, color: 'rgba(255,255,255,0.4)' }}>Lock Period</div>
                      </div>
                      <div style={{ fontSize: isDesktop ? 12 : 11, fontWeight: 600, color: '#00ff88' }}>
                        +{(boostDuration / 100).toFixed(2)}x
                      </div>
                    </div>
                    <input 
                      type="range"
                      min={7}
                      max={365}
                      value={boostDuration}
                      onChange={(e) => setBoostDuration(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        height: 3,
                        borderRadius: 2,
                        background: `linear-gradient(to right, #00ff88 ${(boostDuration - 7) / (365 - 7) * 100}%, rgba(255,255,255,0.1) ${(boostDuration - 7) / (365 - 7) * 100}%)`,
                        appearance: 'none',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  {/* Final Boost */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '12px 0' : '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ fontSize: isDesktop ? 10 : 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>FINAL BOOST</div>
                    <div style={{ 
                      fontSize: isDesktop ? 20 : 18, 
                      fontWeight: 800, 
                      color: '#00ff88',
                      textShadow: '0 0 12px rgba(0,255,136,0.4)'
                    }}>{finalBoost.toFixed(2)}x</div>
                  </div>

                  {/* Rent Price */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: isDesktop ? '10px 0' : '8px 0'
                  }}>
                    <div style={{ fontSize: isDesktop ? 10 : 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>RENT PRICE</div>
                    <div style={{ fontSize: isDesktop ? 14 : 13, fontWeight: 700, color: '#fff' }}>{rentalPrice} FLR/day</div>
                  </div>
                </>
              )}
            </>
          )}
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: isDesktop ? 10 : 8, marginTop: isDesktop ? 20 : 16 }}>
            <button 
              onClick={() => {
                if (boostListStep === 1) resetBoostListModal();
                else if (boostListStep === 2) setBoostListStep(1);
                else setBoostListStep(2);
              }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                padding: isDesktop ? '12px 20px' : '10px 16px',
                fontSize: isDesktop ? 13 : 12,
                cursor: 'pointer',
                flex: 1
              }}
            >{boostListStep > 1 ? 'Back' : 'Cancel'}</button>
            
            {boostListStep === 1 && selectedBoostNft && (
              <button 
                onClick={() => setBoostListStep(2)}
                style={{
                  background: '#00ff88',
                  color: '#000',
                  border: 'none',
                  borderRadius: 4,
                  padding: isDesktop ? '12px 20px' : '10px 16px',
                  fontSize: isDesktop ? 13 : 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  flex: 2,
                  opacity: 0.9
                }}
              >Next</button>
            )}
            
            {boostListStep === 3 && (
              <button 
                onClick={handleBoostList}
                disabled={loading}
                style={{
                  background: boostListType === 'sell' ? '#00d4ff' : '#00ff88',
                  color: '#000',
                  border: 'none',
                  borderRadius: 4,
                  padding: isDesktop ? '12px 20px' : '10px 16px',
                  fontSize: isDesktop ? 13 : 12,
                  fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.7 : 0.9,
                  flex: 2
                }}
              >{loading ? 'Processing...' : (boostListType === 'sell' ? 'List for Sale' : 'List for Rent')}</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Boost Rent Modal
  const BoostRentModal = () => {
    if (!showBoostRentModal || !selectedRentalListing) return null;
    
    const listing = selectedRentalListing;
    const dailyRate = parseFloat(listing.dailyRate);
    const boost = Math.min(5.0, 1 + listing.commitmentDays / 100);
    const nftImage = `https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${listing.tokenId}.svg`;

    return (
      <div 
        onClick={() => resetBoostRentModal()}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isDesktop ? 40 : 20
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(135deg, #111 0%, #1a1a1a 100%)',
            borderRadius: 20,
            padding: 28,
            maxWidth: 420,
            width: '100%',
            border: '1px solid rgba(0,255,136,0.15)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,255,136,0.1)',
            maxHeight: isDesktop ? 'none' : '90vh',
            overflow: 'auto'
          }}
        >
          <h2 style={{ margin: '0 0 20px 0', fontSize: 20, color: '#00ff88' }}>Rent Tadz #{listing.tokenId}</h2>
          
          {/* NFT Preview */}
          <div style={{ 
            display: 'flex', 
            gap: 16, 
            marginBottom: 24,
            padding: 16,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <img src={nftImage} style={{ width: 80, height: 80, borderRadius: 10 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Tadz #{listing.tokenId}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                Owner: {listing.seller.slice(0,6)}...{listing.seller.slice(-4)}
              </div>
              <div style={{ 
                display: 'inline-block',
                background: 'rgba(0,255,136,0.15)',
                color: '#00ff88',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700
              }}>{boost.toFixed(1)}x Boost</div>
            </div>
          </div>
          
          {/* Rent Info - V5: LP deduction, not upfront */}
          <div style={{ 
            background: 'rgba(0,255,136,0.05)', 
            borderRadius: 12, 
            padding: 20,
            marginBottom: 24,
            textAlign: 'center',
            border: '1px solid rgba(0,255,136,0.2)'
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#00ff88' }}>{dailyRate < 1 ? dailyRate.toFixed(4) : dailyRate.toFixed(2)} FLR/day</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Deducted daily from your staked LP</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>No upfront payment required</div>
          </div>
          
          <button 
            onClick={() => {
              handleRentNFT(selectedRentalListing, selectedRentalListing.commitmentDays);
            }}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
              border: 'none',
              borderRadius: 12,
              padding: '16px',
              color: '#000',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 16,
              marginBottom: 12,
              boxShadow: '0 4px 12px rgba(0,255,136,0.3)'
            }}
          >Rent This Boost</button>
          
          <button 
            onClick={() => resetBoostRentModal()}
            style={{
              width: '100%',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '12px',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >Cancel</button>
        </div>
      </div>
    );
  };


  // ============ LIST MODAL ============
  const ListModal = () => {
    const isFlare = marketSubTab === 'flare';
    const targetChainId = isFlare ? '0xe' : '0x13';
    const marketAddress = isFlare ? CONTRACTS.ToadzMarket : CONTRACTS.ToadzMarket;
    const currency = isFlare ? 'FLR' : 'SGB';

    const collections = isFlare ? [
      { name: 'Block Bonez', address: '0xd1eF6460D9d06a4Ce74d9800b1BC11Ade822b349', emoji: '🦴' },
      { name: 'Block Bonez Traits', address: '0x94Aa172076A59bAa1B5D63Ae4DBF722F74E45e57', image: 'https://sparklesnft.imgix.net/ipfs/bafybeiaz7eo2nrfdetw2ffxctcxdu6y5rcmyct6humpmptfghesaav3wuy/Wood.png', emoji: '🎭' },
      { name: 'Focus Pass', address: '0x4FD29d6c713a390Aa38b650254D0cD38a4982dBD', image: 'https://sparklesnft.imgix.net/ipfs/QmdEp9f3ANp82LQ3TsVKqha6rxHTBVqBBqYd92BWENAJcP/focus_red.mp4', emoji: '🎫' },
      { name: 'Flare Apes', address: '0x862B713fEcEbC5304eD7aF993D79A3a6AE8747Dd', image: 'https://sparklesnft.imgix.net/ipfs/bafybeid2vv7bfz3q5m5wesks4tkhtxflnppj42z2xikzqozvv4bcakpl2u/1.jpg', emoji: '🦍' },
      { name: 'Flare Punks', address: '0xc5F0C8b27dd920F4F469a857D6F0fEcF0fA2bDb8', image: 'https://sparklesnft.imgix.net/ipfs/QmauUguWjX69wC5crvN7HubGuqgSUrRbRBaU8JTqQbehd2/1Security.png', emoji: '👾' },
      { name: 'Lucky Claw', address: '0x9d8644A5D8A4ed0B4Ca462Ef32A6d47Eb03c59db', image: 'https://bafybeih2j7otrs4q4moxfgtepl6ywfhukdu5oe66g5krlymcqq4u7mwt2i.ipfs.nftstorage.link/1.png', emoji: '🎰' },
      { name: 'Flaremingo Frens', address: '0x595FA9efFad5c0c214b00b1e3004302519BfC1Db', image: 'https://sparklesnft.imgix.net/ipfs/QmTNmPZTGqsoRxLmj9idjCpdxLsY434PgTsHB2FkoiXEUE/1.png', emoji: '🐦' },
      { name: 'Fat Kittens', address: '0x93365AACe3db5407B0976C0a6C5F46B21BAd3923', image: 'https://sparklesnft.imgix.net/ipfs/QmcgHXTumCVC4jd77LZi6iTcDcZDWTRKqRvy5ar6psnTot/1.png', emoji: '🐱' },
      { name: 'Doodle Bunny', address: '0x2959D636871D9714dD6E00F4e9700CCc346CC39E', image: 'https://sparklesnft.imgix.net/ipfs/bafybeiag4m2aohwz23fitflnoe4z7jmy33wftlma3gzrrgigikgnhluomy/1.png', emoji: '🐰' },
      { name: 'Flaremingos', address: '0xE2432F1e376482Ec914ebBb910D3BfD8E3F3F29e', image: 'https://sparklesnft.imgix.net/ipfs/QmTaY5MS9trVXjFywtxW4D927KDY5r2GWthvdnwE2u1TQ8/1.png', emoji: '🦩' },
      { name: 'Poodle & Friends', address: '0xe6E5fa0b12D9E8ed12Cb8AB733E6444f3c74c68c', image: 'https://sparklesnft.imgix.net/ipfs/bafybeicd3jwz5j3sbyjadl6zwot3jaamwqsrmgq25gvxkj25ttdqzic4zy/1.png', emoji: '🐩' },
      { name: 'Smuggler Chimps', address: '0x5F4283Cf126a4dCcE16b66854Cc9A713893c0000', image: 'https://sparklesnft.imgix.net/ipfs/bafybeigc3gqqb3gmzoela6zqb2ixxnp53bixcaj6jpjoehyyb22kh65sji/Deep_Ocean.png', emoji: '🐵' },
      { name: 'Super Bad Monsters', address: '0x127bB21A24B8Ea5913F1c8c9868800fbCeF1316E', image: 'https://sparklesnft.imgix.net/ipfs/Qmd4n9MSWS1APF6Uh4aG43iCwMFJDBXcoXLbmyoRRmXBYF/export-resize-sbm/1.png', emoji: '👹' },
      { name: 'Minerals', address: '0xd2516A06D1fAbB9ba84b5fD1de940F6F0EaE3673', image: 'https://sparklesnft.imgix.net/ipfs/QmagMFqse3TgMvjgZfUXASLqq4qiboBiG5cqvpFtbgo5CW/still.png', emoji: '💎' },
      { name: 'FlareRock', address: '0xa574dD4393e828B8CF7c3C379861C748d321bBFd', image: 'https://backend.truegems.io/public/studio/images/image_1725809975432.png', emoji: '🪨' },
      { name: 'Mutant Ape Serum', address: '0x9f338Ac5D000BAAB73F619fc75115F2FE9773736', image: 'https://bafybeib2nj2c77jbolzs5qrmfntbsvcwqu2uzntycy35fhylwp3fejx7mi.ipfs.nftstorage.link/1.png', emoji: '🧪' },
      { name: 'Poodle Islands', address: '0xBc25d2997a7a7b42D2501A4c4d0169f135743a64', image: 'https://sparklesnft.imgix.net/ipfs/bafybeihlyofvjfavatfm3oyfog53mtxgvarphef2pumfweztpitb5xjznm/1.png', emoji: '🏝️' },
      { name: 'Floor-Sweeper', address: '0xbC42e9a6C24664749b2a0D571Fd67f23386e34b8', image: 'https://sparklesnft.imgix.net/ipfs/QmRCttzFebHEkmLzadbhkm2Wgy2Rh1FibrxXxRD93tr7Gp/1.png', emoji: '🧹' },
    ] : [
      { name: 'sToadz', address: '0x35afb6Ba51839dEDD33140A3b704b39933D1e642', image: 'https://dweb.link/ipfs/QmP45Rfhy75RybFuLcwd1CR9vF6qznw95qQPxcA5TeBNYk/1.png' },
      { name: 'Luxury Lofts', address: '0x91Aa85a172DD3e7EEA4ad1A4B33E90cbF3B99ed8', image: 'https://ipfs.io/ipfs/QmZ42mWPA3xihoQxnm7ufKh51n5fhJe7hwfN7VPfy4cZcg' },
      { name: 'Songbird City', address: '0x360f8B7d9530F55AB8E52394E6527935635f51E7', image: 'https://ipfs.io/ipfs/QmY5ZwdLP4z2PBXmRgh3djcDYzWvMuizyqfTDhPnXErgBm' },
    ];

    const handleList = async () => {
      if (!selectedNft || !listingPrice) {
        showToast('error', 'Select NFT and enter price');
        return;
      }
      
      // Check listing limit
      const isPlatform = PLATFORM_WALLETS.includes(walletAddress.toLowerCase());
      const stakeBonus = Math.floor(user.lpPosition / 10000);
      const maxListings = isPlatform ? 10 + stakeBonus : stakeBonus;
      const currentListings = flareListings.filter(l => l.seller?.toLowerCase() === walletAddress.toLowerCase() && l.collection?.toLowerCase() === '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6').length;
      
      if (currentListings >= maxListings) {
        if (isPlatform) {
          showToast('error', `Listing limit reached (${maxListings}). Stake more FLR for additional listings.`);
        } else if (maxListings === 0) {
          showToast('error', 'Stake FLR to unlock listings (10k FLR = 1 listing)');
        } else {
          showToast('error', `Listing limit reached (${maxListings}). Stake more FLR for additional listings.`);
        }
        return;
      }
      
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== targetChainId) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetChainId }]
        });
      }
      setLoading(true);
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const nftContract = new ethers.Contract(selectedNft.collection, [
          'function approve(address to, uint256 tokenId) external',
          'function getApproved(uint256 tokenId) view returns (address)'
        ], signer);
        const approved = await nftContract.getApproved(selectedNft.tokenId);
        if (approved.toLowerCase() !== marketAddress.toLowerCase()) {
          const approveTx = await nftContract.approve(marketAddress, selectedNft.tokenId, { gasLimit: 200000 });
          await approveTx.wait();
        }
        const marketContract = new ethers.Contract(marketAddress, [
          'function list(address collection, uint256 tokenId, uint256 price) external'
        ], signer);
        const priceWei = ethers.parseEther(listingPrice);
        const listTx = await marketContract.list(selectedNft.collection, selectedNft.tokenId, priceWei, { gasLimit: 500000 });
        await listTx.wait();
        
        if (isFlare) {
          setFlareListings(prev => [...prev, {
            collection: selectedNft.collection,
            tokenId: selectedNft.tokenId,
            price: listingPrice,
            seller: walletAddress
          }]);
        } else {
          setMarketListings(prev => [...prev, {
            collection: selectedNft.collection,
            tokenId: selectedNft.tokenId,
            price: listingPrice,
            seller: walletAddress
          }]);
          setShowSyncModal(true);
        }
        setShowListModal(false);
        setSelectedNft(null);
        setListModalCollection(null);
        setListingPrice('');
      } catch (err) {
        console.error('List failed:', err);
        showToast('error', 'List failed: ' + (err.reason || err.message));
      }
      setLoading(false);
    };

    const closeModal = () => {
      setShowListModal(false);
      setSelectedNft(null);
      setListModalCollection(null);
      setListModalCollectionNfts([]);
    };

    if (!showListModal) return null;

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }} onClick={closeModal}>
        <div style={{
          background: '#1a1a2e',
          borderRadius: 16,
          padding: 24,
          width: '90%',
          maxWidth: 600,
          maxHeight: '80vh',
          overflow: 'auto',
          border: '1px solid rgba(255,255,255,0.1)'
        }} onClick={e => e.stopPropagation()}>
          
          {/* STEP 1: Select Collection */}
          {!listModalCollection && !selectedNft && (
            <>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>
                List NFT on {isFlare ? 'Flare' : 'Songbird'}
              </h3>
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Select a collection
              </p>
              
              {/* Listing limit info */}
              {(() => {
                const isPlatform = PLATFORM_WALLETS.includes(walletAddress.toLowerCase());
                const stakeBonus = Math.floor(user.lpPosition / 10000);
                const maxListings = isPlatform ? 10 + stakeBonus : stakeBonus;
                const currentListings = flareListings.filter(l => l.seller?.toLowerCase() === walletAddress.toLowerCase() && l.collection?.toLowerCase() === '0xbaa8344f4a383796695c1f9f3afe1eaffdcfeae6').length;
                return (
                  <div style={{
                    background: currentListings >= maxListings ? 'rgba(239,68,68,0.1)' : 'rgba(0,255,136,0.06)',
                    border: `1px solid ${currentListings >= maxListings ? 'rgba(239,68,68,0.2)' : 'rgba(0,255,136,0.15)'}`,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    fontSize: 12
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Listings</span>
                      <span style={{ fontWeight: 600, color: currentListings >= maxListings ? '#ef4444' : '#00ff88' }}>{currentListings} / {maxListings}</span>
                    </div>
                    {maxListings === 0 && (
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Stake 10k FLR to unlock listings</div>
                    )}
                  </div>
                );
              })()}
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {collections.map((col, i) => (
                  <div
                    key={i}
                    onClick={() => setListModalCollection(col)}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      padding: 12,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 150ms'
                    }}
                  >
                    <img 
                      src={col.image} 
                      alt={col.name}
                      style={{ width: 64, height: 64, borderRadius: 8, marginBottom: 8, objectFit: 'cover' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{col.name}</div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={closeModal}
                style={{
                  width: '100%',
                  marginTop: 20,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: 14,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >Cancel</button>
            </>
          )}

          {/* STEP 2: Select NFT from Collection */}
          {listModalCollection && !selectedNft && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button 
                  onClick={() => { setListModalCollection(null); setListModalCollectionNfts([]); }}
                  style={{ background: 'none', border: 'none', color: '#00ff88', cursor: 'pointer', fontSize: 14 }}
                >← Back</button>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{listModalCollection.name}</h3>
              </div>
              
              {listModalFetchingNfts ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                  Loading your NFTs...
                </div>
              ) : listModalCollectionNfts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                  You don't own any {listModalCollection.name}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {listModalCollectionNfts.map((nft, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedNft(nft)}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'all 150ms'
                      }}
                    >
                      {nft.image ? (
                        <img 
                          src={nft.image} 
                          alt={`#${nft.tokenId}`}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                          onError={(e) => { e.target.src = listModalCollection.image; }}
                        />
                      ) : (
                        <div style={{ width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 32 }}>?</span>
                        </div>
                      )}
                      <div style={{ padding: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>#{nft.tokenId}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                onClick={closeModal}
                style={{
                  width: '100%',
                  marginTop: 20,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: 14,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >Cancel</button>
            </>
          )}

          {/* STEP 3: Set Price */}
          {selectedNft && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                {selectedNft.image ? (
                  <img src={selectedNft.image} alt="" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.05)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>?</div>
                )}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedNft.collectionName} #{selectedNft.tokenId}</div>
                  <button 
                    onClick={() => setSelectedNft(null)}
                    style={{ fontSize: 12, color: '#00ff88', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >← Choose different NFT</button>
                </div>
              </div>
              
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8 }}>Price ({currency})</label>
                <input
                  type="number"
                  value={listingPrice}
                  onChange={e => setListingPrice(e.target.value)}
                  placeholder="0"
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: 16,
                    color: '#fff',
                    fontSize: 24,
                    fontWeight: 700,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 10,
                padding: 12,
                marginBottom: 20,
                fontSize: 13
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>Marketplace fee</span>
                  <span>5%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>You receive</span>
                  <span style={{ color: '#00ff88', fontWeight: 600 }}>
                    {listingPrice ? (Number(listingPrice) * 0.95).toFixed(2) : '0'} {currency}
                  </span>
                </div>
              </div>

              <button
                onClick={handleList}
                disabled={loading || !listingPrice}
                style={{
                  width: '100%',
                  background: loading ? 'rgba(0,255,136,0.3)' : '#00ff88',
                  border: 'none',
                  borderRadius: 10,
                  padding: 16,
                  color: '#000',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer'
                }}
              >{loading ? 'Listing...' : 'List NFT'}</button>
              
              <button
                onClick={closeModal}
                style={{
                  width: '100%',
                  marginTop: 12,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: 14,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >Cancel</button>
            </>
          )}
        </div>
      </div>
    );
  };


  const SyncModal = () => {
    if (!showSyncModal) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }} onClick={() => setShowSyncModal(false)}>
        <div style={{
          background: '#1a1a1a',
          borderRadius: 20,
          padding: 30,
          maxWidth: 400,
          width: '90%',
          border: '1px solid rgba(0,255,136,0.3)'
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: '#00ff88' }}>
            NFT Listed
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', marginBottom: 24 }}>
            Your listing gives you a boost on staking rewards. Sync to Flare to activate it.
          </div>
          
          <div style={{
            background: 'rgba(0,255,136,0.1)',
            border: '1px solid rgba(0,255,136,0.2)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 24
          }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>LISTING BOOST</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#00ff88' }}>+0.05x per NFT listed</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              Half the boost of OG Vault locks, but your NFT stays for sale
            </div>
          </div>
          
          <button
            onClick={() => { syncToFlare(); setShowSyncModal(false); }}
            disabled={syncPending}
            style={{
              width: '100%',
              background: syncPending ? 'rgba(0,255,136,0.3)' : 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
              color: '#000',
              border: 'none',
              borderRadius: 12,
              padding: 16,
              fontSize: 16,
              fontWeight: 700,
              cursor: syncPending ? 'not-allowed' : 'pointer',
              marginBottom: 12
            }}
          >
            {syncPending ? 'Syncing...' : 'Sync to Flare Now'}
          </button>
          
          <button
            onClick={() => setShowSyncModal(false)}
            style={{
              width: '100%',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 14,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Later
          </button>
        </div>
      </div>
    );
  };
  

  // ============ VAULT PAGE ============
  // ============ VAULT PAGE ============
  const VaultPage = () => {
    // OG Vault - use real data from contract calls
    const ogCollections = ogNftData.collections.length > 0 
      ? ogNftData.collections 
      : OG_COLLECTIONS.map(c => ({ ...c, owned: 0, locked: 0, ownedTokenIds: [], lockedTokenIds: [], availableTokenIds: [] }));
    const ogLockedCount = ogNftData.totalLocked;
    
    // Tiered discounts: 10=5%, 25=10%, 50=15%, 100=25%, 500=50%, 3000+=70% cap
    const getDiscount = (count) => {
      if (count >= 3000) return 70;
      if (count >= 500) return 50;
      if (count >= 100) return 25;
      if (count >= 50) return 15;
      if (count >= 25) return 10;
      if (count >= 10) return 5;
      return 0;
    };
    const currentDiscount = getDiscount(ogLockedCount);
    const discountTiers = [
      { count: 10, discount: 5 },
      { count: 25, discount: 10 },
      { count: 50, discount: 15 },
      { count: 100, discount: 25 },
      { count: 500, discount: 50 },
      { count: 3000, discount: 70 }
    ];
    const currentTierIndex = discountTiers.findIndex(t => ogLockedCount < t.count);
    const nextTier = currentTierIndex >= 0 ? discountTiers[currentTierIndex] : null;
    
    // Boost: log scale formula - 1 + 0.1 + (log10(count) × 0.5)
    const getBoost = (count) => {
      if (count <= 0) return 1.0;
      return 1 + 0.1 + (Math.log10(count) * 0.5);
    };
    const currentBoost = getBoost(ogLockedCount);
    const boostPercent = Math.round((currentBoost - 1) * 100);
    
    // 3D Toadz airdrop: 3 per 1 locked
    const toadz3dEarned = ogLockedCount * 3;
    
    // Available to lock
    const availableToLock = ogCollections.reduce((sum, c) => sum + (c.availableTokenIds?.length || 0), 0);

    return (
      <div style={{ padding: isDesktop ? '32px 0' : '20px 0', maxWidth: 520, margin: '0 auto' }}>
        
        {/* Page Title + Tagline */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ 
            fontSize: isDesktop ? 32 : 26, 
            fontWeight: 900, 
            marginBottom: 6, 
            letterSpacing: -1
          }}>Lock</h1>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Permanent utility for OG holders</div>
        </div>

        {/* Boost Sync Status - shows while syncing */}
        {boostSyncNeeded && ogNftData.totalLocked > 0 && (
        <div 
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.15) 0%, rgba(0,255,136,0.05) 100%)',
            border: '1px solid rgba(0,255,136,0.3)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <div style={{
            width: 40,
            height: 40,
            background: 'rgba(0,255,136,0.2)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18
          }}>⟳</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: '#00ff88' }}>Syncing Boost...</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Updating Flare with your Songbird locks
            </div>
          </div>
        </div>
        )}

        {/* Tab Selector - COMMENTED OUT
        <div style={{
          display: 'flex',
          gap: 12,
          marginBottom: 28,
          padding: 6,
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.04)'
        }}>
          <button 
            onClick={() => { setVaultTab('og'); setDrillLevel(0); setDrillCategory(null); setDrillCollection(null); switchToSongbird(); }}
            style={{
              flex: 1,
              padding: '16px 12px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              background: vaultTab === 'og' 
                ? 'linear-gradient(135deg, rgba(0,255,136,0.15) 0%, rgba(0,255,136,0.05) 100%)'
                : 'transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ 
              fontSize: 18, 
              marginBottom: 4,
              filter: vaultTab === 'og' ? 'none' : 'grayscale(0.5) opacity(0.5)'
            }}>🔒</div>
            <div style={{ 
              fontSize: 13, 
              fontWeight: 700, 
              color: vaultTab === 'og' ? '#a855f7' : 'rgba(255,255,255,0.35)',
              marginBottom: 2
            }}>OG Vault</div>
            <div style={{ 
              fontSize: 10, 
              color: vaultTab === 'og' ? 'rgba(0,255,136,0.7)' : 'rgba(255,255,255,0.2)'
            }}>Discounts + Free Drops</div>
          </button>
          
          <button 
            onClick={() => { setVaultTab('stake'); setDrillLevel(0); setDrillCategory(null); setDrillCollection(null); switchToFlare(); }}
            style={{
              flex: 1,
              padding: '16px 12px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              background: vaultTab === 'stake' 
                ? 'linear-gradient(135deg, rgba(0,255,136,0.12) 0%, rgba(0,255,136,0.04) 100%)'
                : 'transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ 
              fontSize: 18, 
              marginBottom: 4,
              filter: vaultTab === 'stake' ? 'none' : 'grayscale(0.5) opacity(0.5)'
            }}>✨</div>
            <div style={{ 
              fontSize: 13, 
              fontWeight: 700, 
              color: vaultTab === 'stake' ? '#00ff88' : 'rgba(255,255,255,0.35)',
              marginBottom: 2
            }}>Staking</div>
            <div style={{ 
              fontSize: 10, 
              color: vaultTab === 'stake' ? 'rgba(0,255,136,0.6)' : 'rgba(255,255,255,0.2)'
            }}>Boost on FLR rewards</div>
          </button>
        </div> 
        */}

        {/* ==================== OG VAULT TAB ==================== */}
        {vaultTab === 'og' && (
          <div>
            {/* YOUR STATUS */}
            <div style={{
              background: 'linear-gradient(145deg, rgba(0,255,136,0.06) 0%, transparent 100%)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 16,
              padding: 24,
              marginBottom: 16,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>YOUR STATUS</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 40, marginBottom: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#00ff88' }}>{ogLockedCount}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Locked</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#00ff88' }}>{currentBoost.toFixed(2)}x</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Lock Boost</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#00ff88' }}>{toadz3dEarned}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Tadz</div>
                </div>
              </div>
              
              {/* Claim Button */}
              {tadzClaimData.claimable > 0 && (
                <button
                  onClick={handleClaimTadz}
                  disabled={loading}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                    border: 'none',
                    borderRadius: 12,
                    padding: '14px 24px',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginBottom: 12,
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Claiming...' : `Claim ${tadzClaimData.claimable} Tadz`}
                </button>
              )}
              
              {tadzClaimData.claimed > 0 && (
                <div style={{ fontSize: 11, color: 'rgba(168,85,247,0.7)', marginBottom: 8 }}>
                  {tadzClaimData.claimed} Tadz already claimed
                </div>
              )}
              
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                3 Tadz per OG locked • Boost scales
              </div>
            </div>

            {/* LOCK ACTION */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: 20,
              marginBottom: 16
            }}>
              <div 
                onClick={() => {
                  if (availableToLock > 0) {
                    // Combine all available NFTs from all OG collections
                    const allAvailableNfts = ogCollections.flatMap(col => 
                      (col.availableTokenIds || []).map(tokenId => ({
                        tokenId,
                        collection: col.address,
                        collectionName: col.name,
                        emoji: col.emoji
                      }))
                    );
                    setStakeNftModal({ 
                      collection: { 
                        name: 'OG NFTs', 
                        emoji: '🔒',
                        address: null, // Multiple collections
                        availableTokenIds: allAvailableNfts 
                      }, 
                      type: 'og',
                      isMultiCollection: true
                    });
                  }
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 18,
                  background: availableToLock > 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.02)',
                  border: availableToLock > 0 ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  cursor: availableToLock > 0 ? 'pointer' : 'default'
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Lock OGs</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: availableToLock > 0 ? '#00ff88' : 'rgba(255,255,255,0.3)' }}>
                  {availableToLock > 0 ? `${availableToLock} available` : 'None available'}
                </span>
              </div>
            </div>

            {/* COMMUNITY LOCKS */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: 20,
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>COMMUNITY LOCKS</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{allLockers.reduce((sum, l) => sum + l.count, 0)} total</span>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {allLockers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                    Be the first to lock
                  </div>
                ) : (
                  allLockers.map((locker, i) => (
                    <div key={locker.address} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: i < allLockers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      fontSize: 13
                    }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                        {locker.address.slice(0, 6)}...{locker.address.slice(-4)}
                      </span>
                      <span style={{ color: '#00ff88', fontWeight: 600 }}>{locker.count} locked</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* UPCOMING BENEFITS */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>UPCOMING</span>
                <span style={{ fontSize: 9, padding: '3px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 4, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 }}>IN DEVELOPMENT</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {/* 3D Toadz Card */}
                <div 
                  onClick={() => setLockInfoModal('toadz')}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '14px 10px',
                    textAlign: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>3D Toadz</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#a855f7' }}>{Math.floor(ogLockedCount / 3)}</div>
                </div>
                {/* Mint Discount Card */}
                <div 
                  onClick={() => setLockInfoModal('discount')}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '14px 10px',
                    textAlign: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 6v6l4 2"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Mint Discount</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>{currentDiscount}%</div>
                </div>
                {/* Rental Boost Card */}
                <div 
                  onClick={() => setLockInfoModal('rental')}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '14px 10px',
                    textAlign: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Rental Boost</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>TBD</div>
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 10 }}>tap for details</div>
            </div>

            {/* CTA */}
            <div style={{
              padding: 20,
              background: 'linear-gradient(135deg, rgba(168,85,247,0.1) 0%, rgba(236,72,153,0.1) 100%)',
              border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: 16,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Need more OGs?</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Buy on secondary to increase your rewards</div>
              <a 
                href="https://xhaven.io" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'white',
                  textDecoration: 'none',
                  cursor: 'pointer'
                }}
              >
                Browse xHaven
              </a>
            </div>
          </div>
        )}

        {/* ==================== NFT STAKING TAB - COMING SOON ==================== 
        {vaultTab === 'stake' && (
          <div style={{
            background: 'linear-gradient(165deg, rgba(0,255,136,0.06) 0%, rgba(0,255,136,0.01) 100%)',
            border: '1px solid rgba(0,255,136,0.12)',
            borderRadius: 20,
            padding: 40,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, color: '#00ff88' }}>Coming Soon</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              Additional boosts for all your NFTs
            </div>
          </div>
        )}
          */}
      </div>
    );
  };

  
  const PoolPage = () => {
    // Simulate wallet balances
    const walletFlr = walletBalance;
    const walletWflr = 0;
    const totalAvailable = walletFlr + walletWflr;
    const suggestedAdd = Math.floor(totalAvailable / 2);
    
    // Auto-split: POND required = FLR^0.7 (from contract getPondRequired)
    // User enters total FLR. We stake stakeAmount WFLR and need stakeAmount^0.7 POND.
    // Some FLR is used to buy POND, rest is staked as WFLR.
    const calcSplit = (flrAmount) => {
      if (flrAmount <= 0) return { flrForPond: 0, pondReceived: 0, stakeFlr: 0, stakePond: 0 };
      const pondPrice = poolStats.pondPrice || 0.5; // from contract getCurrentPrice
      // Binary search: find max stakeAmount where stakeAmount + cost(stakeAmount^0.7 POND) <= flrAmount
      let lo = 0, hi = flrAmount;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const pondNeeded = Math.pow(mid, 0.7);
        const costForPond = pondNeeded * pondPrice;
        if (mid + costForPond <= flrAmount) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const stakeFlr = Math.floor(lo);
      const pondNeeded = Math.pow(stakeFlr, 0.7);
      const flrForPond = Math.ceil(pondNeeded * pondPrice);
      return {
        flrForPond,
        pondReceived: Math.floor(pondNeeded),
        stakeFlr,
        stakePond: Math.floor(pondNeeded)
      };
    };
    
    const split = calcSplit(Number(addAmount) || 0);
    
    return (
      <div style={{ padding: isDesktop ? '40px 0' : '24px 0', maxWidth: 480, margin: '0 auto' }}>
        
        {/* Page Title + Tagline - only show when connected */}
        {walletAddress && (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: isDesktop ? 36 : 28, fontWeight: 900, marginBottom: 8, letterSpacing: -1 }}>Stake</h1>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Enhanced yield for $FLR</div>
          </div>
        )}
        
        {/* Add Modal */}
        {showAddModal && (
          <div 
            onClick={(e) => { if (e.target === e.currentTarget) { setShowAddModal(false); setAddAmount(''); }}}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 20
            }}
          >
            <div style={{
              background: '#0a0a0f',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: 24,
              maxWidth: 400,
              width: '100%'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Add to Position</div>
                <button 
                  onClick={() => { setShowAddModal(false); setAddAmount(''); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 24, cursor: 'pointer' }}
                >×</button>
              </div>
              
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
                Your FLR will be auto-split to purchase POND and stake both.
              </div>
              
              {/* FLR Input */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>FLR to add</span>
                  <button 
                    onClick={() => setAddAmount(String(suggestedAdd))}
                    style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Available: <span style={{ color: '#fff' }}>{totalAvailable.toLocaleString()}</span>
                  </button>
                </div>
                <input
                  type="number"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder={suggestedAdd.toLocaleString()}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              {/* Split Preview */}
              {Number(addAmount) > 0 && (
                <div style={{
                  background: 'rgba(0,255,136,0.06)',
                  border: '1px solid rgba(0,255,136,0.15)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20
                }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>POOL DEPOSITS</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>FLR</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{split.stakeFlr.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>POND</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{split.stakePond.toLocaleString()}</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    paddingTop: 12, 
                    borderTop: '1px solid rgba(0,255,136,0.2)' 
                  }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>New pool share</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#00ff88' }}>{poolInfo.totalWflr > 0 ? (((user.lpPosition + split.stakeFlr) / (poolInfo.totalWflr + split.stakeFlr)) * 100).toFixed(1) : '100'}%</span>
                  </div>
                </div>
              )}
              
              <button 
                onClick={async () => { 
                  if (Number(addAmount) > 0) {
                    await handleDeposit(addAmount, user.lockTier || lockTier);
                    setShowAddModal(false); 
                    setAddAmount(''); 
                  }
                }}
                disabled={loading || Number(addAmount) <= 0}
                style={{
                  width: '100%',
                  background: Number(addAmount) > 0 && !loading ? '#00ff88' : 'rgba(255,255,255,0.1)',
                  color: Number(addAmount) > 0 && !loading ? '#000' : 'rgba(255,255,255,0.3)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '16px',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: Number(addAmount) > 0 && !loading ? 'pointer' : 'default'
                }}>
                {loading ? 'Processing...' : Number(addAmount) > 0 ? `Add ${Number(addAmount).toLocaleString()} FLR` : 'Enter amount'}
              </button>
            </div>
          </div>
        )}
        
        {/* Lock Expired State - replaces position card */}
        {lockExpired && user.lpPosition > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 24,
            marginBottom: 20
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>YOUR LOCK EXPIRED</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 20 }}>Decision Time</div>
            
            {/* Performance Summary */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Position</span>
                <span>{user.lpPosition.toLocaleString()} FLR</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Total Earned</span>
                <span style={{ color: '#00ff88' }}>+{user.totalEarned.toLocaleString()}</span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                paddingTop: 12, 
                borderTop: '1px solid rgba(255,255,255,0.1)',
                fontSize: 14
              }}>
                <span style={{ fontWeight: 600 }}>Current Value</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#00ff88' }}>{user.totalPosition.toLocaleString()} FLR</span>
              </div>
            </div>
            
            {/* Loss Panel */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(255,80,80,0.12) 0%, rgba(255,50,50,0.05) 100%)',
              border: '1px solid rgba(255,80,80,0.25)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 24
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,100,100,0.9)', marginBottom: 12 }}>⚠ EXIT NOW AND LOSE</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Future earnings potential</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#ff6b6b' }}>Lost</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Your {poolInfo.totalWflr > 0 ? ((user.lpPosition / poolInfo.totalWflr) * 100).toFixed(1) : '0'}% pool share</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#ff6b6b' }}>Gone</span>
              </div>
            </div>
            
            {/* Relock CTA */}
            <button 
              onClick={() => setShowRestakeModal(true)}
              style={{
              width: '100%',
              background: '#00ff88',
              color: '#000',
              border: 'none',
              borderRadius: 12,
              padding: '18px',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              marginBottom: 16
            }}>
              Relock & Keep Earning
            </button>
            
            <div style={{ textAlign: 'center' }}>
              <button 
                onClick={() => setShowWithdrawModal(true)}
                style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 12,
                cursor: 'pointer'
              }}>
                withdraw instead →
              </button>
            </div>
          </div>
        )}
        
        {/* BOX 1: Your Return - only show if staked and NOT expired */}
        {user.lpPosition > 0 && !lockExpired && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 12
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Your Return</div>
          <div style={{ fontSize: 48, fontWeight: 900, color: '#00ff88', lineHeight: 1 }}>
            +{user.totalDeposited > 0 ? ((user.totalEarned / user.totalDeposited) * 100).toFixed(1) : '0'}%
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            <div>Position <span style={{ color: '#fff', fontWeight: 600 }}>{user.totalPosition.toLocaleString()} FLR</span></div>
            <div>Earned <span style={{ color: '#00ff88', fontWeight: 600 }}>+{user.totalEarned.toFixed(2)} FLR</span></div>
          </div>
        </div>
        )}

        {/* BOX 2: Pool Share with FOMO Slider */}
        {user.lpPosition > 0 && !lockExpired && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 12
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Pool Share</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#00ff88', marginBottom: 14 }}>
            {poolInfo.totalWflr > 0 ? ((user.lpPosition / poolInfo.totalWflr) * 100).toFixed(2) : '0'}%
          </div>
          
          {/* Slider */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>If you had deposited</span>
              <span style={{ fontWeight: 600, color: '#00ff88' }}>+{fomoFlrExtra.toLocaleString()} more</span>
            </div>
            <input
              type="range"
              min="0"
              max="10000"
              step="100"
              value={fomoFlrExtra}
              onChange={(e) => setFomoFlrExtra(Number(e.target.value))}
              style={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.08)',
                WebkitAppearance: 'none',
                appearance: 'none',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>
          
          {/* FOMO Result */}
          <div style={{
            background: 'rgba(0,255,136,0.05)',
            borderRadius: 8,
            padding: 12,
            textAlign: 'center',
            marginBottom: 12
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>You would have earned</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#00ff88' }}>
              +{(() => {
                const totalRewards = poolStats.totalPGS + poolStats.totalFtsoRewards;
                if (totalRewards === 0 || user.totalDeposited === 0) return user.totalEarned.toFixed(2);
                
                const pgsRatio = poolStats.totalPGS / totalRewards;
                const ftsoRatio = poolStats.totalFtsoRewards / totalRewards;
                
                const userPGS = user.totalEarned * pgsRatio;
                const userFTSO = user.totalEarned * ftsoRatio;
                
                // FTSO scales directly with deposit
                const newDeposit = user.totalDeposited + fomoFlrExtra;
                const hypotheticalFTSO = userFTSO * (newDeposit / user.totalDeposited);
                
                // PGS scales with pool share
                const oldShare = user.totalDeposited / poolInfo.totalWflr;
                const newPool = poolInfo.totalWflr + fomoFlrExtra;
                const newShare = newDeposit / newPool;
                const hypotheticalPGS = userPGS * (newShare / oldShare);
                
                return (hypotheticalPGS + hypotheticalFTSO).toFixed(2);
              })()} FLR
            </div>
            {fomoFlrExtra > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                +{(() => {
                  const totalRewards = poolStats.totalPGS + poolStats.totalFtsoRewards;
                  if (totalRewards === 0 || user.totalDeposited === 0) return '0.00';
                  
                  const pgsRatio = poolStats.totalPGS / totalRewards;
                  const ftsoRatio = poolStats.totalFtsoRewards / totalRewards;
                  
                  const userPGS = user.totalEarned * pgsRatio;
                  const userFTSO = user.totalEarned * ftsoRatio;
                  
                  const newDeposit = user.totalDeposited + fomoFlrExtra;
                  const hypotheticalFTSO = userFTSO * (newDeposit / user.totalDeposited);
                  
                  const oldShare = user.totalDeposited / poolInfo.totalWflr;
                  const newPool = poolInfo.totalWflr + fomoFlrExtra;
                  const newShare = newDeposit / newPool;
                  const hypotheticalPGS = userPGS * (newShare / oldShare);
                  
                  return ((hypotheticalPGS + hypotheticalFTSO) - user.totalEarned).toFixed(2);
                })()} more than now
              </div>
            )}
          </div>
          
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              color: '#00ff88'
            }}
          >Add FLR →</button>
        </div>
        )}

        {/* BOX 3: Boost with FOMO Slider */}
        {user.lpPosition > 0 && !lockExpired && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(236,72,153,0.08) 0%, rgba(168,85,247,0.05) 100%)',
          border: '1px solid rgba(236,72,153,0.15)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 20
        }}>
          <div style={{ fontSize: 10, color: 'rgba(236,72,153,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Your Boost</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ec4899', marginBottom: 14 }}>{user.weight}</div>
          
          {/* Slider */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>If you had</span>
              <span style={{ fontWeight: 600, color: '#ec4899' }}>+{fomoBoostExtra.toFixed(1)}x more</span>
            </div>
            <input
              type="range"
              className="pink-slider"
              min="0"
              max={Math.max(0, 5 - parseFloat(user.weight || '1'))}
              step="0.1"
              value={fomoBoostExtra}
              onChange={(e) => setFomoBoostExtra(Number(e.target.value))}
              style={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.08)',
                WebkitAppearance: 'none',
                appearance: 'none',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>
          
          {/* FOMO Result */}
          <div style={{
            background: 'rgba(236,72,153,0.05)',
            borderRadius: 8,
            padding: 12,
            textAlign: 'center',
            marginBottom: 12
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>You would have earned</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ec4899' }}>
              +{(() => {
                const currentBoost = parseFloat(user.weight) || 1;
                const newBoost = currentBoost + fomoBoostExtra;
                const baseEarned = user.totalEarned / currentBoost;
                return (baseEarned * newBoost).toFixed(2);
              })()} FLR
            </div>
            {fomoBoostExtra > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                +{(() => {
                  const currentBoost = parseFloat(user.weight) || 1;
                  const newBoost = currentBoost + fomoBoostExtra;
                  const baseEarned = user.totalEarned / currentBoost;
                  return ((baseEarned * newBoost) - user.totalEarned).toFixed(2);
                })()} more than now
              </div>
            )}
          </div>
          
          <button
            onClick={() => setActiveTab('market')}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(236,72,153,0.1)',
              border: '1px solid rgba(236,72,153,0.2)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              color: '#ec4899'
            }}
          >Get NFTs →</button>
        </div>
        )}

        {/* Stake - only show for new users OR if no position */}
        {user.lpPosition === 0 && (
        <>
        {/* Platform Stats Hero */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(0,255,136,0.02) 100%)',
          border: '1px solid rgba(0,255,136,0.15)',
          borderRadius: 12,
          padding: 18,
          marginBottom: 12,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Stake. Earn. Compound.</div>
          
          {/* Live Platform Totals Label */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: 6, 
            marginBottom: 14 
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px #22c55e',
              animation: 'pulse 2s infinite'
            }} />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>PLATFORM TOTALS</div>
          </div>
          
          {/* Top Staker Return - Main Headline */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#00ff88', marginBottom: 4, letterSpacing: 0.5 }}>TOP STAKER RETURN</div>
              {poolStats.topStakerReturn > 0 ? (
                <div style={{ fontSize: 36, fontWeight: 900, color: '#00ff88' }}>{poolInfo.topStakerPct}%</div>
              ) : (
                <div style={{ 
                  fontSize: 18, 
                  fontWeight: 500, 
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }}>calculating...</div>
              )}
            </div>
          </div>
          
          {/* Bottom Stats Row */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: 32, 
            paddingTop: 14, 
            borderTop: '1px solid rgba(255,255,255,0.08)' 
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{poolInfo.totalWflr > 0 ? (poolInfo.totalWflr >= 1000 ? (poolInfo.totalWflr / 1000).toFixed(0) + 'K' : poolInfo.totalWflr.toFixed(0)) : '0'}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>total staked</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{poolInfo.totalPaid > 0 ? (poolInfo.totalPaid >= 1000 ? (poolInfo.totalPaid / 1000).toFixed(0) + 'K' : poolInfo.totalPaid.toFixed(0)) : '0'}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>total paid</div>
            </div>
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12
        }}>
          {/* FLR Input */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>FLR</span>
              <button 
                onClick={() => setDepositFlr(String(user.flrBalance))}
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Balance: <span style={{ color: '#fff' }}>{user.flrBalance.toLocaleString()}</span>
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={depositFlr}
                onChange={(e) => setDepositFlr(e.target.value)}
                onFocus={() => setFlrInputFocused(true)}
                onBlur={() => setFlrInputFocused(false)}
                placeholder="0"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  border: flrInputFocused ? '1px solid rgba(0,255,136,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '12px 60px 12px 14px',
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  boxShadow: flrInputFocused ? '0 0 16px rgba(0,255,136,0.12)' : 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
              />
              <button
                onClick={() => setDepositFlr(String(user.flrBalance))}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0,255,136,0.15)',
                  border: '1px solid rgba(0,255,136,0.3)',
                  borderRadius: 5,
                  padding: '5px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#00ff88',
                  cursor: 'pointer'
                }}
              >MAX</button>
            </div>
          </div>

          {/* POND required (FLR^0.7) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>POND Required</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                Balance: <span style={{ color: '#fff' }}>{user.pondBalance.toLocaleString()}</span>
              </span>
            </div>
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 20,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.5)'
            }}>
             {depositFlr ? Math.floor(Math.pow(Number(depositFlr), 0.7)).toLocaleString() : '0'}
            </div>
            {depositFlr && Math.floor(Math.pow(Number(depositFlr), 0.7)) > user.pondBalance && (
              <div style={{ fontSize: 10, color: '#ffaa00', marginTop: 5 }}>
                Need {Math.floor(Math.pow(Number(depositFlr), 0.7) - user.pondBalance).toLocaleString()} more POND — will auto-buy from deposit
              </div>
            )}
          </div>

          {/* Lock Tier */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { tier: 0, days: '90d', mult: '1x' },
                { tier: 1, days: '180d', mult: '2x' },
                { tier: 2, days: '365d', mult: '4x' }
              ].map(({ tier, days, mult }) => (
                <button
                  key={tier}
                  onClick={() => setLockTier(tier)}
                  style={{
                    flex: 1,
                    background: lockTier === tier ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.03)',
                    border: lockTier === tier ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '10px 6px',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: lockTier === tier ? '#fff' : 'rgba(255,255,255,0.5)' }}>{days}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: lockTier === tier ? '#00ff88' : 'rgba(255,255,255,0.3)', marginLeft: 5 }}>{mult}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Lock Bonus Visualization */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
              {/* Progress fill */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: lockTier === 0 ? '0%' : lockTier === 1 ? '50%' : '100%',
                background: 'linear-gradient(90deg, #00ff88, #22c55e)',
                borderRadius: 3,
                transition: 'width 0.3s ease'
              }} />
              {/* Marker dots */}
              <div style={{ position: 'absolute', left: '0%', top: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, background: '#1a1a1a', border: '2px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, background: lockTier >= 1 ? '#00ff88' : '#1a1a1a', border: lockTier >= 1 ? '2px solid #00ff88' : '2px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
              <div style={{ position: 'absolute', left: '100%', top: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, background: lockTier >= 2 ? '#00ff88' : '#1a1a1a', border: lockTier >= 2 ? '2px solid #00ff88' : '2px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
            </div>
            {/* Lock bonus text */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {lockTier === 0 ? '90d' : lockTier === 1 ? '180d' : '365d'} → <span style={{ color: '#00ff88', fontWeight: 600 }}>{lockTier === 0 ? '1x' : lockTier === 1 ? '2x' : '4x'} rewards</span>
              </span>
            </div>
          </div>

          {depositFlr && Number(depositFlr) > 0 && Number(depositFlr) < 100 && (
            <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
              Minimum deposit is 100 FLR
            </div>
          )}
          
          <button 
            onClick={() => {
              if (!connected) {
                showToast('error', 'Please connect wallet');
                return;
              }
              if (depositFlr && Number(depositFlr) >= 100) {
                handleDeposit(depositFlr, lockTier);
              }
            }}
            disabled={loading || !depositFlr || Number(depositFlr) < 100}
            style={{
            width: '100%',
            background: depositFlr && Number(depositFlr) >= 100 && !loading ? '#00ff88' : 'rgba(255,255,255,0.1)',
            color: depositFlr && Number(depositFlr) >= 100 && !loading ? '#000' : 'rgba(255,255,255,0.3)',
            border: 'none',
            borderRadius: 12,
            padding: '16px',
            fontSize: 16,
            fontWeight: 700,
            cursor: depositFlr && Number(depositFlr) >= 100 && !loading ? 'pointer' : 'default'
          }}>
            {loading ? 'Processing...' : !depositFlr ? 'Enter amount' : Number(depositFlr) < 100 ? 'Minimum 100 FLR' : `Stake ${Number(depositFlr).toLocaleString()} FLR`}
          </button>
        </div>
        </>
        )}

        {/* Buy / Redeem POND - collapsed by default, hidden when expired */}
        {!lockExpired && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: 16
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setSwapMode(swapMode === 'buy' ? null : 'buy')}
              style={{
                flex: 1,
                background: swapMode === 'buy' ? '#00ff88' : 'transparent',
                color: swapMode === 'buy' ? '#000' : 'rgba(255,255,255,0.5)',
                border: swapMode === 'buy' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}>Buy POND</button>
            <button 
              onClick={() => setSwapMode(swapMode === 'sell' ? null : 'sell')}
              style={{
                flex: 1,
                background: swapMode === 'sell' ? '#ffaa77' : 'transparent',
                color: swapMode === 'sell' ? '#000' : 'rgba(255,255,255,0.5)',
                border: swapMode === 'sell' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}>Redeem POND</button>
          </div>

          {swapMode === 'buy' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>WFLR → POND</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Balance: {wflrBalance.toLocaleString()} WFLR</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  placeholder="0"
                  style={{
                    flex: 1,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: '12px',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#fff',
                    outline: 'none'
                  }}
                />
                <button 
                  onClick={() => swapAmount && handleBuyPond(swapAmount)}
                  disabled={loading || !swapAmount}
                  style={{
                  background: '#00ff88',
                  color: '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: swapAmount && !loading ? 'pointer' : 'default',
                  opacity: swapAmount && !loading ? 1 : 0.5
                }}>{loading ? '...' : 'Buy'}</button>
              </div>
              {swapAmount && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                  ≈ {Math.floor(Number(swapAmount) * 2).toLocaleString()} POND
                </div>
              )}
            </div>
          )}

          {swapMode === 'sell' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>POND → WFLR</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Balance: {pondBalance.toLocaleString()} POND</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  placeholder="0"
                  style={{
                    flex: 1,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: '12px',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#fff',
                    outline: 'none'
                  }}
                />
                <button 
                  onClick={() => swapAmount && handleSellPond(swapAmount)}
                  disabled={loading || !swapAmount}
                  style={{
                  background: '#ffaa77',
                  color: '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: swapAmount && !loading ? 'pointer' : 'default',
                  opacity: swapAmount && !loading ? 1 : 0.5
                }}>{loading ? '...' : 'Redeem'}</button>
              </div>
              {swapAmount && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                  ≈ {Math.floor(Number(swapAmount) * 0.5).toLocaleString()} WFLR
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Active Redemption - only show if exists and not expired */}
        {showRedemption && !lockExpired && (
        <div style={{
          marginTop: 16,
          background: 'rgba(255,150,100,0.05)',
          border: '1px solid rgba(255,150,100,0.15)',
          borderRadius: 12,
          padding: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Redemption: 10k POND → 5k FLR</span>
            <span style={{ fontSize: 12, color: '#ffaa77', fontWeight: 600 }}>37% ready</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>
              <div style={{ width: '37%', height: '100%', background: '#ffaa77', borderRadius: 3 }} />
            </div>
            <button 
              onClick={() => handleClaim()}
              disabled={loading}
              style={{
              background: loading ? 'rgba(255,170,119,0.5)' : '#ffaa77',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer'
            }}>{loading ? '...' : 'Claim'}</button>
          </div>
        </div>
        )}
      </div>
    );
  };

  // ============ ADMIN PAGE ============
  const [adminData, setAdminData] = useState({
    stakers: [],
    poolStats: {},
    rentals: [],
    ftsoStatus: {},
    balances: {},
    loading: false
  });
  const [adminClaimEpoch, setAdminClaimEpoch] = useState('');
  const [adminClaiming, setAdminClaiming] = useState(false);
  const [manualAddressInput, setManualAddressInput] = useState('');
  const [epochStatuses, setEpochStatuses] = useState({}); // { epochId: 'claimed' | 'failed' | 'pending' | null }
  const [claimingAll, setClaimingAll] = useState(false);

  const loadAdminData = async () => {
    if (!walletAddress) return;
    setAdminData(prev => ({ ...prev, loading: true }));
    
    try {
      const provider = new ethers.JsonRpcProvider('https://coston2-api.flare.network/ext/C/rpc');
      const stakeContract = new ethers.Contract(CONTRACTS.ToadzStake, [
        'function totalWflrStaked() view returns (uint256)',
        'function totalPondStaked() view returns (uint256)',
        'function rewardIndex() view returns (uint256)',
        'function totalWeightedShares() view returns (uint256)',
        'function totalEffectiveShares() view returns (uint256)',
        'function totalFtsoRewardsClaimed() view returns (uint256)',
        'function seedBalance() view returns (uint256)',
        'function ftsoProvider() view returns (address)',
        'function positions(address) view returns (uint256 wflrStaked, uint256 pondStaked, uint256 earnedWflr, uint256 lockExpiry, uint256 lockMultiplier, uint256 rewardDebt, uint256 lastUpdateTime)',
        'function feeRecipient() view returns (address)'
      ], provider);
      
      const wflrContract = new ethers.Contract('0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', [
        'function balanceOf(address) view returns (uint256)'
      ], provider);
      
      // Pool stats - fetch individually to isolate errors
      let totalWflr = 0n, totalPond = 0n, rewardIndex = 0n, totalWeighted = 0n, totalEffective = 0n, totalClaimed = 0n, seedBal = 0n, ftsoProvider = '', stakeFeeRecipient = '';
      
      try { totalWflr = await stakeContract.totalWflrStaked(); } catch (e) { console.log('totalWflrStaked error:', e.message); }
      try { totalPond = await stakeContract.totalPondStaked(); } catch (e) { console.log('totalPondStaked error:', e.message); }
      try { rewardIndex = await stakeContract.rewardIndex(); } catch (e) { console.log('rewardIndex error:', e.message); }
      try { totalWeighted = await stakeContract.totalWeightedShares(); } catch (e) { console.log('totalWeightedShares error:', e.message); }
      try { totalEffective = await stakeContract.totalEffectiveShares(); } catch (e) { console.log('totalEffectiveShares error:', e.message); }
      try { totalClaimed = await stakeContract.totalFtsoRewardsClaimed(); } catch (e) { console.log('totalFtsoRewardsClaimed error:', e.message); }
      try { seedBal = await stakeContract.seedBalance(); } catch (e) { console.log('seedBalance error:', e.message); }
      try { ftsoProvider = await stakeContract.ftsoProvider(); } catch (e) { console.log('ftsoProvider error:', e.message); }
      try { stakeFeeRecipient = await stakeContract.feeRecipient(); } catch (e) { console.log('feeRecipient error:', e.message); }
      
      // Contract balances
      let stakeWflr = 0n, stakeNative = 0n;
      try { stakeWflr = await wflrContract.balanceOf(CONTRACTS.ToadzStake); } catch (e) { console.log('stakeWflr error:', e.message); }
      try { stakeNative = await provider.getBalance(CONTRACTS.ToadzStake); } catch (e) { console.log('stakeNative error:', e.message); }
      
      // Current FTSO epoch
      let currentEpoch = 0;
      try {
        const rewardManager = new ethers.Contract('0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B', [
          'function getCurrentRewardEpochId() view returns (uint24)'
        ], provider);
        currentEpoch = Number(await rewardManager.getCurrentRewardEpochId());
      } catch (e) {
        console.log('getCurrentRewardEpochId error:', e.message);
      }
      
      // Active rentals - skip if problematic
      let rentals = [];
      try {
        const marketContract = new ethers.Contract(CONTRACTS.ToadzMarket, [
          'function getActiveRentalCount() view returns (uint256)',
          'function getAllActiveRentalListings() view returns (address[] collections, uint256[] tokenIds, address[] owners, uint256[] dailyRates, uint256[] commitmentEnds)',
          'function getActiveRental(address,uint256) view returns (address renter, uint256 startTime, uint256 endTime, uint256 dailyRate, uint256 pendingPayment)'
        ], provider);
        
        const rentalCount = await marketContract.getActiveRentalCount();
        if (rentalCount > 0n) {
          const [cols, ids, owners, rates, ends] = await marketContract.getAllActiveRentalListings();
          for (let i = 0; i < cols.length; i++) {
            let renter = null;
            try {
              const rentalInfo = await marketContract.getActiveRental(cols[i], ids[i]);
              renter = rentalInfo.renter;
            } catch (e) {}
            rentals.push({
              collection: cols[i],
              tokenId: ids[i].toString(),
              owner: owners[i],
              renter,
              dailyRate: ethers.formatEther(rates[i]),
              commitmentEnd: Number(ends[i])
            });
          }
        }
      } catch (e) {
        console.log('Rentals fetch error:', e.message);
      }
      
      // Stakers - use known addresses only to avoid event fetching issues
      const knownAddresses = [
        '0x9bDB29529016a15754373B9D5B5116AB728E916e',
        '0x4352c130a29cCFB7998C9EA1FA62E7cFB56e5b66',
        walletAddress
      ].filter((v, i, a) => v && a.findIndex(x => x && x.toLowerCase() === v.toLowerCase()) === i);
      
      const stakers = [];
      for (const addr of knownAddresses) {
        try {
          const pos = await stakeContract.positions(addr);
          if (pos.wflrStaked > 0n) {
            stakers.push({
              address: addr,
              wflrStaked: ethers.formatEther(pos.wflrStaked),
              pondStaked: ethers.formatEther(pos.pondStaked),
              earnedWflr: ethers.formatEther(pos.earnedWflr),
              lockExpiry: Number(pos.lockExpiry),
              lockMultiplier: Number(pos.lockMultiplier),
              totalDeposited: '—',
              totalRewardsEarned: '—'
            });
          }
        } catch (e) {
          console.log('Staker fetch error:', addr, e.message);
        }
      }
      
      stakers.sort((a, b) => parseFloat(b.wflrStaked) - parseFloat(a.wflrStaked));
      
      setAdminData({
        stakers,
        poolStats: {
          totalWflr: ethers.formatEther(totalWflr),
          totalPond: ethers.formatEther(totalPond),
          rewardIndex: ethers.formatEther(rewardIndex),
          totalWeighted: ethers.formatEther(totalWeighted),
          totalEffective: ethers.formatEther(totalEffective),
          totalClaimed: ethers.formatEther(totalClaimed),
          seedBalance: ethers.formatEther(seedBal),
          ftsoProvider,
          stakeFeeRecipient,
          currentEpoch
        },
        rentals,
        balances: {
          stakeWflr: ethers.formatEther(stakeWflr),
          stakeNative: ethers.formatEther(stakeNative)
        },
        loading: false
      });
    } catch (err) {
      console.error('Admin load error:', err);
      setAdminData(prev => ({ ...prev, loading: false }));
      showToast('error', 'Load failed - check console');
    }
  };

  // Claim single epoch and track result
  const claimEpoch = async (epochId) => {
    if (!signer) return false;
    setEpochStatuses(prev => ({ ...prev, [epochId]: 'pending' }));
    try {
      const contract = new ethers.Contract(CONTRACTS.ToadzStake, [
        'function claimFtsoRewards(uint24 _rewardEpochId) external'
      ], signer);
      const tx = await contract.claimFtsoRewards(epochId);
      const receipt = await tx.wait();
      setEpochStatuses(prev => ({ ...prev, [epochId]: 'claimed' }));
      return true;
    } catch (err) {
      const msg = err.reason || err.message || '';
      // Common failures: already claimed, no rewards, not ready
      setEpochStatuses(prev => ({ ...prev, [epochId]: 'failed' }));
      return false;
    }
  };

  const handleAdminClaim = async () => {
    if (!signer || !adminClaimEpoch) return;
    setAdminClaiming(true);
    const success = await claimEpoch(parseInt(adminClaimEpoch));
    if (success) {
      showToast('success', `Claimed epoch ${adminClaimEpoch}`);
      loadAdminData();
    } else {
      showToast('error', `Epoch ${adminClaimEpoch} failed (already claimed or no rewards)`);
    }
    setAdminClaiming(false);
  };

  // Claim all unclaimed epochs from current-10 to current-1
  const handleClaimAll = async () => {
    if (!signer || !adminData.poolStats?.currentEpoch) return;
    setClaimingAll(true);
    
    const currentEpoch = adminData.poolStats.currentEpoch;
    const startEpoch = Math.max(0, currentEpoch - 10);
    const endEpoch = currentEpoch - 1; // Can't claim current epoch
    
    let claimed = 0;
    let failed = 0;
    
    for (let ep = endEpoch; ep >= startEpoch; ep--) {
      // Skip already claimed/failed
      if (epochStatuses[ep] === 'claimed') continue;
      
      showToast('info', `Trying epoch ${ep}...`);
      const success = await claimEpoch(ep);
      if (success) {
        claimed++;
      } else {
        failed++;
      }
      // Small delay between attempts
      await new Promise(r => setTimeout(r, 1000));
    }
    
    if (claimed > 0) {
      showToast('success', `Claimed ${claimed} epochs!`);
      loadAdminData();
    } else {
      showToast('info', `No new rewards to claim (${failed} epochs checked)`);
    }
    setClaimingAll(false);
  };

  const handleProcessRentals = async () => {
    if (!signer) return;
    try {
      const contract = new ethers.Contract(CONTRACTS.ToadzMarket, [
        'function processRentals(uint256 maxToProcess) external'
      ], signer);
      const tx = await contract.processRentals(50);
      await tx.wait();
      showToast('success', 'Processed rentals');
      loadAdminData();
    } catch (err) {
      showToast('error', 'Process failed: ' + (err.reason || err.message));
    }
  };

  const handleCheckAddress = async () => {
    if (!manualAddressInput || !ethers.isAddress(manualAddressInput)) {
      showToast('error', 'Invalid address');
      return;
    }
    try {
      const provider = new ethers.JsonRpcProvider('https://coston2-api.flare.network/ext/C/rpc');
      const stakeContract = new ethers.Contract(CONTRACTS.ToadzStake, [
        'function positions(address) view returns (uint256 wflrStaked, uint256 pondStaked, uint256 earnedWflr, uint256 lockExpiry, uint256 lockMultiplier, uint256 rewardDebt, uint256 lastUpdateTime)'
      ], provider);
      
      const pos = await stakeContract.positions(manualAddressInput);
      
      if (pos.wflrStaked > 0n) {
        const newStaker = {
          address: manualAddressInput,
          wflrStaked: ethers.formatEther(pos.wflrStaked),
          pondStaked: ethers.formatEther(pos.pondStaked),
          earnedWflr: ethers.formatEther(pos.earnedWflr),
          lockExpiry: Number(pos.lockExpiry),
          lockMultiplier: Number(pos.lockMultiplier),
          totalDeposited: '—',
          totalRewardsEarned: '—'
        };
        // Add to stakers if not already present
        setAdminData(prev => {
          const exists = prev.stakers.some(s => s.address.toLowerCase() === manualAddressInput.toLowerCase());
          if (exists) {
            showToast('info', 'Address already in list');
            return prev;
          }
          showToast('success', `Added ${manualAddressInput.slice(0,8)}...`);
          return {
            ...prev,
            stakers: [...prev.stakers, newStaker].sort((a, b) => parseFloat(b.wflrStaked) - parseFloat(a.wflrStaked))
          };
        });
        setManualAddressInput('');
      } else {
        showToast('info', 'Address has no staked position');
      }
    } catch (err) {
      showToast('error', 'Check failed: ' + err.message);
    }
  };

  const AdminPage = () => {
    const ADMIN_WALLET = '0x9bDB29529016a15754373B9D5B5116AB728E916e';
    const isAdmin = walletAddress && walletAddress.toLowerCase() === ADMIN_WALLET.toLowerCase();
    
    const { stakers, poolStats, rentals, balances, loading } = adminData;
    
    if (!isAdmin) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Admin Only</div>
        </div>
      );
    }
    
    return (
      <div style={{ padding: isDesktop ? '40px 20px' : '20px', maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 24 }}>Admin Dashboard</h1>
        
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>Loading...</div>
        ) : Object.keys(poolStats).length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>Click Refresh to load data</div>
            <button onClick={loadAdminData} style={{
              background: '#00ff88',
              border: 'none',
              borderRadius: 8,
              padding: '12px 24px',
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}>🔄 Load Admin Data</button>
          </div>
        ) : (
          <>
            {/* Quick Actions */}
            <div style={{
              display: 'flex',
              gap: 12,
              marginBottom: 24,
              flexWrap: 'wrap'
            }}>
              <button onClick={loadAdminData} style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                padding: '10px 16px',
                color: '#fff',
                fontSize: 13,
                cursor: 'pointer'
              }}>🔄 Refresh</button>
              
              <button onClick={handleProcessRentals} style={{
                background: 'rgba(139,92,246,0.2)',
                border: '1px solid rgba(139,92,246,0.3)',
                borderRadius: 8,
                padding: '10px 16px',
                color: '#a855f7',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}>Process Rentals</button>
              
              {/* Manual address check */}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <input
                  type="text"
                  placeholder="0x... check address"
                  value={manualAddressInput}
                  onChange={(e) => setManualAddressInput(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: '#fff',
                    width: 180,
                    fontSize: 11
                  }}
                />
                <button 
                  onClick={handleCheckAddress}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: '#fff',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >+ Add</button>
              </div>
            </div>
            
            {/* Contract Balances */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Contract Balances</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>ToadzStake WFLR (TVL)</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{parseFloat(balances.stakeWflr).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>ToadzStake Native FLR</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{parseFloat(balances.stakeNative).toFixed(4)}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>For wrapAndDistribute()</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Seed Balance</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{parseFloat(poolStats.seedBalance || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Buffer for deposits</div>
                </div>
              </div>
            </div>

            {/* FTSO Status (Yield Source) */}
            <div style={{
              background: 'rgba(255,200,0,0.05)',
              border: '1px solid rgba(255,200,0,0.15)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#ffc800' }}>
                  FTSO Rewards (Yield Source)
                </div>
                <button 
                  onClick={handleClaimAll}
                  disabled={claimingAll || !poolStats.currentEpoch}
                  style={{
                    background: claimingAll ? 'rgba(255,200,0,0.2)' : 'linear-gradient(135deg, #ffc800, #ff9500)',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    color: claimingAll ? '#ffc800' : '#000',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: claimingAll ? 'not-allowed' : 'pointer'
                  }}
                >{claimingAll ? 'Claiming...' : 'Claim All Unclaimed'}</button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Current Epoch</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{poolStats.currentEpoch || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Total Yield Claimed</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{parseFloat(poolStats.totalClaimed || 0).toLocaleString()} FLR</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>FTSO Provider</div>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{poolStats.ftsoProvider?.slice(0,10)}...</div>
                </div>
              </div>
              
              {/* Epoch Grid */}
              {poolStats.currentEpoch && (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Recent Epochs (click to claim individually)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Array.from({ length: 10 }, (_, i) => {
                      const ep = poolStats.currentEpoch - 1 - i;
                      if (ep < 0) return null;
                      const status = epochStatuses[ep];
                      const isCurrent = ep === poolStats.currentEpoch;
                      return (
                        <button
                          key={ep}
                          onClick={() => !status && claimEpoch(ep).then(success => {
                            if (success) { showToast('success', `Epoch ${ep} claimed!`); loadAdminData(); }
                            else showToast('error', `Epoch ${ep}: no rewards or already claimed`);
                          })}
                          disabled={status === 'pending' || status === 'claimed'}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: 'none',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: status === 'pending' || status === 'claimed' ? 'default' : 'pointer',
                            background: status === 'claimed' ? 'rgba(0,255,136,0.2)' 
                              : status === 'failed' ? 'rgba(255,100,100,0.2)'
                              : status === 'pending' ? 'rgba(255,200,0,0.3)'
                              : 'rgba(255,255,255,0.1)',
                            color: status === 'claimed' ? '#00ff88'
                              : status === 'failed' ? '#ff6b6b'
                              : status === 'pending' ? '#ffc800'
                              : '#fff'
                          }}
                        >
                          {ep}
                          {status === 'claimed' && ' ✓'}
                          {status === 'failed' && ' ✗'}
                          {status === 'pending' && ' ...'}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                    ✓ = claimed this session | ✗ = no rewards/already claimed | Click unchecked to try
                  </div>
                </div>
              )}
            </div>
            
            {/* Pool Stats */}
            <div style={{
              background: 'rgba(0,255,136,0.05)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#00ff88' }}>Pool Statistics (PGS Source)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Total WFLR Staked</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{parseFloat(poolStats.totalWflr || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Total POND Staked</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{parseFloat(poolStats.totalPond || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Reward Index (PGS)</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{parseFloat(poolStats.rewardIndex || 0).toFixed(6)}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Per-share accumulator</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Total Weighted Shares</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{parseFloat(poolStats.totalWeighted || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Total Effective Shares</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{parseFloat(poolStats.totalEffective || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>FTSO Provider</div>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{poolStats.ftsoProvider?.slice(0,10)}...</div>
                </div>
              </div>
            </div>
            
            {/* Stakers Table */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
              overflowX: 'auto'
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Stakers ({stakers.length})</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Address</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>WFLR Staked</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>POND</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Earned</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Lock</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  {stakers.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{s.address.slice(0,8)}...{s.address.slice(-6)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{parseFloat(s.wflrStaked).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{parseFloat(s.pondStaked).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#00ff88' }}>+{parseFloat(s.earnedWflr).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {s.lockExpiry > Date.now()/1000 
                          ? `${Math.ceil((s.lockExpiry - Date.now()/1000) / 86400)}d` 
                          : <span style={{ color: '#ff6b6b' }}>Expired</span>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.lockMultiplier}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Active Rentals */}
            <div style={{
              background: 'rgba(139,92,246,0.05)',
              border: '1px solid rgba(139,92,246,0.15)',
              borderRadius: 12,
              padding: 20
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#a855f7' }}>Active Rentals ({rentals.length})</div>
              {rentals.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>No active rentals</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Token</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Owner</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Renter</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Daily Rate</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', color: 'rgba(255,255,255,0.5)' }}>Ends</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentals.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 12px' }}>#{r.tokenId}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{r.owner.slice(0,8)}...</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{r.renter ? `${r.renter.slice(0,8)}...` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{r.dailyRate} FLR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{new Date(r.commitmentEnd * 1000).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const ReferPage = () => {
    // Founder referral - always visible
    const FOUNDER_WALLET = '0x9bDB29529016a15754373B9D5B5116AB728E916e';
    const isFounder = walletAddress && walletAddress.toLowerCase() === FOUNDER_WALLET.toLowerCase();
    
    const activeReferrers = [
      { slug: 'sifu', address: FOUNDER_WALLET, earned: '0' }
    ];
    
    // Generate referral link for current user
    const userRefLink = walletAddress ? `${window.location.origin}?ref=${walletAddress}` : '';
    const founderRefLink = `${window.location.origin}?ref=${FOUNDER_WALLET}`;
    
    return (
      <div style={{ padding: isDesktop ? '32px 0' : '20px 0', maxWidth: 500, margin: '0 auto' }}>
        <h1 style={{ fontSize: isDesktop ? 28 : 24, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5, textAlign: 'center' }}>Refer & Earn</h1>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: isDesktop ? 20 : 16 }}>1% of referral rewards forever</div>

        {/* Locked state - hasn't used a referral link (unless founder) */}
        {!usedReferral && !isFounder ? (
          <>
            <div style={{
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              position: 'relative'
            }}>
              {/* Locked badge */}
              <div style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'rgba(0,0,0,0.6)',
                borderRadius: 6,
                padding: '5px 8px',
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}>
                🔒 LOCKED
              </div>

              {/* Blurred stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16, filter: 'blur(6px)', opacity: 0.5 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>EARNED</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#00ff88' }}>—</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>REFERRALS</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>—</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>VOLUME</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>—</div>
                </div>
              </div>

              {/* Link preview */}
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 12,
                textAlign: 'center'
              }}>
                toadz.flare/ref/<span style={{ color: '#00ff88' }}>yourname</span>
              </div>

              {/* Unlock prompt */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 3 }}>Join the pool using any referral link to unlock your own</div>
                <div style={{ fontSize: 12, color: '#00ff88', fontWeight: 600 }}>1% rewards forever from your referees</div>
              </div>
            </div>

            {/* Active referral links */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 10 }}>ACTIVE REFERRAL LINKS</div>
              {activeReferrers.map((ref, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  marginBottom: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#00ff88', fontWeight: 600 }}>toadz.flare/ref/{ref.slug}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{ref.earned} FLR earned</div>
                  </div>
                  <button 
                    onClick={() => setUsedReferral(true)}
                    style={{
                    background: 'rgba(0,255,136,0.15)',
                    border: '1px solid rgba(0,255,136,0.3)',
                    borderRadius: 6,
                    padding: '7px 14px',
                    color: '#00ff88',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}>Join →</button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Unlocked - Earnings */}
            <div style={{
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>EARNED</div>
                  <div style={{ fontSize: isDesktop ? 20 : 18, fontWeight: 900, color: '#00ff88' }}>0</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>FLR</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>REFERRALS</div>
                  <div style={{ fontSize: isDesktop ? 20 : 18, fontWeight: 900 }}>0</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>users</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>VOLUME</div>
                  <div style={{ fontSize: isDesktop ? 20 : 18, fontWeight: 900 }}>0</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>FLR</div>
                </div>
              </div>
            </div>

            {/* Your Link */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: 16,
              marginBottom: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 }}>YOUR LINK</div>
                <div style={{ fontSize: 10, color: '#00ff88' }}>✓ Active</div>
              </div>
              
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 10,
                wordBreak: 'break-all'
              }}>
                {userRefLink || founderRefLink}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(userRefLink || founderRefLink);
                  showToast('success', 'Link copied');
                }}
                style={{
                  width: '100%',
                  background: '#00ff88',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}>Copy Link</button>
            </div>
          </>
        )}
      </div>
    );
  };

  const MarketPage = () => {
    const [marketViewMode, setMarketViewMode] = useState('list'); // 'list' or 'grid'
    const [marketSortBy, setMarketSortBy] = useState('boost');
    const [marketSortDir, setMarketSortDir] = useState('desc');
    const [marketExpandedRow, setMarketExpandedRow] = useState(null);
    
    // Supported collections with metadata
    const collections = [
      { contract: '0x127bb21a24b8ea5913f1c8c9868800fbcef1316e', name: 'Super Bad Monsters', emoji: '👹', floor: 500, supply: 5100, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x2959d636871d9714dd6e00f4e9700ccc346cc39e', name: 'Doodle Bunny', emoji: '🐰', floor: 300, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x595fa9effad5c0c214b00b1e3004302519bfc1db', name: 'Flaremingo Fren', emoji: '🦩', floor: 400, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x5f4283cf126a4dcce16b66854cc9a713893c0000', name: 'Smuggler Chimps', emoji: '🐵', floor: 350, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x862b713fecebc5304ed7af993d79a3a6ae8747dd', name: 'Flare Apes', emoji: '🦍', floor: 800, supply: 5000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x93365aace3db5407b0976c0a6c5f46b21bad3923', name: 'The Fat Kittens', emoji: '🐱', floor: 250, supply: 5000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x94aa172076a59baa1b5d63ae4dbf722f74e45e57', name: 'Origami SGB', emoji: '🦢', floor: 200, supply: 500, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x9d8644a5d4ed0b4ca462ef32a6d47eb03c59db', name: 'Lucky Ball', emoji: '🎱', floor: 150, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x9f338ac5d000baab73f619fc75115f2fe9773736', name: 'Mutation Serums', emoji: '🧪', floor: 600, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0xbc25d2997a7a7b42d2501a4c4d0169f135743a64', name: 'Poodle Islands', emoji: '🐩', floor: 300, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0xbc42e9a6c24664749b2a0d571fd67f23386e34b8', name: 'Floor-Sweeper', emoji: '🧹', floor: 100, supply: 2000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0xc5f0c8b27dd920f4f469a857d6f0fecf0fa2bdb8', name: 'Flare Punks', emoji: '👤', floor: 450, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0xd1ef6460d9d06a4ce74d9800b1bc11ade822b349', name: 'Bare Bonez', emoji: '💀', floor: 350, supply: 10000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0xe2432f1e376482ec914ebbb910d3bfd8e3f3f29e', name: 'Flaremingo', emoji: '🦩', floor: 500, supply: 1000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0xe6e5fa0b12d9e8ed12cb8ab733e6444f3c74c68c', name: 'Poodle & Friends', emoji: '🐩', floor: 400, supply: 2000, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0x4fd29d6c713a390aa38b650254d0cd38a4982dbd', name: 'Focus Pass', emoji: '🎯', floor: 1000, supply: 500, staked: 0, boostRange: '0.05x - 0.20x' },
      { contract: '0xa574dd4393e828b8cf7c3c379861c748d321bbfd', name: 'FlareRock', emoji: '🪨', floor: 200, supply: 100, staked: 0, boostRange: '0.05x - 0.20x' },
    ];
    
    // Mock all listings for terminal view
    const allListings = [
      { id: 1, collection: 'Flare Apes', tokenId: 4521, price: 850, boost: 2, traits: ['Gold BG', 'Laser'], emoji: '🦍' },
      { id: 2, collection: 'Bare Bonez', tokenId: 892, price: 1200, boost: 2, traits: ['Zombie', 'Crown'], emoji: '💀' },
      { id: 3, collection: 'Flare Apes', tokenId: 1247, price: 920, boost: 1.5, traits: ['Purple BG'], emoji: '🦍' },
      { id: 4, collection: 'Fat Kittens', tokenId: 2891, price: 450, boost: 1, traits: ['Rare Outfit'], emoji: '🐱' },
      { id: 5, collection: 'Poodle Islands', tokenId: 156, price: 2100, boost: 1.5, traits: ['Penthouse'], emoji: '🐩' },
      { id: 6, collection: 'Flare Apes', tokenId: 7733, price: 780, boost: 2, traits: ['Blue BG', '3D'], emoji: '🦍' },
      { id: 7, collection: 'Flare Punks', tokenId: 423, price: 1850, boost: 1.25, traits: ['Downtown'], emoji: '👤' },
      { id: 8, collection: 'Bare Bonez', tokenId: 2580, price: 5000, boost: 2, traits: ['Gold Skin'], emoji: '💀' },
      { id: 9, collection: 'Fat Kittens', tokenId: 1456, price: 380, boost: 0.5, traits: ['Common'], emoji: '🐱' },
      { id: 10, collection: 'Flare Apes', tokenId: 9102, price: 1100, boost: 1.75, traits: ['Alien'], emoji: '🦍' },
    ];
    
    const handleMarketSort = (col) => {
      if (marketSortBy === col) {
        setMarketSortDir(marketSortDir === 'asc' ? 'desc' : 'asc');
      } else {
        setMarketSortBy(col);
        setMarketSortDir(col === 'boost' ? 'desc' : 'asc');
      }
    };
    
    const sortedListings = [...allListings].sort((a, b) => {
      const mult = marketSortDir === 'asc' ? 1 : -1;
      if (marketSortBy === 'price') return (a.price - b.price) * mult;
      if (marketSortBy === 'boost') return (a.boost - b.boost) * mult;
      if (marketSortBy === 'id') return (a.tokenId - b.tokenId) * mult;
      return 0;
    });
    
    const MarketSortIcon = ({ col }) => {
      if (marketSortBy !== col) return <span style={{ color: '#333', marginLeft: 4 }}>↕</span>;
      return <span style={{ color: '#00ff88', marginLeft: 4 }}>{marketSortDir === 'asc' ? '↑' : '↓'}</span>;
    };
    
    // Listings would come from indexer - staked NFTs only
    const getListingsForCollection = (contract) => {
      return []; // populated from staking contract events
    };

    // Collection Browser (Landing)
    if (!selectedCollection) {
      return (
        <div style={{ paddingTop: isDesktop ? 40 : 24, paddingBottom: 20 }}>
          <h1 style={{ fontSize: isDesktop ? 36 : 28, fontWeight: 900, letterSpacing: -1, textAlign: 'center', marginBottom: 8 }}>Boost</h1>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: isDesktop ? 32 : 24 }}>Every NFT boosts</div>
          
          {/* View Toggle + Stats */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20
          }}>
            {/* View Toggle */}
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 8,
              padding: 3
            }}>
              <button
                onClick={() => setMarketViewMode('list')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: marketViewMode === 'list' ? '#00ff88' : 'transparent',
                  color: marketViewMode === 'list' ? '#000' : 'rgba(255,255,255,0.5)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >List</button>
              <button
                onClick={() => setMarketViewMode('grid')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: marketViewMode === 'grid' ? '#00ff88' : 'transparent',
                  color: marketViewMode === 'grid' ? '#000' : 'rgba(255,255,255,0.5)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >Collections</button>
            </div>
            
            {/* Stats */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#c084fc' }}>{collections.length}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>collections</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#00ff88' }}>{allListings.length}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>listed</div>
              </div>
            </div>
          </div>

          {/* Terminal List View */}
          {marketViewMode === 'list' && (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              overflow: 'hidden'
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isDesktop ? '50px 120px 60px 1fr 100px 70px' : '45px 1fr 70px 60px',
                padding: '10px 12px',
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
                fontWeight: 600,
                letterSpacing: 0.5,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)'
              }}>
                <div onClick={() => handleMarketSort('boost')} style={{ cursor: 'pointer' }}>
                  BOOST <MarketSortIcon col="boost" />
                </div>
                {isDesktop && <div>COLLECTION</div>}
                {isDesktop && <div onClick={() => handleMarketSort('id')} style={{ cursor: 'pointer' }}>
                  ID <MarketSortIcon col="id" />
                </div>}
                {!isDesktop && <div>ITEM</div>}
                {isDesktop && <div>TRAITS</div>}
                <div onClick={() => handleMarketSort('price')} style={{ cursor: 'pointer' }}>
                  PRICE <MarketSortIcon col="price" />
                </div>
                <div></div>
              </div>

              {/* Rows */}
              {sortedListings.map(listing => (
                <div key={listing.id}>
                  <div 
                    onClick={() => setMarketExpandedRow(marketExpandedRow === listing.id ? null : listing.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isDesktop ? '50px 120px 60px 1fr 100px 70px' : '45px 1fr 70px 60px',
                      padding: '12px',
                      fontSize: 13,
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      background: marketExpandedRow === listing.id ? 'rgba(255,255,255,0.03)' : 'transparent'
                    }}
                  >
                    <div style={{ 
                      color: listing.boost >= 2 ? '#a78bfa' : listing.boost >= 1.5 ? '#60a5fa' : listing.boost >= 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)',
                      fontWeight: 700,
                      fontSize: 12
                    }}>{listing.boost}x</div>
                    
                    {isDesktop ? (
                      <>
                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{listing.emoji}</span>
                          <span style={{ fontSize: 12 }}>{listing.collection}</span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 11 }}>#{listing.tokenId}</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {listing.traits.map((t, i) => (
                            <span key={i} style={{
                              padding: '2px 6px',
                              background: 'rgba(255,255,255,0.06)',
                              borderRadius: 4,
                              fontSize: 10,
                              color: 'rgba(255,255,255,0.5)'
                            }}>{t}</span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{listing.emoji}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{listing.collection}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>#{listing.tokenId}</div>
                        </div>
                      </div>
                    )}
                    
                    <div style={{ color: '#00ff88', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                      {listing.price.toLocaleString()}
                    </div>
                    
                    <div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setBuyModal(listing); }}
                        style={{
                          background: '#00ff88',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#000',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >Buy</button>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {marketExpandedRow === listing.id && (
                    <div style={{
                      display: 'flex',
                      gap: 16,
                      padding: 16,
                      background: 'rgba(0,0,0,0.2)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <div style={{
                        width: isDesktop ? 120 : 80,
                        height: isDesktop ? 120 : 80,
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isDesktop ? 48 : 32
                      }}>{listing.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                          {listing.collection} #{listing.tokenId}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                          Boost: <span style={{ color: listing.boost >= 2 ? '#a78bfa' : '#60a5fa' }}>{listing.boost}x</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {listing.traits.map((t, i) => (
                            <span key={i} style={{
                              padding: '4px 10px',
                              background: 'rgba(255,255,255,0.06)',
                              borderRadius: 6,
                              fontSize: 11,
                              color: 'rgba(255,255,255,0.6)'
                            }}>{t}</span>
                          ))}
                        </div>
                        <button 
                          onClick={() => setBuyModal(listing)}
                          style={{
                            background: '#00ff88',
                            border: 'none',
                            borderRadius: 8,
                            padding: '10px 24px',
                            color: '#000',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >Buy for {listing.price.toLocaleString()} FLR</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Collection Grid View */}
          {marketViewMode === 'grid' && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', 
              gap: isDesktop ? 16 : 12 
            }}>
              {collections.map((col, i) => (
                <div
                  key={col.contract}
                  onClick={() => setSelectedCollection(col)}
                  style={{
                    background: col.staked > 0 ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
                    border: col.staked > 0 ? '1px solid rgba(0,255,136,0.15)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 16,
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24
                    }}>{col.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: 14, 
                        fontWeight: 700, 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis' 
                      }}>{col.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{col.supply.toLocaleString()} items</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Floor</div>
                      <div style={{ fontWeight: 700 }}>{col.floor} FLR</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Listed</div>
                      <div style={{ fontWeight: 700, color: col.staked > 0 ? '#00ff88' : 'rgba(255,255,255,0.3)' }}>{col.staked}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Collection Detail View
    const listings = getListingsForCollection(selectedCollection.contract);
    
    return (
      <div style={{ paddingTop: isDesktop ? 40 : 24, paddingBottom: 20 }}>
        {/* Back + Header */}
        <button
          onClick={() => setSelectedCollection(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          ← All Collections
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32
          }}>{selectedCollection.emoji}</div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{selectedCollection.name}</h1>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              {selectedCollection.supply.toLocaleString()} items • Floor {selectedCollection.floor} FLR • Boost {selectedCollection.boostRange}
            </div>
          </div>
        </div>

        {/* Your NFTs - Show if user has unlisted NFTs from this collection */}
        {(() => {
          // Mock: user has 2 unlisted NFTs from Fox Girls collection
          const userNfts = selectedCollection.name === 'Fox Girls' 
            ? [{ id: 847, rarity: 'Epic', boost: '0.12' }, { id: 2103, rarity: 'Rare', boost: '0.08' }]
            : selectedCollection.name === 'TOADZ'
            ? [{ id: 156, rarity: 'Legendary', boost: '0.18' }]
            : [];
          
          if (userNfts.length === 0) return null;
          
          return (
            <div style={{ marginBottom: 24 }}>
              <div style={{ 
                fontSize: 11, 
                color: 'rgba(255,255,255,0.4)', 
                letterSpacing: 1, 
                marginBottom: 12 
              }}>YOUR NFTS</div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', 
                gap: isDesktop ? 16 : 10 
              }}>
                {userNfts.map((nft) => (
                  <div 
                    key={nft.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(0,255,136,0.2)',
                      borderRadius: 14,
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{
                      aspectRatio: '1',
                      background: 'linear-gradient(165deg, #2a4a3e 0%, #0f1a15 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 40
                    }}>{selectedCollection.emoji}</div>
                    <div style={{ padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>#{nft.id}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
                        {nft.rarity} • +{nft.boost}x
                      </div>
                      <button
                        onClick={() => setListModal({ 
                          id: nft.id, 
                          name: selectedCollection.name, 
                          collection: selectedCollection.name,
                          emoji: selectedCollection.emoji,
                          rarity: nft.rarity,
                          boost: nft.boost
                        })}
                        style={{
                          width: '100%',
                          background: 'rgba(0,255,136,0.15)',
                          border: '1px solid rgba(0,255,136,0.3)',
                          borderRadius: 8,
                          padding: '8px',
                          color: '#00ff88',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >List for Sale</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Empty State */}
        {listings.length === 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 20,
            padding: '48px 24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{selectedCollection.emoji}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No listings yet</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              Stake your {selectedCollection.name} to earn boost + auto-list for sale
            </div>
            <button
              onClick={() => { setActiveTab('vault'); setVaultTab('stake'); setDrillLevel(0); setDrillCategory(null); setDrillCollection(null); }}
              style={{
                background: '#00ff88',
                color: '#000',
                border: 'none',
                borderRadius: 10,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >Stake NFTs</button>
          </div>
        )}

        {/* Listings Grid */}
        {listings.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: isDesktop ? 20 : 12 }}>
            {listings.map((nft, i) => {
              const rarityStyles = {
                Legendary: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', color: '#f59e0b' },
                Epic: { bg: 'rgba(0,255,136,0.12)', border: 'rgba(0,255,136,0.4)', color: '#a855f7' },
                Rare: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)', color: '#3b82f6' },
                Common: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
              };
              const style = rarityStyles[nft.rarity] || rarityStyles.Common;

              return (
                <div 
                  key={i} 
                  onClick={() => setBuyModal(nft)}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                >
                  {/* Image */}
                  <div style={{
                    aspectRatio: '1',
                    background: `url(${nft.image}) center/cover`,
                    backgroundColor: 'rgba(255,255,255,0.05)'
                  }} />

                  {/* Price + Rarity/Boost */}
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{nft.name}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>{nft.price} FLR</div>
                    
                    <div style={{
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: style.color, textTransform: 'uppercase' }}>{nft.rarity}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: style.color, fontFamily: 'monospace' }}>+{nft.boost}x</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030305', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Simple gradient overlay - performant on mobile */}
      <div style={{ 
        position: 'fixed', 
        inset: 0, 
        pointerEvents: 'none', 
        zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(255,100,150,0.05) 0%, transparent 50%)'
      }} />

      {/* Header */}
      <header style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 300, 
        background: 'rgba(3,3,5,0.95)', 
        backdropFilter: 'blur(24px)', 
        borderBottom: '1px solid rgba(255,255,255,0.04)'
      }}>
        <div style={{ 
          maxWidth: isDesktop ? 1000 : 600, 
          margin: '0 auto', 
          padding: isDesktop ? '0 24px' : '0 16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          height: isDesktop ? 68 : 56 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 10 : 8 }}>
            <span style={{ fontWeight: 800, fontSize: isDesktop ? 22 : 18, letterSpacing: -0.5 }}>
              <span style={{ color: '#fff' }}>Toadz</span>
              <span style={{ color: '#00ff88' }}>Stake</span>
            </span>
          </div>

          {/* Desktop Nav */}
          {isDesktop && (
            <nav style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.02)', padding: 5, borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
              <NavTab id="pool" label="Stake" />
              <NavTab id="mint" label="Boost" />
              <NavTab id="vault" label="Lock" />
              <NavTab id="refer" label="Refer" />
            </nav>
          )}

          {/* Connect / PFP */}
          {connected ? (
            <div style={{ position: 'relative', zIndex: 500 }}>
              <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} style={{
                display: 'flex', alignItems: 'center', gap: isDesktop ? 10 : 8,
                background: showProfileDropdown ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: isDesktop ? '7px 14px 7px 7px' : '6px 12px 6px 6px', cursor: 'pointer'
              }}>
                <div style={{
                  width: isDesktop ? 34 : 32, height: isDesktop ? 34 : 32, borderRadius: isDesktop ? 10 : 8,
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}><img src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${user.pfpTokenId}.svg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{formatAddress(walletAddress)}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>▼</span>
              </button>
              {showProfileDropdown && <ProfileDropdown />}
            </div>
          ) : (
            <button onClick={connectWallet} style={{
              background: '#00ff88', 
              color: '#000', border: 'none', borderRadius: 10,
              padding: isDesktop ? '11px 20px' : '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer'
            }}>Connect</button>
          )}
        </div>
      </header>

      {/* Main - responsive padding */}
      <main style={{ 
        maxWidth: isDesktop ? 1000 : 600, 
        margin: '0 auto', 
        padding: isDesktop ? '0 24px 40px 24px' : `0 16px ${isAndroid ? 140 : 100}px 16px`, 
        position: 'relative', 
        zIndex: 1 
      }}>
        {activeTab === 'mint' && (
          <>
            {/* MINT SECTION DISABLED */}
            {/* {isLive ? LiveMintPage() : PreMintPage()} */}
            {/* COMMENTED OUT OLD MARKETPLACE */}
            {/* {MarketplaceSection()} */}
            {/* BOOST MARKET REPLACES OLD MARKETPLACE */}
            {BoostMarketSection()}
            {LpRequiredModal()}
            {BoostListModal()}
            {BoostRentModal()}
            {ListModal()}
            {SyncModal()}
          </>
        )}
        {activeTab === 'vault' && VaultPage()}
        {activeTab === 'pool' && PoolPage()}
        {activeTab === 'refer' && ReferPage()}
        {activeTab === 'admin' && AdminPage()}
      </main>

      {/* Bottom Navigation - Mobile Only */}
      {!isDesktop && <BottomNav />}

      {/* Toast Notifications */}
      <Toast />

      {/* NFT Panel */}
      {showNFTPanel && <div onClick={() => setShowNFTPanel(false)} style={{ 
        position: 'fixed', inset: 0, 
        background: 'rgba(0,0,0,0.7)', 
        backdropFilter: 'blur(4px)',
        zIndex: 350 
      }} />}
      {showNFTPanel && <NFTPanel />}

      {/* Profile Editor Modal */}
      {/* Profile Editor Modal - inline to prevent focus loss */}
      {showProfileEditor && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setShowProfileEditor(false); }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div style={{
            background: 'linear-gradient(180deg, #12121a 0%, #0a0a0f 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 24,
            padding: 24,
            width: '100%',
            maxWidth: 320
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Edit Profile</h3>
              <button 
                onClick={() => setShowProfileEditor(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer' }}
              >×</button>
            </div>
            
            {/* Current PFP Preview */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 18, margin: '0 auto',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,255,136,0.2)'
              }}>
                <img 
                  src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${user.pfpTokenId}.svg`} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              </div>
            </div>
            
            {/* Tadz Selection Grid - 4 columns */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
              marginBottom: 20,
              padding: 12,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 14
            }}>
              {tadzPfpOptions.map((tokenId) => (
                <button
                  key={tokenId}
                  onClick={() => setUserPfp(tokenId)}
                  style={{
                    aspectRatio: '1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    background: 'transparent',
                    border: (userPfp == tokenId || user.pfpTokenId == tokenId) ? '2px solid #00ff88' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <img 
                    src={`https://ipfs.io/ipfs/QmYDFp59fFKneWigoXuphmvdmW2CqoDQxoaDEkS1fGB4zV/${tokenId}.svg`} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                </button>
              ))}
            </div>
            
            {/* Username Input */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>
                DISPLAY NAME (optional)
              </label>
              <input
                type="text"
                value={tempUserName}
                onChange={(e) => setTempUserName(e.target.value.slice(0, 20))}
                placeholder="Enter name..."
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  fontSize: 15,
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 6, textAlign: 'right' }}>
                {tempUserName.length}/20
              </div>
            </div>
            
            {/* Save Button */}
            <button
              onClick={() => {
                setUserName(tempUserName);
                setShowProfileEditor(false);
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                color: '#000',
                border: 'none',
                borderRadius: 14,
                padding: '16px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >Save Changes</button>
          </div>
        </div>
      )}

      {/* Profile Dropdown Overlay */}
      {showProfileDropdown && <div onClick={() => setShowProfileDropdown(false)} style={{ 
        position: 'fixed', inset: 0, 
        background: 'transparent',
        zIndex: 250 
      }} />}

      {/* Sale Notification Toast */}
      {saleNotification && (
        <div style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0a0a0c',
          border: '1px solid rgba(0,255,136,0.3)',
          borderRadius: 16,
          padding: '20px 28px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>NFT SOLD</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{saleNotification.nft}</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#00ff88' }}>+{saleNotification.price} FLR</div>
          <div style={{ fontSize: 12, color: 'rgba(0,200,100,0.7)' }}>+{Math.floor(saleNotification.price * 0.05)} POND bonus</div>
          <button 
            onClick={() => { setSaleNotification(null); setActiveTab('pool'); }}
            style={{
              background: '#00ff88',
              color: '#000',
              border: 'none',
              borderRadius: 10,
              padding: '12px 24px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: 12
            }}
          >Add to LP →</button>
          <button 
            onClick={() => setSaleNotification(null)}
            style={{
              background: 'transparent',
              color: 'rgba(255,255,255,0.4)',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer'
            }}
          >Dismiss</button>
        </div>
      )}

      {/* Buy Modal */}
      {buyModal && (
        <div 
          onClick={() => setBuyModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0c0c0f 0%, #08080a 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: 24,
              maxWidth: 340,
              width: '100%',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            {/* NFT Preview */}
            <div style={{
              aspectRatio: '1',
              background: buyModal.collection === 'Fox Girls' 
                ? 'linear-gradient(165deg, #3d9d8d 0%, #1a5a4a 100%)'
                : buyModal.collection === 'TOADZ'
                ? 'linear-gradient(165deg, #2a6a4e 0%, #0f2a1a 100%)'
                : 'linear-gradient(165deg, #2a2a4e 0%, #0f0f1a 100%)',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              marginBottom: 20
            }}>
              {buyModal.collection === 'Fox Girls' ? '🦊' : buyModal.collection === 'TOADZ' || buyModal.collection === 'Swamp Lords' ? '🐸' : '🖼️'}
            </div>

            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{buyModal.id}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{buyModal.collection}</div>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Price</span>
                <span style={{ fontWeight: 800, fontSize: 18 }}>{buyModal.price} FLR</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Rarity</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{buyModal.rarity} #{buyModal.rank || 112}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Boost</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#00ff88' }}>{buyModal.boost}</span>
              </div>
            </div>

            <button 
              onClick={() => { setBuyModal(null); /* handle purchase */ }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                color: '#000',
                border: 'none',
                borderRadius: 12,
                padding: '16px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 10
              }}
            >Buy for {buyModal.price} FLR</button>

            <button 
              onClick={() => setBuyModal(null)}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '12px',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Restake Modal */}
      {showRestakeModal && (
        <div 
          onClick={() => setShowRestakeModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0c0c0f 0%, #08080a 100%)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 24,
              padding: 28,
              maxWidth: 400,
              width: '100%',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Restake & Keep Earning</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
              Lock your position for another term
            </div>

            {/* Current Value */}
            <div style={{
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 14,
              padding: 18,
              marginBottom: 20
            }}>
              <div style={{ fontSize: 11, color: 'rgba(0,255,136,0.7)', marginBottom: 6 }}>RESTAKING</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#00ff88' }}>
                {user.totalPosition.toLocaleString()} <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>FLR</span>
              </div>
            </div>

            {/* Lock Tier Selection */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>SELECT LOCK PERIOD</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { tier: 0, days: '90d', mult: '1x' },
                  { tier: 1, days: '180d', mult: '2x' },
                  { tier: 2, days: '365d', mult: '4x' }
                ].map(({ tier, days, mult }) => (
                  <button
                    key={tier}
                    onClick={() => setRestakeLockTier(tier)}
                    style={{
                      flex: 1,
                      background: restakeLockTier === tier ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.03)',
                      border: restakeLockTier === tier ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      padding: '14px 8px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: restakeLockTier === tier ? '#fff' : 'rgba(255,255,255,0.5)' }}>{days}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: restakeLockTier === tier ? '#00ff88' : 'rgba(255,255,255,0.3)' }}>{mult}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Bonus Info */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>POND value received</span>
                <span style={{ color: '#00ff88', fontWeight: 600 }}>100%</span>
              </div>
            </div>

            <button 
              onClick={async () => { 
                if (userPosition && userPosition.wflrStaked > 0) {
                  try {
  setLoading(true);
  const tx = await contracts.toadzStake.restake(restakeLockTier, { gasLimit: 500000 });
  await tx.wait();
  await loadUserData(walletAddress, contracts);
} catch (err) {
  console.error('Restake failed:', err);
  showToast('error', 'Restake failed: ' + (err.reason || err.message));
} finally {
  setLoading(false);
}
                }
                setShowRestakeModal(false); 
                setLockExpired(false); 
              }}
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'rgba(0,255,136,0.3)' : 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                color: '#000',
                border: 'none',
                borderRadius: 14,
                padding: '18px',
                fontSize: 16,
                fontWeight: 800,
                cursor: loading ? 'default' : 'pointer',
                marginBottom: 12
              }}
            >{loading ? 'Processing...' : 'Confirm Restake'}</button>

            <button 
              onClick={() => setShowRestakeModal(false)}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div 
          onClick={() => setShowWithdrawModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0c0c0f 0%, #08080a 100%)',
              border: '1px solid rgba(255,100,100,0.15)',
              borderRadius: 24,
              padding: 28,
              maxWidth: 400,
              width: '100%',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Withdraw Position</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
              Exit the pool and receive your FLR
            </div>

            {/* What you receive */}
            <div style={{
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 14,
              padding: 18,
              marginBottom: 16
            }}>
              <div style={{ fontSize: 11, color: 'rgba(0,255,136,0.7)', marginBottom: 6 }}>YOU RECEIVE IMMEDIATELY</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#00ff88' }}>
                {user.totalPosition.toLocaleString()} <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>FLR</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                Principal + all earnings
              </div>
            </div>

            {/* POND Redemption */}
            <div style={{
              background: 'rgba(255,170,100,0.06)',
              border: '1px solid rgba(255,170,100,0.15)',
              borderRadius: 14,
              padding: 18,
              marginBottom: 20
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,170,100,0.9)', marginBottom: 10 }}>POND REDEMPTION (50% HAIRCUT)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Your POND balance</span>
                <span>{user.pondBalance.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Redeemable value</span>
                <span style={{ color: '#ffaa77' }}>{(user.pondBalance / 2).toLocaleString()} FLR</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Drip period</span>
                <span>~3-6 months</span>
              </div>
            </div>

            {/* Warning */}
            <div style={{
              background: 'rgba(255,80,80,0.08)',
              border: '1px solid rgba(255,80,80,0.2)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              fontSize: 12,
              color: 'rgba(255,100,100,0.9)'
            }}>
              ⚠ You lose your pool share and future earnings. This cannot be undone.
            </div>

            <button 
              onClick={() => handleWithdraw()}
              disabled={loading}
              style={{
                width: '100%',
                background: 'rgba(255,100,100,0.15)',
                color: '#ff6b6b',
                border: '1px solid rgba(255,100,100,0.3)',
                borderRadius: 14,
                padding: '18px',
                fontSize: 16,
                fontWeight: 800,
                cursor: loading ? 'default' : 'pointer',
                marginBottom: 12,
                opacity: loading ? 0.5 : 1
              }}
            >{loading ? 'Processing...' : 'Confirm Withdrawal'}</button>

            <button 
              onClick={() => setShowWithdrawModal(false)}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Stake NFT Modal */}
      {stakeNftModal && (
        <div 
          onClick={() => setStakeNftModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0c0c0f 0%, #08080a 100%)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 24,
              padding: 28,
              maxWidth: 400,
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48,
                background: stakeNftModal.type === 'og' 
                  ? 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))'
                  : 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,255,136,0.05))',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24
              }}>
                {stakeNftModal.type === 'og' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                ) : stakeNftModal.collection.emoji}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{stakeNftModal.type === 'og' ? 'Lock' : 'Stake'} {stakeNftModal.collection.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {(stakeNftModal.collection.availableTokenIds || []).length} available
                </div>
              </div>
            </div>

            {/* Select All button */}
            {(stakeNftModal.collection.availableTokenIds || []).length > 1 && (
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <button
                  onClick={() => {
                    const allNfts = (stakeNftModal.collection.availableTokenIds || []).map(nftItem => {
                      const isMulti = stakeNftModal.isMultiCollection;
                      const tokenId = isMulti ? nftItem.tokenId : nftItem;
                      const collectionAddr = isMulti ? nftItem.collection : stakeNftModal.collection.address;
                      return { tokenId, collection: collectionAddr };
                    });
                    setSelectedNfts(selectedNfts.length === allNfts.length ? [] : allNfts);
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  {selectedNfts.length === (stakeNftModal.collection.availableTokenIds || []).length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            )}

            {/* NFT Grid - actual NFTs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 20,
              maxHeight: 300,
              overflowY: 'auto'
            }}>
              {(stakeNftModal.collection.availableTokenIds || []).length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 10 }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                    Enter token ID manually:
                  </div>
                  <input
                    type="number"
                    placeholder="Token ID"
                    value={selectedNfts[0]?.tokenId || selectedNfts[0] || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) {
                        setSelectedNfts([{ tokenId: val, collection: stakeNftModal.collection.address }]);
                      } else {
                        setSelectedNfts([]);
                      }
                    }}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '12px',
                      color: '#fff',
                      fontSize: 16,
                      textAlign: 'center'
                    }}
                  />
                </div>
              ) : (stakeNftModal.collection.availableTokenIds || []).slice(0, 20).map((nftItem) => {
                // Handle both multi-collection (object) and single-collection (number) formats
                const isMulti = stakeNftModal.isMultiCollection;
                const tokenId = isMulti ? nftItem.tokenId : nftItem;
                const collectionAddr = isMulti ? nftItem.collection : stakeNftModal.collection.address;
                const nftKey = `${collectionAddr}-${tokenId}`;
                const isSelected = selectedNfts.some(s => 
                  (s.tokenId === tokenId && s.collection === collectionAddr) || s === tokenId
                );
                
                // Get image URL based on collection
                const imageUrlMap = {
                  '0x35afb6ba51839dedd33140a3b704b39933d1e642': (id) => `https://ipfs.io/ipfs/QmP45Rfhy75RybFuLcwd1CR9vF6qznw95qQPxcA5TeBNYk/${id}.png`,
                  '0x91aa85a172dd3e7eea4ad1a4b33e90cbf3b99ed8': () => `https://ipfs.io/ipfs/QmZ42mWPA3xihoQxnm7ufKh51n5fhJe7hwfN7VPfy4cZcg`,
                  '0x360f8b7d9530f55ab8e52394e6527935635f51e7': () => `https://ipfs.io/ipfs/QmY5ZwdLP4z2PBXmRgh3djcDYzWvMuizyqfTDhPnXErgBm`,
                };
                const getImage = imageUrlMap[collectionAddr?.toLowerCase()];
                const imageUrl = getImage ? getImage(tokenId) : null;
                
                return (
                <div 
                  key={nftKey} 
                  onClick={() => {
                    if (isSelected) {
                      setSelectedNfts(selectedNfts.filter(s => 
                        !((s.tokenId === tokenId && s.collection === collectionAddr) || s === tokenId)
                      ));
                    } else {
                      setSelectedNfts([...selectedNfts, { tokenId, collection: collectionAddr }]);
                    }
                  }}
                  style={{
                  aspectRatio: '1',
                  background: isSelected ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isSelected ? '2px solid #00ff88' : '2px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {imageUrl ? (
                    <img src={imageUrl} alt={`#${tokenId}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    isMulti ? nftItem.emoji : stakeNftModal.collection.emoji
                  )}
                  <div style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                    padding: '16px 4px 4px',
                    fontSize: 10, 
                    color: 'rgba(255,255,255,0.8)', 
                    textAlign: 'center'
                  }}>#{tokenId}</div>
                  {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 18,
                    height: 18,
                    background: '#00ff88',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: '#000',
                    fontWeight: 700
                  }}>✓</div>
                  )}
                </div>
              )})}
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              fontSize: 12,
              color: 'rgba(255,255,255,0.5)'
            }}>
              {stakeNftModal.type === 'og' 
                ? 'Locked NFTs earn you discounts, free mints, and new Toadz NFT airdrops.'
                : 'Staked NFTs boost your LP earnings based on their rarity.'}
            </div>

            <button 
              onClick={async () => {
                if (selectedNfts.length > 0) {
                  for (const nft of selectedNfts) {
                    // Handle both object format {tokenId, collection} and number format
                    const tokenId = typeof nft === 'object' ? nft.tokenId : nft;
                    const collection = typeof nft === 'object' ? nft.collection : stakeNftModal.collection.address;
                    
                    if (stakeNftModal.type === 'og') {
                      await handleLockOG(collection, tokenId);
                    } else {
                      await handleStakeNFT(collection, tokenId);
                    }
                  }
                }
                setSelectedNfts([]);
                setStakeNftModal(null);
              }}
              disabled={loading || selectedNfts.length === 0}
              style={{
                width: '100%',
                background: selectedNfts.length > 0 && !loading
                  ? (stakeNftModal.type === 'og' 
                    ? 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)'
                    : 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)')
                  : 'rgba(255,255,255,0.1)',
                color: selectedNfts.length > 0 && !loading 
                  ? (stakeNftModal.type === 'og' ? '#fff' : '#000')
                  : 'rgba(255,255,255,0.3)',
                border: 'none',
                borderRadius: 14,
                padding: '18px',
                fontSize: 16,
                fontWeight: 800,
                cursor: selectedNfts.length > 0 && !loading ? 'pointer' : 'default',
                marginBottom: 12
              }}
            >{loading ? 'Processing...' : `${stakeNftModal.type === 'og' ? 'Lock' : 'Stake'} ${selectedNfts.length > 0 ? selectedNfts.length : ''} Selected`}</button>

            <button 
              onClick={() => setStakeNftModal(null)}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Unstake NFT Modal */}
      {unstakeNftModal && (
        <div 
          onClick={() => setUnstakeNftModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0c0c0f 0%, #08080a 100%)',
              border: '1px solid rgba(255,170,100,0.15)',
              borderRadius: 24,
              padding: 28,
              maxWidth: 400,
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48,
                background: 'linear-gradient(135deg, rgba(255,170,100,0.2), rgba(255,170,100,0.05))',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24
              }}>{unstakeNftModal.emoji}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Unstake {unstakeNftModal.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {unstakeNftModal.staked} currently staked
                </div>
              </div>
            </div>

            {/* Warning */}
            <div style={{
              background: 'rgba(255,170,100,0.08)',
              border: '1px solid rgba(255,170,100,0.2)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              fontSize: 12,
              color: 'rgba(255,170,100,0.9)'
            }}>
              ⚠ Unstaking will reduce your boost and LP earnings
            </div>

            {/* NFT Grid - mock staked NFTs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 20
            }}>
              {[1,2,3].map((n) => {
                const isSelected = selectedNfts.includes(n);
                return (
                <div 
                  key={n} 
                  onClick={() => {
                    if (isSelected) {
                      setSelectedNfts(selectedNfts.filter(x => x !== n));
                    } else {
                      setSelectedNfts([...selectedNfts, n]);
                    }
                  }}
                  style={{
                  aspectRatio: '1',
                  background: isSelected ? 'rgba(255,170,100,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isSelected ? '2px solid #ffaa77' : '2px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  cursor: 'pointer'
                }}>
                  {unstakeNftModal.emoji}
                </div>
              )})}
            </div>

            <button 
              onClick={async () => {
                if (selectedNfts.length > 0 && unstakeNftModal.address) {
                  for (const tokenId of selectedNfts) {
                    await handleUnstakeNFT(unstakeNftModal.address, tokenId);
                  }
                }
                setSelectedNfts([]);
                setUnstakeNftModal(null);
              }}
              disabled={loading || selectedNfts.length === 0}
              style={{
                width: '100%',
                background: selectedNfts.length > 0 && !loading ? 'rgba(255,170,100,0.15)' : 'rgba(255,255,255,0.05)',
                color: selectedNfts.length > 0 && !loading ? '#ffaa77' : 'rgba(255,255,255,0.3)',
                border: selectedNfts.length > 0 ? '1px solid rgba(255,170,100,0.3)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14,
                padding: '18px',
                fontSize: 16,
                fontWeight: 800,
                cursor: selectedNfts.length > 0 && !loading ? 'pointer' : 'default',
                marginBottom: 12
              }}
            >{loading ? 'Processing...' : `Unstake ${selectedNfts.length > 0 ? selectedNfts.length : ''} Selected`}</button>

            <button 
              onClick={() => setUnstakeNftModal(null)}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* List NFT Modal */}
      {listModal && (
        <div 
          onClick={() => setListModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0c0c0f 0%, #08080a 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              padding: 28,
              maxWidth: 380,
              width: '100%',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            {/* NFT Preview */}
            <div style={{
              aspectRatio: '1',
              background: 'linear-gradient(165deg, #2a4a3e 0%, #0f1a15 100%)',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              marginBottom: 20
            }}>
              {listModal.emoji || '🖼️'}
            </div>

            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{listModal.name} #{listModal.id}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>{listModal.collection}</div>

            {/* Price Input */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>LIST PRICE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number"
                  placeholder="0"
                  style={{
                    flex: 1,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#fff',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>FLR</span>
              </div>
            </div>

            {/* Fee Info */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Marketplace fee</span>
                <span>5%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>You receive</span>
                <span style={{ color: '#00ff88', fontWeight: 600 }}>95%</span>
              </div>
            </div>

            <button 
              onClick={() => setListModal(null)}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                color: '#000',
                border: 'none',
                borderRadius: 14,
                padding: '18px',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                marginBottom: 12
              }}
            >List for Sale</button>

            <button 
              onClick={() => setListModal(null)}
              style={{
                width: '100%',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* NFT Detail Modal - shows animated version + metadata */}
      {nftDetailModal && (
        <div 
          onClick={() => { setNftDetailModal(null); setNftMetadata(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            backdropFilter: 'blur(16px)',
            zIndex: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isDesktop ? 40 : 12
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #111 0%, #0a0a0c 100%)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              maxWidth: isDesktop ? 420 : '100%',
              width: '100%',
              maxHeight: '92vh',
              overflow: 'auto',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            {/* Close X */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0 0' }}>
              <button 
                onClick={() => { setNftDetailModal(null); setNftMetadata(null); }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: 18
                }}
              >×</button>
            </div>

            {/* Animated Image */}
            <div style={{
              aspectRatio: '1',
              margin: '0 16px',
              borderRadius: 16,
              overflow: 'hidden',
              background: nftMetadata?.attributes?.find(a => a.trait_type === 'Background')?.value?.includes('Red') ? '#e74c3c' :
                nftMetadata?.attributes?.find(a => a.trait_type === 'Background')?.value?.includes('Blue') ? '#3498db' :
                nftMetadata?.attributes?.find(a => a.trait_type === 'Background')?.value?.includes('Green') ? '#27ae60' :
                'linear-gradient(165deg, #2a3a32 0%, #1a2520 100%)'
            }}>
              <img 
                src={nftDetailModal.animatedUrl || nftDetailModal.image} 
                alt={`Tadz #${nftDetailModal.tokenId}`}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(e) => { e.target.src = nftDetailModal.image; }}
              />
            </div>

            {/* Info Section */}
            <div style={{ padding: 16 }}>
              {/* Title Row */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 16
              }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {nftMetadata?.name || `Tadz #${nftDetailModal.tokenId}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {nftDetailModal.owner ? `${nftDetailModal.owner.slice(0,6)}...${nftDetailModal.owner.slice(-4)}` : 'Tadz Collection'}
                  </div>
                </div>
                
                {/* Rank Badge */}
                {(nftMetadata?.attributes?.find(a => a.trait_type === 'Rank')?.value || nftDetailModal.rank) && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(255,215,0,0.15) 0%, rgba(255,180,0,0.08) 100%)',
                    border: '1px solid rgba(255,215,0,0.3)',
                    borderRadius: 10,
                    padding: '6px 12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,215,0,0.7)', letterSpacing: 0.5 }}>RANK</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#ffd700' }}>
                      #{(nftMetadata?.attributes?.find(a => a.trait_type === 'Rank')?.value || nftDetailModal.rank).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Traits Grid */}
              {fetchingMetadata ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  Loading traits...
                </div>
              ) : nftMetadata?.attributes ? (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: 8,
                  marginBottom: 16
                }}>
                  {nftMetadata.attributes.filter(t => t.trait_type !== 'Rank').map((trait, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      padding: '10px 8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {trait.trait_type}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{trait.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Description */}
              {nftMetadata?.description && (
                <div style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.5)',
                  lineHeight: 1.5,
                  padding: '12px 0',
                  borderTop: '1px solid rgba(255,255,255,0.06)'
                }}>
                  {nftMetadata.description}
                </div>
              )}

              {/* List Buttons - show if user owns this NFT and not listed */}
              {walletAddress && nftDetailModal.owner?.toLowerCase() === walletAddress.toLowerCase() && (
                (() => {
                  const isListed = flareListings.some(l => 
                    l.collection.toLowerCase() === nftDetailModal.collection?.toLowerCase() && 
                    l.tokenId === nftDetailModal.tokenId?.toString()
                  );
                  if (isListed) return null;
                  return (
                    <div style={{ 
                      display: 'flex', 
                      gap: 10, 
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <button
                        onClick={() => {
                          setNftDetailModal(null);
                          setSelectedBoostNft({ 
                            address: nftDetailModal.collection, 
                            tokenId: nftDetailModal.tokenId 
                          });
                          setBoostListType('sell');
                          setBoostListStep(3);
                          setShowBoostListModal(true);
                        }}
                        style={{
                          flex: 1,
                          background: 'rgba(0,212,255,0.15)',
                          border: '1px solid rgba(0,212,255,0.3)',
                          borderRadius: 10,
                          padding: '12px',
                          color: '#00d4ff',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >List for Sale</button>
                      <button
                        onClick={() => {
                          setNftDetailModal(null);
                          setSelectedBoostNft({ 
                            address: nftDetailModal.collection, 
                            tokenId: nftDetailModal.tokenId 
                          });
                          setBoostListType('rent');
                          setBoostListStep(3);
                          setShowBoostListModal(true);
                        }}
                        style={{
                          flex: 1,
                          background: 'rgba(0,255,136,0.15)',
                          border: '1px solid rgba(0,255,136,0.3)',
                          borderRadius: 10,
                          padding: '12px',
                          color: '#00ff88',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >List for Rent</button>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lock Info Modal */}
      {lockInfoModal && (
        <div 
          onClick={() => setLockInfoModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#12131a',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 360,
              width: '100%'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                {lockInfoModal === 'toadz' && '3D Toadz Airdrop'}
                {lockInfoModal === 'discount' && 'Mint Discount Tiers'}
                {lockInfoModal === 'rental' && 'Rental Boost'}
              </span>
              <button 
                onClick={() => setLockInfoModal(null)}
                style={{
                  width: 28,
                  height: 28,
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  borderRadius: 6,
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: 16
                }}
              >&times;</button>
            </div>
            
            {/* Toadz Content */}
            {lockInfoModal === 'toadz' && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                  Receive 1 free 3D Toadz NFT for every 3 OGs you lock.
                </div>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Your allocation</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#a855f7' }}>{Math.floor(ogNftData.totalLocked / 3)}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>Lock more to earn more</div>
                </div>
              </>
            )}
            
            {/* Discount Content */}
            {lockInfoModal === 'discount' && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                  Lock more OGs to unlock higher discounts on future mints.
                </div>
                <div>
                  {[
                    { count: 10, discount: 5 },
                    { count: 25, discount: 10 },
                    { count: 50, discount: 15 },
                    { count: 100, discount: 25 },
                    { count: 500, discount: 50 },
                    { count: 3000, discount: 70 }
                  ].map((tier, i, arr) => {
                    const isActive = ogNftData.totalLocked >= tier.count && (i === arr.length - 1 || ogNftData.totalLocked < arr[i + 1].count);
                    const isLocked = ogNftData.totalLocked < tier.count;
                    return (
                      <div 
                        key={tier.count}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: isActive ? '10px 12px' : '10px 0',
                          borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          fontSize: 13,
                          background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
                          margin: isActive ? '0 -12px' : 0,
                          borderRadius: isActive ? 6 : 0,
                          opacity: isLocked && !isActive ? 0.4 : 1
                        }}
                      >
                        <span style={{ color: isActive ? '#3b82f6' : 'rgba(255,255,255,0.5)', fontWeight: isActive ? 600 : 400 }}>{tier.count} locked</span>
                        <span style={{ color: isActive ? '#3b82f6' : 'rgba(255,255,255,0.7)', fontWeight: isActive ? 700 : 600 }}>{tier.discount}% off</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                  {ogNftData.totalLocked < 10 ? `You have ${ogNftData.totalLocked} locked. Lock ${10 - ogNftData.totalLocked} more for first tier.` :
                   ogNftData.totalLocked < 25 ? `You have ${ogNftData.totalLocked} locked. Lock ${25 - ogNftData.totalLocked} more for next tier.` :
                   ogNftData.totalLocked < 50 ? `You have ${ogNftData.totalLocked} locked. Lock ${50 - ogNftData.totalLocked} more for next tier.` :
                   ogNftData.totalLocked < 100 ? `You have ${ogNftData.totalLocked} locked. Lock ${100 - ogNftData.totalLocked} more for next tier.` :
                   ogNftData.totalLocked < 500 ? `You have ${ogNftData.totalLocked} locked. Lock ${500 - ogNftData.totalLocked} more for next tier.` :
                   ogNftData.totalLocked < 3000 ? `You have ${ogNftData.totalLocked} locked. Lock ${3000 - ogNftData.totalLocked} more for max tier.` :
                   `You have ${ogNftData.totalLocked} locked. Max discount unlocked!`}
                </div>
              </>
            )}
            
            {/* Rental Content */}
            {lockInfoModal === 'rental' && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                  Enhanced rental income for OG lockers.
                </div>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Details coming soon</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(0,255,136,0.4), 0 0 60px rgba(0,255,136,0.2); }
          50% { box-shadow: 0 0 30px rgba(0,255,136,0.6), 0 0 80px rgba(0,255,136,0.3); }
        }
        input::placeholder { color: rgba(255,255,255,0.3); }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00ff88;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00ff88;
          cursor: pointer;
          border: none;
        }
        input[type="range"].pink-slider::-webkit-slider-thumb {
          background: #ec4899;
        }
        input[type="range"].pink-slider::-moz-range-thumb {
          background: #ec4899;
        }
        button { transition: all 150ms ease; }
        button:active { transform: scale(0.97); }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
};

export default ToadzFinal;

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ToadzMarketV5
 * @notice NFT marketplace with LP-based rental payments
 * @dev V5: Rental payments deducted daily from renter's staked LP position
 *      - No upfront payment for rentals
 *      - Daily rate deducted from renter's wflrStaked
 *      - Payment transferred to owner's wflrStaked
 *      - User can rent multiple NFTs simultaneously
 *      - User can list for rent while renting others
 */
contract ToadzMarketV5 is 
    Initializable, 
    ReentrancyGuardUpgradeable, 
    PausableUpgradeable,
    OwnableUpgradeable 
{
    uint256 public constant FEE_BPS = 500; // 5%
    uint256 public constant BPS = 10000;
    
    // ============ V1/V2 Storage (DO NOT MODIFY ORDER) ============
    
    struct Listing {
        address seller;
        uint256 price;
        uint256 dailyRate;      // DEPRECATED in V5 for sales
        uint256 commitmentDays;
        uint256 listedAt;
    }
    
    mapping(address => mapping(uint256 => Listing)) public listings;
    mapping(address => bool) public whitelisted;
    address public feeRecipient;
    mapping(address => uint256) public userListingCount;
    
    address public boostRegistry;
    
    struct ListingKey {
        address collection;
        uint256 tokenId;
    }
    ListingKey[] public activeListingKeys;
    mapping(address => mapping(uint256 => uint256)) public listingIndex;
    
    // ============ V3 Storage ============
    
    struct RentalListing {
        address owner;
        uint256 dailyRate;
        uint256 commitmentEnd;
        bool isActive;
    }
    
    struct ActiveRental {
        address renter;
        uint256 startTime;
        uint256 endTime;
        uint256 dailyRate;
        uint256 lastProcessed;
    }
    
    mapping(address => mapping(uint256 => RentalListing)) public rentalListings;
    mapping(address => mapping(uint256 => ActiveRental)) public activeRentals;
    mapping(address => uint256) public userRentalListingCount;
    
    struct RentalKey {
        address collection;
        uint256 tokenId;
    }
    RentalKey[] public activeRentalKeys;
    mapping(address => mapping(uint256 => uint256)) public rentalKeyIndex;
    
    address public toadzStake;
    bool public testMode;
    
    // ============ V4 Storage ============
    
    RentalKey[] public activeRentalListingKeys;
    mapping(address => mapping(uint256 => uint256)) public rentalListingIndex;
    
    // ============ V5 Storage ============
    
    // Track how many NFTs each user is currently renting
    mapping(address => uint256) public userActiveRentalCount;
    
    // Minimum LP required to rent (prevent dust rentals)
    uint256 public minLPForRental;
    
    // ============ Events ============
    
    event Listed(address indexed collection, uint256 indexed tokenId, address indexed seller, uint256 price);
    event Sold(address indexed collection, uint256 indexed tokenId, address indexed buyer, address seller, uint256 price);
    event Cancelled(address indexed collection, uint256 indexed tokenId, address indexed seller);
    event CollectionWhitelisted(address indexed collection, bool status);
    event ListingCountChanged(address indexed user, uint256 newCount);
    
    event RentalListed(address indexed collection, uint256 indexed tokenId, address indexed owner, uint256 dailyRate, uint256 commitmentDays);
    event RentalStarted(address indexed collection, uint256 indexed tokenId, address indexed renter, uint256 rentalDays);
    event RentalEnded(address indexed collection, uint256 indexed tokenId, address indexed renter, uint256 reason); // reason: 0=manual, 1=expired, 2=insufficient LP
    event RentProcessed(address indexed collection, uint256 indexed tokenId, address indexed owner, address renter, uint256 amount);
    event RentalListingCancelled(address indexed collection, uint256 indexed tokenId, address indexed owner);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address _feeRecipient) public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();
        __Ownable_init();
        feeRecipient = _feeRecipient;
    }
    
    // ============ Time Helpers ============
    
    function _daysToSeconds(uint256 days_) internal view returns (uint256) {
        return testMode ? days_ * 1 minutes : days_ * 1 days;
    }
    
    function _secondsToDays(uint256 secs) internal view returns (uint256) {
        return testMode ? secs / 1 minutes : secs / 1 days;
    }
    
    // ============ Internal Helpers ============
    
    function _addToActiveListings(address collection, uint256 tokenId) internal {
        activeListingKeys.push(ListingKey(collection, tokenId));
        listingIndex[collection][tokenId] = activeListingKeys.length;
    }
    
    function _removeFromActiveListings(address collection, uint256 tokenId) internal {
        uint256 indexPlusOne = listingIndex[collection][tokenId];
        if (indexPlusOne == 0) return;
        
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = activeListingKeys.length - 1;
        
        if (index != lastIndex) {
            ListingKey memory lastKey = activeListingKeys[lastIndex];
            activeListingKeys[index] = lastKey;
            listingIndex[lastKey.collection][lastKey.tokenId] = indexPlusOne;
        }
        
        activeListingKeys.pop();
        listingIndex[collection][tokenId] = 0;
    }
    
    function _addToActiveRentals(address collection, uint256 tokenId) internal {
        activeRentalKeys.push(RentalKey(collection, tokenId));
        rentalKeyIndex[collection][tokenId] = activeRentalKeys.length;
    }
    
    function _removeFromActiveRentals(address collection, uint256 tokenId) internal {
        uint256 indexPlusOne = rentalKeyIndex[collection][tokenId];
        if (indexPlusOne == 0) return;
        
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = activeRentalKeys.length - 1;
        
        if (index != lastIndex) {
            RentalKey memory lastKey = activeRentalKeys[lastIndex];
            activeRentalKeys[index] = lastKey;
            rentalKeyIndex[lastKey.collection][lastKey.tokenId] = indexPlusOne;
        }
        
        activeRentalKeys.pop();
        rentalKeyIndex[collection][tokenId] = 0;
    }
    
    function _addToActiveRentalListings(address collection, uint256 tokenId) internal {
        activeRentalListingKeys.push(RentalKey(collection, tokenId));
        rentalListingIndex[collection][tokenId] = activeRentalListingKeys.length;
    }
    
    function _removeFromActiveRentalListings(address collection, uint256 tokenId) internal {
        uint256 indexPlusOne = rentalListingIndex[collection][tokenId];
        if (indexPlusOne == 0) return;
        
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = activeRentalListingKeys.length - 1;
        
        if (index != lastIndex) {
            RentalKey memory lastKey = activeRentalListingKeys[lastIndex];
            activeRentalListingKeys[index] = lastKey;
            rentalListingIndex[lastKey.collection][lastKey.tokenId] = indexPlusOne;
        }
        
        activeRentalListingKeys.pop();
        rentalListingIndex[collection][tokenId] = 0;
    }
    
    function _syncBoostRegistry(address user) internal {
        if (boostRegistry != address(0)) {
            uint256 totalCount = userListingCount[user] + userRentalListingCount[user];
            try IBoostRegistry(boostRegistry).setListingCount(user, totalCount) {} catch {}
        }
    }
    
    // ============ Sale Functions ============
    
    function list(address collection, uint256 tokenId, uint256 price, uint256 commitmentDays) external nonReentrant whenNotPaused {
        require(whitelisted[collection], "Collection not whitelisted");
        require(price > 0, "Price must be > 0");
        require(listings[collection][tokenId].seller == address(0), "Already listed");
        require(commitmentDays >= 7, "Min 7 days commitment");
        require(!rentalListings[collection][tokenId].isActive, "Listed for rent");
        
        IERC721Upgradeable nft = IERC721Upgradeable(collection);
        require(nft.ownerOf(tokenId) == msg.sender, "Not owner");
        require(
            nft.isApprovedForAll(msg.sender, address(this)) || 
            nft.getApproved(tokenId) == address(this),
            "Not approved"
        );
        
        listings[collection][tokenId] = Listing({
            seller: msg.sender,
            price: price,
            dailyRate: 0,  // Not used for sales in V5
            commitmentDays: commitmentDays,
            listedAt: block.timestamp
        });
        
        _addToActiveListings(collection, tokenId);
        userListingCount[msg.sender]++;
        _syncBoostRegistry(msg.sender);
        
        emit Listed(collection, tokenId, msg.sender, price);
    }
    
    function cancel(address collection, uint256 tokenId) external nonReentrant whenNotPaused {
        Listing storage listing = listings[collection][tokenId];
        require(listing.seller == msg.sender, "Not seller");
        
        uint256 minListingTime = _daysToSeconds(listing.commitmentDays);
        require(block.timestamp >= listing.listedAt + minListingTime, "Commitment period");
        
        _removeFromActiveListings(collection, tokenId);
        delete listings[collection][tokenId];
        userListingCount[msg.sender]--;
        _syncBoostRegistry(msg.sender);
        
        emit Cancelled(collection, tokenId, msg.sender);
    }
    
    function buy(address collection, uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory listing = listings[collection][tokenId];
        require(listing.seller != address(0), "Not listed");
        require(msg.value >= listing.price, "Insufficient payment");
        
        _removeFromActiveListings(collection, tokenId);
        delete listings[collection][tokenId];
        userListingCount[listing.seller]--;
        _syncBoostRegistry(listing.seller);
        
        IERC721Upgradeable(collection).safeTransferFrom(listing.seller, msg.sender, tokenId);
        
        uint256 fee = (listing.price * FEE_BPS) / BPS;
        uint256 sellerAmount = listing.price - fee;
        
        payable(listing.seller).transfer(sellerAmount);
        payable(feeRecipient).transfer(fee);
        
        if (msg.value > listing.price) {
            payable(msg.sender).transfer(msg.value - listing.price);
        }
        
        emit Sold(collection, tokenId, msg.sender, listing.seller, listing.price);
    }
    
    // ============ Rental Functions (V5: LP-based) ============
    
    function listForRent(address collection, uint256 tokenId, uint256 dailyRate, uint256 commitmentDays) external nonReentrant whenNotPaused {
        require(whitelisted[collection], "Collection not whitelisted");
        require(dailyRate > 0, "Daily rate must be > 0");
        require(commitmentDays >= 7, "Min 7 days commitment");
        require(!rentalListings[collection][tokenId].isActive, "Already listed for rent");
        require(listings[collection][tokenId].seller == address(0), "Listed for sale");
        
        IERC721Upgradeable nft = IERC721Upgradeable(collection);
        require(nft.ownerOf(tokenId) == msg.sender, "Not owner");
        require(
            nft.isApprovedForAll(msg.sender, address(this)) || 
            nft.getApproved(tokenId) == address(this),
            "Not approved"
        );
        
        // Owner must have active stake position to receive LP payments
        require(IToadzStake(toadzStake).hasActivePosition(msg.sender), "Owner needs stake position");
        
        rentalListings[collection][tokenId] = RentalListing({
            owner: msg.sender,
            dailyRate: dailyRate,
            commitmentEnd: block.timestamp + _daysToSeconds(commitmentDays),
            isActive: true
        });
        
        _addToActiveRentalListings(collection, tokenId);
        userRentalListingCount[msg.sender]++;
        _syncBoostRegistry(msg.sender);
        
        emit RentalListed(collection, tokenId, msg.sender, dailyRate, commitmentDays);
    }
    
    /**
     * @notice Rent an NFT - NO upfront payment
     * @dev Daily rate will be deducted from renter's staked LP position
     * @param collection NFT collection address
     * @param tokenId Token ID to rent
     * @param rentalDays Number of days to rent
     */
    function rent(address collection, uint256 tokenId, uint256 rentalDays) external nonReentrant whenNotPaused {
        RentalListing storage listing = rentalListings[collection][tokenId];
        require(listing.isActive, "Not listed for rent");
        require(rentalDays >= 1, "Min 1 day rental");
        
        ActiveRental storage existingRental = activeRentals[collection][tokenId];
        require(existingRental.renter == address(0) || block.timestamp >= existingRental.endTime, "Already rented");
        
        // Renter must have active stake position with enough LP
        require(IToadzStake(toadzStake).hasActivePosition(msg.sender), "Renter needs stake position");
        
        (uint256 renterLP,,,,,) = IToadzStake(toadzStake).positions(msg.sender);
        uint256 totalCost = listing.dailyRate * rentalDays;
        require(renterLP >= totalCost, "Insufficient staked LP for rental");
        
        if (minLPForRental > 0) {
            require(renterLP >= minLPForRental, "Below min LP for rental");
        }
        
        // Clean up expired rental if exists
        if (existingRental.renter != address(0)) {
            _processRentalPayment(collection, tokenId);
            userActiveRentalCount[existingRental.renter]--;
            delete activeRentals[collection][tokenId];
            _removeFromActiveRentals(collection, tokenId);
        }
        
        // Create new rental - NO upfront payment
        activeRentals[collection][tokenId] = ActiveRental({
            renter: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + _daysToSeconds(rentalDays),
            dailyRate: listing.dailyRate,
            lastProcessed: block.timestamp
        });
        
        _addToActiveRentals(collection, tokenId);
        userActiveRentalCount[msg.sender]++;
        
        emit RentalStarted(collection, tokenId, msg.sender, rentalDays);
    }
    
    /**
     * @notice Process rental payment - deducts LP from renter, credits to owner
     * @dev Called internally or can be triggered externally
     */
    function _processRentalPayment(address collection, uint256 tokenId) internal returns (bool ended) {
        ActiveRental storage rental = activeRentals[collection][tokenId];
        if (rental.renter == address(0)) return false;
        
        RentalListing storage listing = rentalListings[collection][tokenId];
        
        uint256 processUntil = block.timestamp > rental.endTime ? rental.endTime : block.timestamp;
        if (processUntil <= rental.lastProcessed) return false;
        
        uint256 daysElapsed = _secondsToDays(processUntil - rental.lastProcessed);
        if (daysElapsed == 0) return false;
        
        uint256 paymentAmount = daysElapsed * rental.dailyRate;
        
        // Check renter has enough LP
        (uint256 renterLP,,,,,) = IToadzStake(toadzStake).positions(rental.renter);
        
        if (renterLP < paymentAmount) {
            // Insufficient LP - end rental early
            // Process whatever they can afford
            uint256 affordableDays = renterLP / rental.dailyRate;
            if (affordableDays > 0) {
                paymentAmount = affordableDays * rental.dailyRate;
                _transferRentalPayment(rental.renter, listing.owner, paymentAmount);
            }
            return true; // Signal to end rental
        }
        
        // Transfer LP: renter -> owner (minus fee to feeRecipient position)
        _transferRentalPayment(rental.renter, listing.owner, paymentAmount);
        
        rental.lastProcessed = processUntil;
        
        emit RentProcessed(collection, tokenId, listing.owner, rental.renter, paymentAmount);
        
        return false;
    }
    
    function _transferRentalPayment(address from, address to, uint256 amount) internal {
        if (amount == 0) return;
        
        uint256 fee = (amount * FEE_BPS) / BPS;
        uint256 ownerAmount = amount - fee;
        
        // Transfer to owner
        IToadzStake(toadzStake).transferLP(from, to, ownerAmount);
        
        // Transfer fee to feeRecipient (if they have position)
        if (fee > 0 && IToadzStake(toadzStake).hasActivePosition(feeRecipient)) {
            IToadzStake(toadzStake).transferLP(from, feeRecipient, fee);
        } else if (fee > 0) {
            // Fee recipient has no position, fee stays with owner
            IToadzStake(toadzStake).transferLP(from, to, fee);
        }
    }
    
    /**
     * @notice Process multiple active rentals
     * @param maxToProcess Maximum number to process (gas limit protection)
     */
    function processRentals(uint256 maxToProcess) external nonReentrant {
        uint256 processed = 0;
        uint256 i = 0;
        
        while (i < activeRentalKeys.length && processed < maxToProcess) {
            RentalKey memory key = activeRentalKeys[i];
            ActiveRental storage rental = activeRentals[key.collection][key.tokenId];
            
            bool shouldEnd = false;
            uint256 endReason = 0;
            
            if (rental.renter == address(0)) {
                // Invalid entry, clean up
                _removeFromActiveRentals(key.collection, key.tokenId);
                continue;
            }
            
            if (block.timestamp >= rental.endTime) {
                // Rental period ended
                shouldEnd = true;
                endReason = 1;
            }
            
            // Process payment and check if should end due to insufficient LP
            bool insufficientLP = _processRentalPayment(key.collection, key.tokenId);
            if (insufficientLP) {
                shouldEnd = true;
                endReason = 2;
            }
            
            if (shouldEnd) {
                address renter = rental.renter;
                userActiveRentalCount[renter]--;
                delete activeRentals[key.collection][key.tokenId];
                _removeFromActiveRentals(key.collection, key.tokenId);
                emit RentalEnded(key.collection, key.tokenId, renter, endReason);
                // Don't increment i since we removed current element
                continue;
            }
            
            i++;
            processed++;
        }
    }
    
    /**
     * @notice End a rental manually
     */
    function endRental(address collection, uint256 tokenId) external nonReentrant {
        ActiveRental storage rental = activeRentals[collection][tokenId];
        require(rental.renter != address(0), "No active rental");
        require(
            msg.sender == rental.renter || 
            block.timestamp >= rental.endTime ||
            msg.sender == owner(),
            "Cannot end"
        );
        
        _processRentalPayment(collection, tokenId);
        
        address renter = rental.renter;
        userActiveRentalCount[renter]--;
        delete activeRentals[collection][tokenId];
        _removeFromActiveRentals(collection, tokenId);
        
        emit RentalEnded(collection, tokenId, renter, 0);
    }
    
    function cancelRentalListing(address collection, uint256 tokenId) external nonReentrant whenNotPaused {
        RentalListing storage listing = rentalListings[collection][tokenId];
        require(listing.isActive, "Not listed");
        require(listing.owner == msg.sender, "Not owner");
        
        ActiveRental storage rental = activeRentals[collection][tokenId];
        require(rental.renter == address(0) || block.timestamp >= rental.endTime, "Active rental");
        
        if (rental.renter != address(0)) {
            _processRentalPayment(collection, tokenId);
            userActiveRentalCount[rental.renter]--;
            delete activeRentals[collection][tokenId];
            _removeFromActiveRentals(collection, tokenId);
        }
        
        _removeFromActiveRentalListings(collection, tokenId);
        delete rentalListings[collection][tokenId];
        userRentalListingCount[msg.sender]--;
        _syncBoostRegistry(msg.sender);
        
        emit RentalListingCancelled(collection, tokenId, msg.sender);
    }
    
    // ============ View Functions ============
    
    function getRentalListing(address collection, uint256 tokenId) external view returns (
        address owner_,
        uint256 dailyRate,
        uint256 commitmentEnd,
        uint256 daysRemaining,
        bool isActive,
        bool isRented
    ) {
        RentalListing storage listing = rentalListings[collection][tokenId];
        ActiveRental storage rental = activeRentals[collection][tokenId];
        
        owner_ = listing.owner;
        dailyRate = listing.dailyRate;
        commitmentEnd = listing.commitmentEnd;
        isActive = listing.isActive;
        
        if (listing.commitmentEnd > block.timestamp) {
            daysRemaining = _secondsToDays(listing.commitmentEnd - block.timestamp);
        }
        
        isRented = rental.renter != address(0) && block.timestamp < rental.endTime;
    }
    
    function getActiveRental(address collection, uint256 tokenId) external view returns (
        address renter,
        uint256 startTime,
        uint256 endTime,
        uint256 dailyRate,
        uint256 pendingPayment
    ) {
        ActiveRental storage rental = activeRentals[collection][tokenId];
        renter = rental.renter;
        startTime = rental.startTime;
        endTime = rental.endTime;
        dailyRate = rental.dailyRate;
        
        if (rental.renter != address(0)) {
            uint256 processUntil = block.timestamp > rental.endTime ? rental.endTime : block.timestamp;
            if (processUntil > rental.lastProcessed) {
                uint256 daysElapsed = _secondsToDays(processUntil - rental.lastProcessed);
                pendingPayment = daysElapsed * rental.dailyRate;
            }
        }
    }
    
    function getUserRentalStats(address user) external view returns (
        uint256 activeRentals_,
        uint256 rentalListings_
    ) {
        activeRentals_ = userActiveRentalCount[user];
        rentalListings_ = userRentalListingCount[user];
    }
    
    function getActiveRentalCount() external view returns (uint256) {
        return activeRentalKeys.length;
    }
    
    function getAllActiveListings() external view returns (
        address[] memory collections,
        uint256[] memory tokenIds,
        address[] memory sellers,
        uint256[] memory prices,
        uint256[] memory commitmentDays,
        uint256[] memory listedAts
    ) {
        uint256 count = activeListingKeys.length;
        collections = new address[](count);
        tokenIds = new uint256[](count);
        sellers = new address[](count);
        prices = new uint256[](count);
        commitmentDays = new uint256[](count);
        listedAts = new uint256[](count);
        
        for (uint256 i = 0; i < count; i++) {
            ListingKey memory key = activeListingKeys[i];
            Listing memory listing = listings[key.collection][key.tokenId];
            collections[i] = key.collection;
            tokenIds[i] = key.tokenId;
            sellers[i] = listing.seller;
            prices[i] = listing.price;
            commitmentDays[i] = listing.commitmentDays;
            listedAts[i] = listing.listedAt;
        }
    }
    
    function getAllActiveRentalListings() external view returns (
        address[] memory collections,
        uint256[] memory tokenIds,
        address[] memory owners,
        uint256[] memory dailyRates,
        uint256[] memory commitmentEnds
    ) {
        uint256 count = activeRentalListingKeys.length;
        collections = new address[](count);
        tokenIds = new uint256[](count);
        owners = new address[](count);
        dailyRates = new uint256[](count);
        commitmentEnds = new uint256[](count);
        
        for (uint256 i = 0; i < count; i++) {
            RentalKey memory key = activeRentalListingKeys[i];
            RentalListing memory listing = rentalListings[key.collection][key.tokenId];
            collections[i] = key.collection;
            tokenIds[i] = key.tokenId;
            owners[i] = listing.owner;
            dailyRates[i] = listing.dailyRate;
            commitmentEnds[i] = listing.commitmentEnd;
        }
    }
    
    function getActiveRentalListingCount() external view returns (uint256) {
        return activeRentalListingKeys.length;
    }
    
    function getUserTotalListings(address user) external view returns (uint256 sales, uint256 rentals, uint256 total) {
        sales = userListingCount[user];
        rentals = userRentalListingCount[user];
        total = sales + rentals;
    }
    
    // ============ Admin Functions ============
    
    function setToadzStake(address _toadzStake) external onlyOwner {
        toadzStake = _toadzStake;
    }
    
    function setTestMode(bool _testMode) external onlyOwner {
        testMode = _testMode;
    }
    
    function setBoostRegistry(address _boostRegistry) external onlyOwner {
        boostRegistry = _boostRegistry;
    }
    
    function setWhitelisted(address collection, bool status) external onlyOwner {
        whitelisted[collection] = status;
        emit CollectionWhitelisted(collection, status);
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Zero address");
        feeRecipient = _feeRecipient;
    }
    
    function setMinLPForRental(uint256 _minLP) external onlyOwner {
        minLPForRental = _minLP;
    }
    
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    
    // ============ Emergency ============
    
    function emergencyEndRental(address collection, uint256 tokenId) external onlyOwner {
        ActiveRental storage rental = activeRentals[collection][tokenId];
        if (rental.renter != address(0)) {
            _processRentalPayment(collection, tokenId);
            address renter = rental.renter;
            userActiveRentalCount[renter]--;
            delete activeRentals[collection][tokenId];
            _removeFromActiveRentals(collection, tokenId);
            emit RentalEnded(collection, tokenId, renter, 0);
        }
    }
    
    function emergencyCancelRentalListing(address collection, uint256 tokenId) external onlyOwner {
        RentalListing storage listing = rentalListings[collection][tokenId];
        if (listing.isActive) {
            address owner_ = listing.owner;
            _removeFromActiveRentalListings(collection, tokenId);
            delete rentalListings[collection][tokenId];
            userRentalListingCount[owner_]--;
            _syncBoostRegistry(owner_);
            emit RentalListingCancelled(collection, tokenId, owner_);
        }
    }
}

// ============ Interfaces ============

interface IBoostRegistry {
    function setListingCount(address user, uint256 count) external;
}

interface IToadzStake {
    function transferLP(address from, address to, uint256 amount) external;
    function hasActivePosition(address user) external view returns (bool);
    function positions(address user) external view returns (
        uint256 wflrStaked,
        uint256 pondStaked,
        uint256 earnedWflr,
        uint256 lockExpiry,
        uint256 lockMultiplier,
        uint256 rewardDebt
    );
}

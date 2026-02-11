// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title OGVault (Transparent Proxy Version)
 * @notice Permanent lock vault for OG NFT collections on Songbird
 * @dev Locked NFTs cannot be withdrawn - permanent commitment for 2x boost
 *      Only admin can emergency unlock (for migrations, etc)
 *      Deploy with TransparentUpgradeableProxy + ProxyAdmin
 */
contract OGVault_TP is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    // ============ Storage ============
    
    // Eligible collections that can be locked
    mapping(address => bool) public isEligible;
    address[] public eligibleCollections;
    
    // User -> Collection -> Token IDs locked
    mapping(address => mapping(address => uint256[])) private lockedNfts;
    
    // User -> Total locked count across all collections
    mapping(address => uint256) public lockedCount;
    
    // Track all lockers for social proof
    address[] private allLockers;
    mapping(address => bool) private isLocker;
    
    // ============ Events ============
    
    event Locked(address indexed user, address indexed collection, uint256 tokenId);
    event LockedBatch(address indexed user, address indexed collection, uint256[] tokenIds);
    event EmergencyUnlock(address indexed user, address indexed collection, uint256 tokenId);
    event CollectionAdded(address indexed collection);
    event CollectionRemoved(address indexed collection);
    
    // ============ Initializer ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address _owner) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
    }
    
    // ============ User Functions ============
    
    /**
     * @notice Lock a single NFT permanently
     * @param collection The NFT collection address
     * @param tokenId The token ID to lock
     */
    function lock(address collection, uint256 tokenId) external nonReentrant {
        require(isEligible[collection], "Collection not eligible");
        
        IERC721(collection).transferFrom(msg.sender, address(this), tokenId);
        
        lockedNfts[msg.sender][collection].push(tokenId);
        lockedCount[msg.sender]++;
        
        // Track as locker for social proof
        if (!isLocker[msg.sender]) {
            isLocker[msg.sender] = true;
            allLockers.push(msg.sender);
        }
        
        emit Locked(msg.sender, collection, tokenId);
    }
    
    /**
     * @notice Lock multiple NFTs from same collection permanently
     * @param collection The NFT collection address
     * @param tokenIds Array of token IDs to lock
     */
    function lockBatch(address collection, uint256[] calldata tokenIds) external nonReentrant {
        require(isEligible[collection], "Collection not eligible");
        require(tokenIds.length > 0, "Empty array");
        require(tokenIds.length <= 50, "Max 50 per batch");
        
        for (uint256 i = 0; i < tokenIds.length; i++) {
            IERC721(collection).transferFrom(msg.sender, address(this), tokenIds[i]);
            lockedNfts[msg.sender][collection].push(tokenIds[i]);
        }
        
        lockedCount[msg.sender] += tokenIds.length;
        
        // Track as locker for social proof
        if (!isLocker[msg.sender]) {
            isLocker[msg.sender] = true;
            allLockers.push(msg.sender);
        }
        
        emit LockedBatch(msg.sender, collection, tokenIds);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get total locked count for a user
     * @param user The user address
     */
    function getOGCount(address user) external view returns (uint256) {
        return lockedCount[user];
    }
    
    /**
     * @notice Get locked token IDs for a user in a specific collection
     * @param user The user address
     * @param collection The collection address
     */
    function getLockedNfts(address user, address collection) external view returns (uint256[] memory) {
        return lockedNfts[user][collection];
    }
    
    /**
     * @notice Get locked counts by collection for a user
     * @param user The user address
     */
    function getLockedByCollection(address user) external view returns (
        address[] memory collections,
        uint256[] memory counts
    ) {
        uint256 len = eligibleCollections.length;
        collections = new address[](len);
        counts = new uint256[](len);
        
        for (uint256 i = 0; i < len; i++) {
            collections[i] = eligibleCollections[i];
            counts[i] = lockedNfts[user][eligibleCollections[i]].length;
        }
    }
    
    /**
     * @notice Get all eligible collections
     */
    function getEligibleCollections() external view returns (address[] memory) {
        return eligibleCollections;
    }
    
    /**
     * @notice Check if a collection is eligible
     * @param collection The collection address
     */
    function checkEligible(address collection) external view returns (bool) {
        return isEligible[collection];
    }
    
    /**
     * @notice Get all lockers with their counts - for social proof UI
     * @return lockers Array of locker addresses
     * @return counts Array of lock counts (same order)
     * @return total Total NFTs locked across all users
     */
    function getAllLockers() external view returns (
        address[] memory lockers,
        uint256[] memory counts,
        uint256 total
    ) {
        uint256 len = allLockers.length;
        lockers = new address[](len);
        counts = new uint256[](len);
        total = 0;
        
        for (uint256 i = 0; i < len; i++) {
            lockers[i] = allLockers[i];
            counts[i] = lockedCount[allLockers[i]];
            total += counts[i];
        }
    }
    
    /**
     * @notice Get number of unique lockers
     */
    function getLockerCount() external view returns (uint256) {
        return allLockers.length;
    }
    
    /**
     * @notice Get total locked across all users
     */
    function getTotalLocked() external view returns (uint256 total) {
        for (uint256 i = 0; i < allLockers.length; i++) {
            total += lockedCount[allLockers[i]];
        }
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Add an eligible collection
     * @param collection The collection address to add
     */
    function addCollection(address collection) external onlyOwner {
        require(!isEligible[collection], "Already eligible");
        isEligible[collection] = true;
        eligibleCollections.push(collection);
        emit CollectionAdded(collection);
    }
    
    /**
     * @notice Remove an eligible collection (won't affect already locked NFTs)
     * @param collection The collection address to remove
     */
    function removeCollection(address collection) external onlyOwner {
        require(isEligible[collection], "Not eligible");
        isEligible[collection] = false;
        
        // Remove from array
        for (uint256 i = 0; i < eligibleCollections.length; i++) {
            if (eligibleCollections[i] == collection) {
                eligibleCollections[i] = eligibleCollections[eligibleCollections.length - 1];
                eligibleCollections.pop();
                break;
            }
        }
        
        emit CollectionRemoved(collection);
    }
    
    /**
     * @notice Emergency unlock - admin only, for migrations
     * @param user The user whose NFT to unlock
     * @param collection The collection address
     * @param tokenId The token ID to unlock
     * @param recipient Where to send the NFT
     */
    function emergencyUnlock(
        address user,
        address collection,
        uint256 tokenId,
        address recipient
    ) external onlyOwner {
        // Find and remove from user's locked array
        uint256[] storage userLocked = lockedNfts[user][collection];
        bool found = false;
        
        for (uint256 i = 0; i < userLocked.length; i++) {
            if (userLocked[i] == tokenId) {
                userLocked[i] = userLocked[userLocked.length - 1];
                userLocked.pop();
                found = true;
                break;
            }
        }
        
        require(found, "Token not locked by user");
        
        lockedCount[user]--;
        
        IERC721(collection).transferFrom(address(this), recipient, tokenId);
        
        emit EmergencyUnlock(user, collection, tokenId);
    }
    
    /**
     * @notice Emergency unlock batch - admin only
     * @param user The user whose NFTs to unlock
     * @param collection The collection address
     * @param tokenIds The token IDs to unlock
     * @param recipient Where to send the NFTs
     */
    function emergencyUnlockBatch(
        address user,
        address collection,
        uint256[] calldata tokenIds,
        address recipient
    ) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256[] storage userLocked = lockedNfts[user][collection];
            
            for (uint256 j = 0; j < userLocked.length; j++) {
                if (userLocked[j] == tokenIds[i]) {
                    userLocked[j] = userLocked[userLocked.length - 1];
                    userLocked.pop();
                    lockedCount[user]--;
                    IERC721(collection).transferFrom(address(this), recipient, tokenIds[i]);
                    emit EmergencyUnlock(user, collection, tokenIds[i]);
                    break;
                }
            }
        }
    }
}

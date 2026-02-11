// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title BoostRegistry
 * @notice Calculate user boosts from OG Vault locks + marketplace listings
 * 
 * BOOST SOURCES:
 *   1. OG Vault (Songbird) - permanent locks, full boost
 *   2. Marketplace listings (both chains) - active listings, half boost
 * 
 * FORMULA (Log Scale):
 *   OG boost = baseBoost + (log10(ogCount) × logMultiplier)
 *   Listing boost = (baseBoost + (log10(listingCount) × logMultiplier)) / 2
 */
contract BoostRegistry is Initializable, OwnableUpgradeable, PausableUpgradeable {
    
    uint256 public constant PRECISION = 1e18;
    
    address public ogVaultOracle;
    address public updater;
    
    mapping(address => uint256) public userListings;
    
    uint256 public baseBoost;
    uint256 public logMultiplier;
    
    event OGVaultOracleSet(address indexed oracle);
    event UpdaterSet(address indexed updater);
    event ListingCountUpdated(address indexed user, uint256 newCount);
    event ListingCountBatchUpdated(uint256 count);
    event BoostParamsUpdated(uint256 baseBoost, uint256 logMultiplier);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address _ogVaultOracle, address _updater) public initializer {
        __Ownable_init();
        __Pausable_init();
        
        ogVaultOracle = _ogVaultOracle;
        updater = _updater;
        baseBoost = PRECISION / 10;        // 0.1 = 10%
        logMultiplier = PRECISION / 2;     // 0.5
    }
    
    modifier onlyUpdater() {
        require(msg.sender == updater || msg.sender == owner(), "Not authorized");
        _;
    }
    
    // ============ Admin Functions ============
    
    function setOGVaultOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid address");
        ogVaultOracle = _oracle;
        emit OGVaultOracleSet(_oracle);
    }
    
    function setUpdater(address _updater) external onlyOwner {
        require(_updater != address(0), "Invalid address");
        updater = _updater;
        emit UpdaterSet(_updater);
    }
    
    function setBoostParams(uint256 _baseBoost, uint256 _logMultiplier) external onlyOwner {
        require(_baseBoost <= PRECISION, "Base boost must be <= 100%");
        require(_logMultiplier <= 2 * PRECISION, "Multiplier must be <= 2.0");
        baseBoost = _baseBoost;
        logMultiplier = _logMultiplier;
        emit BoostParamsUpdated(_baseBoost, _logMultiplier);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ Backend Sync Functions ============
    
    function setListingCount(address user, uint256 count) external onlyUpdater whenNotPaused {
        userListings[user] = count;
        emit ListingCountUpdated(user, count);
    }
    
    function setListingCountBatch(
        address[] calldata users, 
        uint256[] calldata counts
    ) external onlyUpdater whenNotPaused {
        require(users.length == counts.length, "Length mismatch");
        require(users.length <= 100, "Max 100 per batch");
        
        for (uint256 i = 0; i < users.length; i++) {
            userListings[users[i]] = counts[i];
            emit ListingCountUpdated(users[i], counts[i]);
        }
        
        emit ListingCountBatchUpdated(users.length);
    }
    
    // ============ Log10 Calculation ============
    
    function log10(uint256 x) public pure returns (uint256) {
        if (x <= 1) return 0;
        
        uint256 intPart = 0;
        uint256 temp = x;
        while (temp >= 10) {
            temp /= 10;
            intPart++;
        }
        
        uint256 lowerBound = 10 ** intPart;
        uint256 upperBound = 10 ** (intPart + 1);
        
        uint256 fracPart = 0;
        if (x > lowerBound && upperBound > lowerBound) {
            fracPart = ((x - lowerBound) * PRECISION) / (upperBound - lowerBound);
        }
        
        return (intPart * PRECISION) + fracPart;
    }
    
    function _calculateBoost(uint256 count) internal view returns (uint256) {
        if (count == 0) return 0;
        uint256 logValue = log10(count);
        return baseBoost + (logValue * logMultiplier / PRECISION);
    }
    
    // ============ View Functions ============
    
    function getUserBoost(address user) external view returns (uint256) {
        uint256 ogCount = 0;
        if (ogVaultOracle != address(0)) {
            try IOGVaultOracle(ogVaultOracle).getOGCount(user) returns (uint256 count) {
                ogCount = count;
            } catch {}
        }
        uint256 ogBoost = _calculateBoost(ogCount);
        
        uint256 listingCount = userListings[user];
        uint256 listingBoost = _calculateBoost(listingCount) / 2;
        
        return ogBoost + listingBoost;
    }
    
    function getBoostBreakdown(address user) external view returns (
        uint256 ogCount,
        uint256 listingCount,
        uint256 ogBoost,
        uint256 listingBoost,
        uint256 totalBoost
    ) {
        if (ogVaultOracle != address(0)) {
            try IOGVaultOracle(ogVaultOracle).getOGCount(user) returns (uint256 count) {
                ogCount = count;
            } catch {}
        }
        listingCount = userListings[user];
        
        ogBoost = _calculateBoost(ogCount);
        listingBoost = _calculateBoost(listingCount) / 2;
        totalBoost = ogBoost + listingBoost;
    }
    
    function previewBoost(uint256 ogCount, uint256 listingCount) external view returns (
        uint256 ogBoost,
        uint256 listingBoost,
        uint256 totalBoost
    ) {
        ogBoost = _calculateBoost(ogCount);
        listingBoost = _calculateBoost(listingCount) / 2;
        totalBoost = ogBoost + listingBoost;
    }
    
    function getListingCount(address user) external view returns (uint256) {
        return userListings[user];
    }
    
    // ============ Emergency Functions ============
    
    function emergencyResetListings(address user) external onlyOwner {
        userListings[user] = 0;
        emit ListingCountUpdated(user, 0);
    }
    
    function emergencyResetListingsBatch(address[] calldata users) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            userListings[users[i]] = 0;
            emit ListingCountUpdated(users[i], 0);
        }
    }
}

interface IOGVaultOracle {
    function getOGCount(address user) external view returns (uint256);
}

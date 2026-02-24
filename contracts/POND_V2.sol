// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract POND is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    
    uint256 public constant DECIMALS = 18;
    uint256 public constant REDEMPTION_PERCENT = 50;
    uint256 public constant FLOOR_PRICE = 0.50 ether;
    uint256 public constant PRICE_INCREMENT = 0.00001 ether;
    
    uint256 public DRIP_DURATION_FIXED;
    uint256 public DRIP_DURATION_MIN;
    uint256 public DRIP_DURATION_MAX;
    
    string public name;
    string public symbol;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public stakedPond;
    mapping(address => uint256) public totalPondCost;
    mapping(address => uint256) public totalPondBought;
    
    struct RedemptionInfo {
        uint256 totalOwed;
        uint256 totalClaimed;
        uint256 dripEndTime;
        uint256 dripStartTime;
    }
    mapping(address => RedemptionInfo) public redemptions;
    
    mapping(address => bool) public wasStaked;
    
    address public toadzStake;
    address public buffer;
    IERC20 public wflr;
    
    uint256 public minPurchase;
    bool public purchasesEnabled;
    
    mapping(address => bool) public isAuthorizedMinter;
    
    // V2: Zap contract for single-tx deposits
    address public zapContract;
    
    event PondPurchased(address indexed buyer, uint256 pondAmount, uint256 wflrPaid, uint256 floorToStakers, uint256 spreadToBuffer);
    event PondBurned(address indexed holder, uint256 pondAmount);
    event PondStaked(address indexed user, uint256 amount);
    event PondUnstaked(address indexed user, uint256 amount);
    event RedemptionStarted(address indexed user, uint256 pondBurned, uint256 wflrOwed, uint256 dripEndTime);
    event RedemptionClaimed(address indexed user, uint256 amount);
    event WasStakedSet(address indexed user, bool wasStaked);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(uint256 _dripDurationDays, address _wflr) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        name = "POND";
        symbol = "POND";
        DRIP_DURATION_FIXED = _dripDurationDays * 1 days;
        DRIP_DURATION_MIN = 30 days;
        DRIP_DURATION_MAX = 365 days;
        wflr = IERC20(_wflr);
        minPurchase = 10 ether;
        purchasesEnabled = true;
    }
    
    // ============ Admin Functions ============
    
    function setToadzStake(address _toadzStake) external onlyOwner {
        require(_toadzStake != address(0), "Invalid address");
        toadzStake = _toadzStake;
    }
    
    function setBuffer(address _buffer) external onlyOwner {
        require(_buffer != address(0), "Invalid address");
        buffer = _buffer;
    }
    
    function setWflr(address _wflr) external onlyOwner {
        require(_wflr != address(0), "Invalid address");
        wflr = IERC20(_wflr);
    }
    
    function setMinPurchase(uint256 _minPurchase) external onlyOwner {
        minPurchase = _minPurchase;
    }
    
    function setPurchasesEnabled(bool _enabled) external onlyOwner {
        purchasesEnabled = _enabled;
    }
    
    function setDripDurations(uint256 _fixedDays, uint256 _minDays, uint256 _maxDays) external onlyOwner {
        DRIP_DURATION_FIXED = _fixedDays * 1 days;
        DRIP_DURATION_MIN = _minDays * 1 days;
        DRIP_DURATION_MAX = _maxDays * 1 days;
    }
    
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        isAuthorizedMinter[minter] = authorized;
    }
    
    function setZapContract(address _zap) external onlyOwner {
        zapContract = _zap;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    function getCurrentPrice() public view returns (uint256) {
        return FLOOR_PRICE + (PRICE_INCREMENT * totalSupply / 1e18);
    }
    
    function getCostForPond(uint256 pondAmount) public view returns (uint256 totalCost, uint256 floorPortion, uint256 spread) {
        floorPortion = (FLOOR_PRICE * pondAmount) / 1e18;
        uint256 endSupply = totalSupply + pondAmount;
        uint256 startSupply = totalSupply;
        uint256 endSquared = (endSupply / 1e18) * (endSupply / 1e18);
        uint256 startSquared = (startSupply / 1e18) * (startSupply / 1e18);
        spread = (PRICE_INCREMENT * (endSquared - startSquared)) / 2;
        totalCost = floorPortion + spread;
        return (totalCost, floorPortion, spread);
    }
    
    function getPondForWflr(uint256 wflrAmount) public view returns (uint256 pondAmount) {
        uint256 low = 0;
        uint256 high = wflrAmount * 2 * 1e18 / FLOOR_PRICE;
        
        while (high - low > 1e15) {
            uint256 mid = (low + high) / 2;
            (uint256 cost,,) = getCostForPond(mid);
            if (cost <= wflrAmount) {
                low = mid;
            } else {
                high = mid;
            }
        }
        
        return low;
    }
    
    function getAveragePrice(address user) public view returns (uint256) {
        if (totalPondBought[user] == 0) return 0;
        return (totalPondCost[user] * 1e18) / totalPondBought[user];
    }
    
    function getAvailableBalance(address user) public view returns (uint256) {
        return balanceOf[user] - stakedPond[user];
    }
    
    function getClaimableRedemption(address user) public view returns (uint256) {
        RedemptionInfo storage info = redemptions[user];
        if (info.totalOwed == 0) return 0;
        if (block.timestamp >= info.dripEndTime) {
            return info.totalOwed - info.totalClaimed;
        }
        
        uint256 elapsed = block.timestamp - info.dripStartTime;
        uint256 totalDuration = info.dripEndTime - info.dripStartTime;
        uint256 vested = (info.totalOwed * elapsed) / totalDuration;
        
        if (vested <= info.totalClaimed) return 0;
        return vested - info.totalClaimed;
    }
    
    function getDripDuration(address user) public view returns (uint256) {
        if (!wasStaked[user]) {
            return DRIP_DURATION_FIXED;
        }
        
        if (buffer == address(0)) {
            return DRIP_DURATION_MAX;
        }
        
        uint256 bufferBalance = wflr.balanceOf(buffer);
        uint256 totalLiability = getTotalLiability();
        
        if (totalLiability == 0) {
            return DRIP_DURATION_MIN;
        }
        
        uint256 coverage = (bufferBalance * 100) / totalLiability;
        
        if (coverage >= 100) {
            return DRIP_DURATION_MIN;
        }
        
        uint256 duration = (DRIP_DURATION_MIN * 100) / (coverage + 1);
        
        if (duration > DRIP_DURATION_MAX) {
            return DRIP_DURATION_MAX;
        }
        if (duration < DRIP_DURATION_MIN) {
            return DRIP_DURATION_MIN;
        }
        
        return duration;
    }
    
    function getTotalLiability() public view returns (uint256) {
        return (totalSupply * FLOOR_PRICE * REDEMPTION_PERCENT) / (100 * 1e18);
    }
    
    // ============ Core Functions ============
    
    function buy(uint256 wflrAmount) external nonReentrant whenNotPaused {
        require(purchasesEnabled, "Purchases disabled");
        require(wflrAmount >= minPurchase, "Below minimum");
        
        uint256 pondAmount = getPondForWflr(wflrAmount);
        require(pondAmount > 0, "Zero POND");
        
        (uint256 totalCost, uint256 floorPortion, uint256 spreadPortion) = getCostForPond(pondAmount);
        require(wflrAmount >= totalCost, "Insufficient WFLR");
        
        require(wflr.transferFrom(msg.sender, address(this), totalCost), "Transfer failed");
        
        balanceOf[msg.sender] += pondAmount;
        totalSupply += pondAmount;
        
        totalPondCost[msg.sender] += totalCost;
        totalPondBought[msg.sender] += pondAmount;
        
        require(wflr.transfer(buffer, spreadPortion), "Spread transfer failed");
        IBuffer(buffer).deposit(spreadPortion);
        
        require(wflr.transfer(toadzStake, floorPortion), "Floor transfer failed");
        IToadzStake(toadzStake).receivePGS(floorPortion);
        
        emit PondPurchased(msg.sender, pondAmount, totalCost, floorPortion, spreadPortion);
    }
    
    /**
     * @notice Buy POND for another address (used by Zap contract)
     * @param wflrAmount WFLR to spend (pulled from msg.sender)
     * @param recipient Address to receive POND
     */
    function buyFor(uint256 wflrAmount, address recipient) external nonReentrant whenNotPaused {
        require(msg.sender == zapContract, "Only zap");
        require(purchasesEnabled, "Purchases disabled");
        require(wflrAmount >= minPurchase, "Below minimum");
        
        uint256 pondAmount = getPondForWflr(wflrAmount);
        require(pondAmount > 0, "Zero POND");
        
        (uint256 totalCost, uint256 floorPortion, uint256 spreadPortion) = getCostForPond(pondAmount);
        require(wflrAmount >= totalCost, "Insufficient WFLR");
        
        // Pull WFLR from Zap contract
        require(wflr.transferFrom(msg.sender, address(this), totalCost), "Transfer failed");
        
        // Mint POND to recipient
        balanceOf[recipient] += pondAmount;
        totalSupply += pondAmount;
        
        totalPondCost[recipient] += totalCost;
        totalPondBought[recipient] += pondAmount;
        
        // Distribute floor and spread
        require(wflr.transfer(buffer, spreadPortion), "Spread transfer failed");
        IBuffer(buffer).deposit(spreadPortion);
        
        require(wflr.transfer(toadzStake, floorPortion), "Floor transfer failed");
        IToadzStake(toadzStake).receivePGS(floorPortion);
        
        emit PondPurchased(recipient, pondAmount, totalCost, floorPortion, spreadPortion);
    }
    
    function buyExactFor(uint256 pondAmount, address buyer) external nonReentrant whenNotPaused {
        require(msg.sender == toadzStake, "Only ToadzStake");
        require(pondAmount > 0, "Zero amount");
        
        (uint256 totalCost, uint256 floorPortion, uint256 spreadPortion) = getCostForPond(pondAmount);
        
        balanceOf[buyer] += pondAmount;
        totalSupply += pondAmount;
        
        totalPondCost[buyer] += totalCost;
        totalPondBought[buyer] += pondAmount;
        
        require(wflr.transfer(buffer, spreadPortion), "Spread transfer failed");
        IBuffer(buffer).deposit(spreadPortion);
        
        require(wflr.transfer(toadzStake, floorPortion), "Floor transfer failed");
        IToadzStake(toadzStake).receivePGS(floorPortion);
        
        emit PondPurchased(buyer, pondAmount, totalCost, floorPortion, spreadPortion);
    }
    
    // ============ Staking Functions ============
    
    function stake(address user, uint256 amount) external {
        require(msg.sender == toadzStake, "Only ToadzStake");
        require(balanceOf[user] >= stakedPond[user] + amount, "Insufficient unstaked POND");
        
        stakedPond[user] += amount;
        emit PondStaked(user, amount);
    }
    
    function unstake(address user, uint256 amount) external {
        require(msg.sender == toadzStake, "Only ToadzStake");
        require(stakedPond[user] >= amount, "Insufficient staked POND");
        
        stakedPond[user] -= amount;
        emit PondUnstaked(user, amount);
    }
    
    // ============ Redemption Functions ============
    
    function startRedemption(uint256 pondAmount) external nonReentrant whenNotPaused {
        uint256 available = getAvailableBalance(msg.sender);
        require(available >= pondAmount, "Insufficient unstaked POND");
        require(pondAmount > 0, "Zero amount");
        
        uint256 avgPrice = getAveragePrice(msg.sender);
        require(avgPrice > 0, "No purchase history");
        
        uint256 wflrOwed = (avgPrice * pondAmount * REDEMPTION_PERCENT) / (100 * 1e18);
        
        balanceOf[msg.sender] -= pondAmount;
        totalSupply -= pondAmount;
        
        uint256 dripDuration = getDripDuration(msg.sender);
        
        RedemptionInfo storage info = redemptions[msg.sender];
        if (info.totalOwed > info.totalClaimed) {
            uint256 existingRemaining = info.totalOwed - info.totalClaimed;
            uint256 existingTimeRemaining = info.dripEndTime > block.timestamp 
                ? info.dripEndTime - block.timestamp 
                : 0;
            
            uint256 totalNew = existingRemaining + wflrOwed;
            uint256 weightedDuration = (existingRemaining * existingTimeRemaining + wflrOwed * dripDuration) / totalNew;
            
            info.totalOwed = info.totalClaimed + totalNew;
            info.dripStartTime = block.timestamp;
            info.dripEndTime = block.timestamp + weightedDuration;
        } else {
            info.totalOwed = wflrOwed;
            info.totalClaimed = 0;
            info.dripStartTime = block.timestamp;
            info.dripEndTime = block.timestamp + dripDuration;
        }
        
        emit PondBurned(msg.sender, pondAmount);
        emit RedemptionStarted(msg.sender, pondAmount, wflrOwed, info.dripEndTime);
    }
    
    function claimRedemption() external nonReentrant whenNotPaused {
        uint256 claimable = getClaimableRedemption(msg.sender);
        require(claimable > 0, "Nothing to claim");
        
        redemptions[msg.sender].totalClaimed += claimable;
        
        IBuffer(buffer).withdrawToPond(claimable);
        
        require(wflr.transfer(msg.sender, claimable), "Transfer failed");
        
        emit RedemptionClaimed(msg.sender, claimable);
    }
    
    // ============ ToadzStake Integration ============
    
    function setWasStaked(address user, bool _wasStaked) external {
        require(msg.sender == toadzStake, "Only ToadzStake");
        wasStaked[user] = _wasStaked;
        emit WasStakedSet(user, _wasStaked);
    }
    
    function burn(address from, uint256 amount) external {
        require(msg.sender == owner() || msg.sender == toadzStake, "Not authorized");
        require(balanceOf[from] >= amount, "Insufficient balance");

        if (msg.sender == toadzStake) {
            require(stakedPond[from] >= amount, "Insufficient staked POND");
            stakedPond[from] -= amount;
        } else {
            require(getAvailableBalance(from) >= amount, "Cannot burn staked POND");
        }

        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit PondBurned(from, amount);
    }
    
    function burnForMint(address from, uint256 amount) external {
        require(msg.sender == owner() || msg.sender == toadzStake || isAuthorizedMinter[msg.sender], "Not authorized");
        require(balanceOf[from] >= amount, "Insufficient balance");

        if (msg.sender == toadzStake) {
            require(stakedPond[from] >= amount, "Insufficient staked POND");
            stakedPond[from] -= amount;
        } else {
            require(getAvailableBalance(from) >= amount, "Cannot burn staked POND");
        }

        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit PondBurned(from, amount);
    }
    
    function mint(address to, uint256 amount) external {
        require(msg.sender == toadzStake, "Only ToadzStake");
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    
    // ============ Soulbound ============
    
    function transfer(address, uint256) external pure returns (bool) {
        revert("POND is soulbound");
    }
    
    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("POND is soulbound");
    }
    
    function approve(address, uint256) external pure returns (bool) {
        revert("POND is soulbound");
    }
    
    // ============ Emergency Functions ============
    
    function emergencyWithdrawWFLR() external onlyOwner {
        uint256 balance = wflr.balanceOf(address(this));
        require(wflr.transfer(owner(), balance), "Transfer failed");
    }
    
    function emergencyUnwrap(uint256 _amount) external onlyOwner {
        IWFLR(address(wflr)).withdraw(_amount);
    }
    
    function emergencyWithdrawNative() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "Transfer failed");
    }
    
    function emergencySetBalance(address user, uint256 amount) external onlyOwner {
        balanceOf[user] = amount;
    }
    
    function emergencySetStakedPond(address user, uint256 amount) external onlyOwner {
        stakedPond[user] = amount;
    }
    
    receive() external payable {}
}

interface IBuffer {
    function withdrawToPond(uint256 amount) external;
    function deposit(uint256 amount) external;
}

interface IWFLR {
    function withdraw(uint256) external;
}

interface IToadzStake {
    function receivePGS(uint256 amount) external;
}

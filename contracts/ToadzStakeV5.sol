// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { UD60x18, ud, pow, convert } from "@prb/math/src/UD60x18.sol";

contract ToadzStake is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    
    struct Position {
        uint256 wflrStaked;
        uint256 pondStaked;
        uint256 earnedWflr;
        uint256 lockExpiry;
        uint256 lockMultiplier;
        uint256 rewardDebt;
        uint256 lastUpdateTime;
    }
    
    uint256 public constant MULT_90 = 1;
    uint256 public constant MULT_180 = 2;
    uint256 public constant MULT_365 = 4;
    uint256 public constant PRECISION = 1e18;
    uint256 public constant RESTAKE_BUYBACK_PERCENT = 10;
    
    uint256 public LOCK_90_DAYS;
    uint256 public LOCK_180_DAYS;
    uint256 public LOCK_365_DAYS;
    
    mapping(uint256 => uint256) public rewardForEpoch;
    address public rewardsManagerAddress;
    mapping(address => bool) public authorizedSender;
    
    address public pond;
    IERC20 public wflr;
    address public ftsoProvider;
    address public boostRegistry;
    address public buffer;
    
    mapping(address => Position) public positions;
    
    uint256 public rewardIndex;
    uint256 public totalWeightedShares;
    uint256 public totalEffectiveShares;
    
    uint256 public minDeposit;
    uint256 public maxDeposit;
    uint256 public poolCap;
    uint256 public totalWflrStaked;
    uint256 public totalPondStaked;
    
    bool public boostsEnabled;
    
    mapping(address => address) public referrer;
    uint256 public constant REFERRAL_PERCENT = 1;
    
    mapping(address => uint256) public totalRewardsEarned;
    uint256 public MPOND_PER_WFLR;
    
    // V2: Track lifetime deposits for % gain calculation
    mapping(address => uint256) public totalDeposited;
    
    // V2: Total FTSO rewards claimed and distributed
    uint256 public totalFtsoRewardsClaimed;
    
    // V3: Boost market for LP transfers (rentals)
    address public boostMarket;
    
    // V5: Seed balance for boosted delegation
    uint256 public seedBalance;
    
    // V6: Track total PGS distributed
    uint256 public totalPGSDistributed;
    
    // V6: Track top staker return (basis points, 100 = 1%)
    uint256 public topStakerReturnBps;
    
    // V7: Zap contract for single-tx deposits
    address public zapContract;
    
    event Deposited(address indexed user, uint256 wflrAmount, uint256 pondAmount, uint256 lockDays, uint256 multiplier);
    event Restaked(address indexed user, uint256 newWflrStaked, uint256 pondBuyback, uint256 newLockDays);
    event Exited(address indexed user, uint256 wflrReturned, uint256 pondReturned);
    event RewardsDistributed(uint256 amount, uint256 newRewardIndex);
    event PGSReceived(uint256 amount);
    event FTSORewardsClaimed(uint24 indexed epochId, uint256 amount);
    event ReferrerSet(address indexed user, address indexed referrer);
    event ReferralPaid(address indexed referrer, address indexed referee, uint256 amount);
    event LPTransferred(address indexed from, address indexed to, uint256 amount);
    event NativeFLRWrapped(uint256 amount);
    event SeedDeposited(uint256 amount, uint256 newSeedBalance);
    event SeedWithdrawn(uint256 amount, uint256 newSeedBalance);
    event AddedToStake(address indexed user, uint256 wflrAdded, uint256 pondAdded, uint256 newTotal, uint256 lockMultiplier);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        bool _testNet,
        address _wflr,
        address _ftsoAddress,
        address _rewardsManagerAddress
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        wflr = IERC20(_wflr);
        
        if (_testNet) {
            LOCK_90_DAYS = 90 minutes;
            LOCK_180_DAYS = 180 minutes;
            LOCK_365_DAYS = 360 minutes;
        } else {
            LOCK_90_DAYS = 90 days;
            LOCK_180_DAYS = 180 days;
            LOCK_365_DAYS = 365 days;
        }
        
        rewardsManagerAddress = _rewardsManagerAddress;
        ftsoProvider = _ftsoAddress;
        
        minDeposit = 100 ether;
        maxDeposit = 1000000 ether;
        poolCap = 10000000 ether;
        boostsEnabled = false;
        MPOND_PER_WFLR = 200;
    }
    
    // ============ Admin Functions ============
    
    function delegateToFtso(uint256 _bips) external onlyOwner {
        require(ftsoProvider != address(0), "provider not set");
        IWFLR(address(wflr)).delegate(ftsoProvider, _bips);
    }
    
    function undelegate() external onlyOwner {
        IWFLR(address(wflr)).undelegateAll();
    }
    
    function setAuthorizedSender(address _address, bool _value) external onlyOwner {
        authorizedSender[_address] = _value;
    }
    
    function setMPONDPERWFLR(uint256 amount) external onlyOwner {
        MPOND_PER_WFLR = amount;
    }
    
    function setRewardsManager(address _address) external onlyOwner {
        rewardsManagerAddress = _address;
    }
    
    function setPond(address _pond) external onlyOwner {
        pond = _pond;
    }
    
    function setWflr(address _wflr) external onlyOwner {
        wflr = IERC20(_wflr);
    }
    
    function setFtsoProvider(address _provider) external onlyOwner {
        ftsoProvider = _provider;
    }
    
    function setBoostRegistry(address _registry) external onlyOwner {
        boostRegistry = _registry;
    }
    
    function setBuffer(address _buffer) external onlyOwner {
        buffer = _buffer;
    }
    
    function setBoostMarket(address _boostMarket) external onlyOwner {
        boostMarket = _boostMarket;
    }
    
    function setMinDeposit(uint256 _min) external onlyOwner {
        minDeposit = _min;
    }
    
    function setMaxDeposit(uint256 _max) external onlyOwner {
        maxDeposit = _max;
    }
    
    function setPoolCap(uint256 _cap) external onlyOwner {
        poolCap = _cap;
    }
    
    function setBoostsEnabled(bool _enabled) external onlyOwner {
        boostsEnabled = _enabled;
    }
    
    function setLockPeriods(uint256 _lock90, uint256 _lock180, uint256 _lock365) external onlyOwner {
        LOCK_90_DAYS = _lock90;
        LOCK_180_DAYS = _lock180;
        LOCK_365_DAYS = _lock365;
    }
    
    function setTestMode(bool _testMode) external onlyOwner {
        if (_testMode) {
            LOCK_90_DAYS = 90 minutes;
            LOCK_180_DAYS = 180 minutes;
            LOCK_365_DAYS = 360 minutes;
        } else {
            LOCK_90_DAYS = 90 days;
            LOCK_180_DAYS = 180 days;
            LOCK_365_DAYS = 365 days;
        }
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ V5: Seed Delegation for Boosted Rewards ============
    
    function seedDelegation(uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        require(wflr.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        seedBalance += amount;
        emit SeedDeposited(amount, seedBalance);
    }
    
    function withdrawSeed(uint256 amount) external onlyOwner {
        require(amount <= seedBalance, "Exceeds seed balance");
        seedBalance -= amount;
        require(wflr.transfer(msg.sender, amount), "Transfer failed");
        emit SeedWithdrawn(amount, seedBalance);
    }
    
    function getTotalDelegated() external view returns (uint256 total, uint256 staked, uint256 seed) {
        staked = totalWflrStaked;
        seed = seedBalance;
        total = staked + seed;
    }
    
    // ============ V3: LP Transfer for Rentals ============
    
    function transferLP(address from, address to, uint256 amount) external nonReentrant whenNotPaused {
        require(msg.sender == boostMarket, "Only boost market");
        require(from != address(0) && to != address(0), "Invalid address");
        require(from != to, "Same address");
        
        Position storage fromPos = positions[from];
        Position storage toPos = positions[to];
        
        require(fromPos.wflrStaked >= amount, "Insufficient LP");
        require(toPos.wflrStaked > 0, "Recipient no position");
        
        _updateRewards(from);
        _updateRewards(to);
        
        uint256 oldFromWeighted = getWeightedShares(from);
        uint256 oldToWeighted = getWeightedShares(to);
        
        fromPos.wflrStaked -= amount;
        toPos.wflrStaked += amount;
        
        totalDeposited[to] += amount;
        
        uint256 newFromWeighted = getWeightedShares(from);
        uint256 newToWeighted = getWeightedShares(to);
        totalWeightedShares = totalWeightedShares - oldFromWeighted - oldToWeighted + newFromWeighted + newToWeighted;
        
        _updateEffectiveShares(from, oldFromWeighted);
        _updateEffectiveShares(to, oldToWeighted);
        
        fromPos.rewardDebt = (getEffectiveShares(from) * rewardIndex) / PRECISION;
        toPos.rewardDebt = (getEffectiveShares(to) * rewardIndex) / PRECISION;
        
        emit LPTransferred(from, to, amount);
    }
    
    // ============ FTSO Reward Claiming ============
    
    function claimFtsoRewards(uint24 _rewardEpochId) external {
        require(authorizedSender[msg.sender] || msg.sender == owner(), "not authorized sender");
        require(rewardsManagerAddress != address(0), "rewards manager not set");
        
        uint256 balanceBefore = wflr.balanceOf(address(this));
        
        IRewardsV2.RewardClaimWithProof[] memory claims = new IRewardsV2.RewardClaimWithProof[](0);
        
        IRewardsV2(rewardsManagerAddress).claim(
            address(this),
            payable(address(this)),
            _rewardEpochId,
            true,
            claims
        );
        
        uint256 balanceAfter = wflr.balanceOf(address(this));
        uint256 claimed = balanceAfter - balanceBefore;
        
        if (claimed > 0) {
            rewardForEpoch[_rewardEpochId] = claimed;
            totalFtsoRewardsClaimed += claimed;
            _distributeRewards(claimed);
            emit FTSORewardsClaimed(_rewardEpochId, claimed);
        }
    }
    
    function claimFtsoRewardsWithProof(
        uint24 _rewardEpochId,
        IRewardsV2.RewardClaimWithProof[] calldata _claims
    ) external {
        require(authorizedSender[msg.sender] || msg.sender == owner(), "not authorized sender");
        require(rewardsManagerAddress != address(0), "rewards manager not set");
        
        uint256 balanceBefore = wflr.balanceOf(address(this));
        
        IRewardsV2(rewardsManagerAddress).claim(
            address(this),
            payable(address(this)),
            _rewardEpochId,
            true,
            _claims
        );
        
        uint256 balanceAfter = wflr.balanceOf(address(this));
        uint256 claimed = balanceAfter - balanceBefore;
        
        if (claimed > 0) {
            rewardForEpoch[_rewardEpochId] = claimed;
            totalFtsoRewardsClaimed += claimed;
            _distributeRewards(claimed);
            emit FTSORewardsClaimed(_rewardEpochId, claimed);
        }
    }
    
    function recordEpochRewards(uint256 _rewardEpochId, uint256 _amount) external {
        require(authorizedSender[msg.sender] || msg.sender == owner(), "not authorized sender");
        rewardForEpoch[_rewardEpochId] = _amount;
    }
    
    function getEpochReward(uint256 _rewardEpochId) external view returns (uint256) {
        return rewardForEpoch[_rewardEpochId];
    }
    
    function getUnclaimedEpochs() external view returns (uint256[] memory) {
        if (rewardsManagerAddress == address(0)) {
            return new uint256[](0);
        }
        return IRewardsV2(rewardsManagerAddress).getStateOfRewardsAt(address(this), 0);
    }
    
    // ============ V5: Wrap Native FLR ============
    
    function wrapNativeFLR() external onlyOwner {
        uint256 nativeBalance = address(this).balance;
        require(nativeBalance > 0, "No native FLR to wrap");
        IWFLR(address(wflr)).deposit{value: nativeBalance}();
        emit NativeFLRWrapped(nativeBalance);
    }
    
    function wrapAndDistribute() external onlyOwner {
        uint256 nativeBalance = address(this).balance;
        require(nativeBalance > 0, "No native FLR to wrap");
        IWFLR(address(wflr)).deposit{value: nativeBalance}();
        emit NativeFLRWrapped(nativeBalance);
        _distributeRewards(nativeBalance);
    }
    
    // ============ View Functions ============
    
    function getPondRequired(uint256 wflrAmount) public pure returns (uint256) {
        if (wflrAmount == 0) return 0;
        UD60x18 flr = ud(wflrAmount);
        UD60x18 exponent = ud(0.7e18);
        UD60x18 result = pow(flr, exponent);
        return (convert(result) * 1e18);
    }
    
    function getWeightedShares(address user) public view returns (uint256) {
        Position storage pos = positions[user];
        return pos.wflrStaked * pos.lockMultiplier;
    }
    
    function _effectiveFromWeighted(address user, uint256 weighted) internal view returns (uint256) {
        if (!boostsEnabled || boostRegistry == address(0)) {
            return weighted;
        }
        uint256 boost = IBoostRegistry(boostRegistry).getUserBoost(user);
        return (weighted * (PRECISION + boost)) / PRECISION;
    }

    function getEffectiveShares(address user) public view returns (uint256) {
        return _effectiveFromWeighted(user, getWeightedShares(user));
    }
    
    function getPendingRewards(address user) public view returns (uint256) {
        Position storage pos = positions[user];
        if (pos.wflrStaked == 0) return 0;
        
        uint256 effective = getEffectiveShares(user);
        uint256 accumulated = (effective * rewardIndex) / PRECISION;
        
        if (accumulated <= pos.rewardDebt) return 0;
        return accumulated - pos.rewardDebt;
    }
    
    function hasActivePosition(address user) public view returns (bool) {
        return positions[user].wflrStaked > 0;
    }
    
    function getUserMultiplier(address user) external view returns (uint256) {
        return positions[user].lockMultiplier;
    }
    
    function getPositionValue(address user) external view returns (uint256 total, uint256 principal, uint256 rewards) {
        Position storage pos = positions[user];
        principal = pos.wflrStaked;
        rewards = pos.earnedWflr + getPendingRewards(user);
        total = principal + rewards;
    }
    
    function getPercentGain(address user) external view returns (uint256) {
        uint256 deposited = totalDeposited[user];
        if (deposited == 0) return 0;
        
        Position storage pos = positions[user];
        uint256 currentValue = pos.wflrStaked + pos.earnedWflr + getPendingRewards(user);
        
        if (currentValue <= deposited) return 0;
        return ((currentValue - deposited) * 10000) / deposited;
    }
    
    function getTopStakerReturn() external view returns (uint256) {
        return topStakerReturnBps;
    }
    
    // ============ Core Functions ============
    
    function deposit(uint256 wflrAmount, uint8 lockTier, address _referrer) external nonReentrant whenNotPaused {
        require(wflrAmount >= minDeposit, "Below minimum");
        require(wflrAmount <= maxDeposit, "Above maximum");
        require(totalWflrStaked + wflrAmount <= poolCap, "Pool cap reached");
        require(positions[msg.sender].wflrStaked == 0, "Already staked - use restake");
        
        if (_referrer != address(0) && _referrer != msg.sender && referrer[msg.sender] == address(0)) {
            referrer[msg.sender] = _referrer;
            emit ReferrerSet(msg.sender, _referrer);
        }
        
        require(wflr.transferFrom(msg.sender, address(this), wflrAmount), "WFLR transfer failed");
        
        uint256 pondNeeded = getPondRequired(wflrAmount);
        require(IPOND(pond).balanceOf(msg.sender) >= pondNeeded, "Insufficient POND");
        
        IPOND(pond).stake(msg.sender, pondNeeded);
        
        (uint256 lockDuration, uint256 multiplier) = _getLockParams(lockTier);
        
        positions[msg.sender] = Position({
            wflrStaked: wflrAmount,
            pondStaked: pondNeeded,
            earnedWflr: 0,
            lockExpiry: block.timestamp + lockDuration,
            lockMultiplier: multiplier,
            rewardDebt: 0,
            lastUpdateTime: block.timestamp
        });
        
        uint256 weighted = getWeightedShares(msg.sender);
        totalWeightedShares += weighted;
        totalWflrStaked += wflrAmount;
        totalPondStaked += pondNeeded;
        totalDeposited[msg.sender] = wflrAmount;
        
        uint256 effective = getEffectiveShares(msg.sender);
        totalEffectiveShares += effective;
        positions[msg.sender].rewardDebt = (effective * rewardIndex) / PRECISION;
        
        IWFLR(address(wflr)).delegate(ftsoProvider, 10000);
        
        emit Deposited(msg.sender, wflrAmount, pondNeeded, lockDuration / 1 days, multiplier);
    }
    
    /**
     * @notice Deposit on behalf of user (called by Zap contract)
     * @dev Zap contract wraps FLR, buys POND for user, then calls this
     * @param user Address to create position for
     * @param wflrAmount WFLR to stake (pulled from msg.sender = Zap)
     * @param lockTier Lock duration (0=90d, 1=180d, 2=365d)
     * @param _referrer Referrer address
     */
    function depositFor(address user, uint256 wflrAmount, uint8 lockTier, address _referrer) external nonReentrant whenNotPaused {
        require(msg.sender == zapContract, "Only zap");
        require(wflrAmount >= minDeposit, "Below minimum");
        require(wflrAmount <= maxDeposit, "Above maximum");
        require(totalWflrStaked + wflrAmount <= poolCap, "Pool cap reached");
        require(positions[user].wflrStaked == 0, "Already staked");
        
        if (_referrer != address(0) && _referrer != user && referrer[user] == address(0)) {
            referrer[user] = _referrer;
            emit ReferrerSet(user, _referrer);
        }
        
        // Pull WFLR from Zap contract
        require(wflr.transferFrom(msg.sender, address(this), wflrAmount), "WFLR transfer failed");
        
        // User already has POND from Zap's buyFor call
        uint256 pondNeeded = getPondRequired(wflrAmount);
        require(IPOND(pond).balanceOf(user) >= pondNeeded, "Insufficient POND");
        
        IPOND(pond).stake(user, pondNeeded);
        
        (uint256 lockDuration, uint256 multiplier) = _getLockParams(lockTier);
        
        positions[user] = Position({
            wflrStaked: wflrAmount,
            pondStaked: pondNeeded,
            earnedWflr: 0,
            lockExpiry: block.timestamp + lockDuration,
            lockMultiplier: multiplier,
            rewardDebt: 0,
            lastUpdateTime: block.timestamp
        });
        
        uint256 weighted = wflrAmount * multiplier;
        totalWeightedShares += weighted;
        totalWflrStaked += wflrAmount;
        totalPondStaked += pondNeeded;
        totalDeposited[user] = wflrAmount;
        
        uint256 effective = boostsEnabled && boostRegistry != address(0)
            ? (weighted * (PRECISION + IBoostRegistry(boostRegistry).getUserBoost(user))) / PRECISION
            : weighted;
        totalEffectiveShares += effective;
        positions[user].rewardDebt = (effective * rewardIndex) / PRECISION;
        
        IWFLR(address(wflr)).delegate(ftsoProvider, 10000);
        
        emit Deposited(user, wflrAmount, pondNeeded, lockDuration / 1 days, multiplier);
    }
    
    function setZapContract(address _zap) external onlyOwner {
        zapContract = _zap;
    }

    function addToStake(uint256 wflrAmount, uint8 lockTier) external nonReentrant whenNotPaused {
        Position storage pos = positions[msg.sender];
        require(pos.wflrStaked > 0, "No position");
        require(wflrAmount >= minDeposit, "Below minimum");
        require(totalDeposited[msg.sender] + wflrAmount <= maxDeposit, "Above maximum");
        require(totalWflrStaked + wflrAmount <= poolCap, "Pool cap reached");

        _updateRewards(msg.sender);

        uint256 oldWeighted = getWeightedShares(msg.sender);

        require(wflr.transferFrom(msg.sender, address(this), wflrAmount), "WFLR transfer failed");

        // Per-add model: only require POND for this incremental deposit amount.
        uint256 additionalPond = getPondRequired(wflrAmount);

        if (additionalPond > 0) {
            require(IPOND(pond).balanceOf(msg.sender) >= additionalPond, "Insufficient POND");
            IPOND(pond).stake(msg.sender, additionalPond);
        }

        pos.wflrStaked += wflrAmount;
        pos.pondStaked += additionalPond;

        (uint256 lockDuration, uint256 multiplier) = _getLockParams(lockTier);
        if (multiplier > pos.lockMultiplier) {
            pos.lockExpiry = block.timestamp + lockDuration;
            pos.lockMultiplier = multiplier;
        }

        uint256 newWeighted = getWeightedShares(msg.sender);
        totalWeightedShares = totalWeightedShares - oldWeighted + newWeighted;
        totalWflrStaked += wflrAmount;
        totalPondStaked += additionalPond;
        totalDeposited[msg.sender] += wflrAmount;

        _updateEffectiveShares(msg.sender, oldWeighted);

        pos.rewardDebt = (getEffectiveShares(msg.sender) * rewardIndex) / PRECISION;
        pos.lastUpdateTime = block.timestamp;

        IWFLR(address(wflr)).delegate(ftsoProvider, 10000);

        emit AddedToStake(msg.sender, wflrAmount, additionalPond, pos.wflrStaked, pos.lockMultiplier);
    }

    function restake(uint8 newLockTier) external nonReentrant whenNotPaused {
        Position storage pos = positions[msg.sender];
        require(pos.wflrStaked > 0, "No position");
        require(pos.lockExpiry <= block.timestamp, "Lock not expired");
        
        _updateRewards(msg.sender);
        
        uint256 pondBuyback = (pos.pondStaked * RESTAKE_BUYBACK_PERCENT) / 100;
        uint256 avgPrice = IPOND(pond).getAveragePrice(msg.sender);
        uint256 buybackWflr = (pondBuyback * avgPrice) / PRECISION;
        
        require(buffer != address(0), "Buffer not set");
        IBuffer(buffer).withdrawToStake(buybackWflr);
        
        IPOND(pond).burn(msg.sender, pondBuyback);
        pos.pondStaked -= pondBuyback;
        totalPondStaked -= pondBuyback;
        
        uint256 oldWeighted = getWeightedShares(msg.sender);
        uint256 compoundAmount = pos.earnedWflr + buybackWflr;
        pos.wflrStaked += compoundAmount;
        pos.earnedWflr = 0;
        
        (uint256 lockDuration, uint256 multiplier) = _getLockParams(newLockTier);
        pos.lockExpiry = block.timestamp + lockDuration;
        pos.lockMultiplier = multiplier;
        pos.lastUpdateTime = block.timestamp;
        
        uint256 newWeighted = getWeightedShares(msg.sender);
        totalWeightedShares = totalWeightedShares - oldWeighted + newWeighted;
        totalWflrStaked += compoundAmount;
        
        _updateEffectiveShares(msg.sender, oldWeighted);
        
        uint256 effective = getEffectiveShares(msg.sender);
        pos.rewardDebt = (effective * rewardIndex) / PRECISION;
        
        emit Restaked(msg.sender, pos.wflrStaked, pondBuyback, lockDuration / 1 days);
    }
    
    function exit() external nonReentrant whenNotPaused {
        Position storage pos = positions[msg.sender];
        require(pos.wflrStaked > 0, "No position");
        require(pos.lockExpiry <= block.timestamp, "Lock not expired");
        
        _updateRewards(msg.sender);
        
        uint256 totalWflrReturn = pos.wflrStaked + pos.earnedWflr;
        uint256 pondToUnlock = pos.pondStaked;
        
        uint256 oldWeighted = getWeightedShares(msg.sender);
        totalWeightedShares -= oldWeighted;
        totalWflrStaked -= pos.wflrStaked;
        totalPondStaked -= pondToUnlock;
        _updateEffectiveShares(msg.sender, oldWeighted);
        
        IPOND(pond).unstake(msg.sender, pondToUnlock);
        IPOND(pond).setWasStaked(msg.sender, true);
        
        pos.wflrStaked = 0;
        pos.pondStaked = 0;
        pos.earnedWflr = 0;
        pos.rewardDebt = 0;
        pos.lockExpiry = 0;
        pos.lockMultiplier = 0;
        totalDeposited[msg.sender] = 0;
        
        require(wflr.transfer(msg.sender, totalWflrReturn), "WFLR transfer failed");
        
        emit Exited(msg.sender, totalWflrReturn, pondToUnlock);
    }
    
    // ============ Reward Distribution ============
    
    function receivePGS(uint256 amount) external {
        require(msg.sender == pond, "Only POND");
        _distributeRewards(amount);
        emit PGSReceived(amount);
    }
    
    function distributeRewards(uint256 amount) external {
        require(authorizedSender[msg.sender] || msg.sender == owner(), "Not authorized");
        _distributeRewards(amount);
    }

    function _distributeRewards(uint256 amount) internal {
        if (totalEffectiveShares == 0 || amount == 0) {
            if (buffer != address(0) && amount > 0) {
                require(wflr.transfer(buffer, amount), "Buffer transfer failed");
                IBuffer(buffer).deposit(amount);
            }
            return;
        }
        
        rewardIndex += (amount * PRECISION) / totalEffectiveShares;
        totalPGSDistributed += amount;
        emit RewardsDistributed(amount, rewardIndex);
    }
    
    function _updateRewards(address user) internal {
        Position storage pos = positions[user];
        if (pos.wflrStaked == 0) return;
        
        uint256 pending = getPendingRewards(user);
        if (pending > 0) {
            uint256 oldWeighted = getWeightedShares(user);
            uint256 compoundAmount = pending;

            address ref = referrer[user];
            if (ref != address(0) && hasActivePosition(ref)) {
                uint256 refCut = (pending * REFERRAL_PERCENT) / 100;
                positions[ref].earnedWflr += refCut;
                compoundAmount = pending - refCut;
                emit ReferralPaid(ref, user, refCut);
            }

            if (compoundAmount > 0) {
                // Auto-compound rewards into principal while preserving lock settings.
                pos.wflrStaked += compoundAmount;
                totalWflrStaked += compoundAmount;
                totalRewardsEarned[user] += compoundAmount;

                uint256 newWeighted = getWeightedShares(user);
                totalWeightedShares = totalWeightedShares - oldWeighted + newWeighted;
                _updateEffectiveShares(user, oldWeighted);
            }
        }
        
        uint256 effective = getEffectiveShares(user);
        pos.rewardDebt = (effective * rewardIndex) / PRECISION;
        pos.lastUpdateTime = block.timestamp;
    }
    
    function _updateEffectiveShares(address user, uint256 oldWeighted) internal {
        uint256 oldEffective = _effectiveFromWeighted(user, oldWeighted);
        uint256 newEffective = getEffectiveShares(user);
        totalEffectiveShares = totalEffectiveShares - oldEffective + newEffective;
    }
    
    function _getLockParams(uint8 tier) internal view returns (uint256 duration, uint256 multiplier) {
        if (tier == 0) return (LOCK_90_DAYS, MULT_90);
        if (tier == 1) return (LOCK_180_DAYS, MULT_180);
        return (LOCK_365_DAYS, MULT_365);
    }
    
    // ============ Emergency Functions ============
    
    function emergencyWithdraw() external onlyOwner {
        require(
            totalWflrStaked == 0 && totalWeightedShares == 0 && totalEffectiveShares == 0,
            "Active stake exists"
        );
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
    
    function emergencyPushPosition(
        address user,
        uint256 wflrStaked,
        uint256 pondStaked,
        uint256 earnedWflr,
        uint256 lockExpiry,
        uint256 lockMultiplier
    ) external onlyOwner {
        Position storage oldPos = positions[user];
        uint256 oldWeighted = oldPos.wflrStaked * oldPos.lockMultiplier;
        uint256 oldEffective = _effectiveFromWeighted(user, oldWeighted);

        require(totalWflrStaked >= oldPos.wflrStaked, "Bad totalWflrStaked");
        require(totalPondStaked >= oldPos.pondStaked, "Bad totalPondStaked");
        require(totalWeightedShares >= oldWeighted, "Bad totalWeightedShares");
        require(totalEffectiveShares >= oldEffective, "Bad totalEffectiveShares");

        uint256 newWeighted = wflrStaked * lockMultiplier;
        uint256 newEffective = _effectiveFromWeighted(user, newWeighted);

        totalWflrStaked = totalWflrStaked - oldPos.wflrStaked + wflrStaked;
        totalPondStaked = totalPondStaked - oldPos.pondStaked + pondStaked;
        totalWeightedShares = totalWeightedShares - oldWeighted + newWeighted;
        totalEffectiveShares = totalEffectiveShares - oldEffective + newEffective;

        positions[user] = Position({
            wflrStaked: wflrStaked,
            pondStaked: pondStaked,
            earnedWflr: earnedWflr,
            lockExpiry: lockExpiry,
            lockMultiplier: lockMultiplier,
            rewardDebt: (newEffective * rewardIndex) / PRECISION,
            lastUpdateTime: block.timestamp
        });
    }
    
    function emergencyUnlock(address user) external onlyOwner {
        positions[user].lockExpiry = block.timestamp;
    }
    
    function setTotalPGSDistributed(uint256 amount) external onlyOwner {
        totalPGSDistributed = amount;
    }
    
    function setTopStakerReturn(uint256 bps) external onlyOwner {
        topStakerReturnBps = bps;
    }
    
    function emergencySetTotalDeposited(address user, uint256 amount) external onlyOwner {
        totalDeposited[user] = amount;
    }
    
    receive() external payable {}
}

// ============ Interfaces ============

interface IPOND {
    function balanceOf(address) external view returns (uint256);
    function stakedPond(address) external view returns (uint256);
    function getCostForPond(uint256) external view returns (uint256, uint256, uint256);
    function buyExactFor(uint256, address) external;
    function burn(address, uint256) external;
    function getAveragePrice(address) external view returns (uint256);
    function setWasStaked(address, bool) external;
    function stake(address, uint256) external;
    function unstake(address, uint256) external;
}

interface IBoostRegistry {
    function getUserBoost(address) external view returns (uint256);
}

interface IWFLR {
    function delegate(address, uint256) external;
    function undelegateAll() external;
    function withdraw(uint256) external;
    function deposit() external payable;
}

interface IBuffer {
    function withdrawToStake(uint256 amount) external;
    function deposit(uint256 amount) external;
}

interface IRewardsV2 {
    struct RewardClaimWithProof {
        bytes32[] merkleProof;
        RewardClaim body;
    }
    
    struct RewardClaim {
        uint24 rewardEpochId;
        bytes20 beneficiary;
        uint120 amount;
        RewardClaimType claimType;
    }
    
    enum RewardClaimType {
        DIRECT,
        FEE,
        WNAT,
        MIRROR,
        CCHAIN
    }
    
    function claim(
        address _rewardOwner,
        address payable _recipient,
        uint24 _rewardEpochId,
        bool _wrap,
        RewardClaimWithProof[] calldata _proofs
    ) external returns (uint256 _rewardAmountWei);
    
    function getStateOfRewardsAt(
        address _rewardOwner,
        uint24 _rewardEpochId
    ) external view returns (uint256[] memory);
}
// v9

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Buffer is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    
    // ============ ORIGINAL STORAGE (DO NOT REORDER) ============
    IERC20 public wflr;
    address public pond;
    address public toadzStake;
    address public ftsoProvider;
    
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    
    uint256 public dailyWithdrawLimit;
    uint256 public lastWithdrawDay;
    uint256 public withdrawnToday;
    
    // ============ V2 STORAGE ============
    address public rewardsManagerAddress;
    uint256 public totalFtsoRewardsClaimed;
    mapping(uint256 => uint256) public rewardForEpoch;
    mapping(address => bool) public authorizedSender;
    
    // ============ V3 STORAGE ============
    address public claimSetupManager;
    
    event Deposited(address indexed from, uint256 amount);
    event WithdrawnToPond(address indexed to, uint256 amount);
    event WithdrawnToStake(address indexed to, uint256 amount);
    event AdminWithdraw(address indexed to, uint256 amount);
    event FTSORewardsClaimed(uint24 indexed epochId, uint256 amount);
    event Delegated(address indexed provider, uint256 bips);
    event ClaimExecutorSet(address indexed executor);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address _wflr, address _ftsoProvider) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        wflr = IERC20(_wflr);
        ftsoProvider = _ftsoProvider;
        dailyWithdrawLimit = 1000 ether;
    }
    
    // ============ Admin Functions ============
    
    function setPond(address _pond) external onlyOwner {
        require(_pond != address(0), "Invalid address");
        pond = _pond;
    }
    
    function setToadzStake(address _toadzStake) external onlyOwner {
        require(_toadzStake != address(0), "Invalid address");
        toadzStake = _toadzStake;
    }
    
    function setFtsoProvider(address _ftsoProvider) external onlyOwner {
        ftsoProvider = _ftsoProvider;
    }
    
    function setRewardsManager(address _rewardsManagerAddress) external onlyOwner {
        rewardsManagerAddress = _rewardsManagerAddress;
    }
    
    function setAuthorizedSender(address _address, bool _value) external onlyOwner {
        authorizedSender[_address] = _value;
    }
    
    function setDailyWithdrawLimit(uint256 _limit) external onlyOwner {
        dailyWithdrawLimit = _limit;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ V3: Claim Executor Setup ============
    
    /**
     * @notice Set the ClaimSetupManager address
     * @param _claimSetupManager Flare's ClaimSetupManager contract address
     */
    function setClaimSetupManager(address _claimSetupManager) external onlyOwner {
        require(_claimSetupManager != address(0), "Invalid address");
        claimSetupManager = _claimSetupManager;
    }
    
    /**
     * @notice Register claim executors who can claim rewards on behalf of this contract
     * @param _executors Array of executor addresses
     */
    function setClaimExecutors(address[] calldata _executors) external onlyOwner {
        require(claimSetupManager != address(0), "ClaimSetupManager not set");
        IClaimSetupManager(claimSetupManager).setClaimExecutors(_executors);
        for (uint i = 0; i < _executors.length; i++) {
            emit ClaimExecutorSet(_executors[i]);
        }
    }
    
    /**
     * @notice Set allowed claim recipients
     * @param _recipients Array of recipient addresses that can receive claimed rewards
     */
    function setAllowedClaimRecipients(address[] calldata _recipients) external onlyOwner {
        require(claimSetupManager != address(0), "ClaimSetupManager not set");
        IClaimSetupManager(claimSetupManager).setAllowedClaimRecipients(_recipients);
    }
    
    // ============ FTSO Delegation ============
    
    /**
     * @notice Delegate WFLR to FTSO provider
     * @param _bips Basis points to delegate (10000 = 100%)
     */
    function delegateToFtso(uint256 _bips) external onlyOwner {
        require(ftsoProvider != address(0), "provider not set");
        IWFLR(address(wflr)).delegate(ftsoProvider, _bips);
        emit Delegated(ftsoProvider, _bips);
    }
    
    /**
     * @notice Remove all delegations
     */
    function undelegate() external onlyOwner {
        IWFLR(address(wflr)).undelegateAll();
    }
    
    // ============ FTSO Reward Claiming ============
    
    /**
     * @notice Claim FTSO rewards for a specific epoch
     * @param _rewardEpochId The epoch ID to claim rewards for
     * @dev Claimed rewards stay in Buffer (they're part of the spread backing)
     */
    function claimFtsoRewards(uint24 _rewardEpochId) external {
        require(authorizedSender[msg.sender] || msg.sender == owner(), "not authorized sender");
        require(rewardsManagerAddress != address(0), "rewards manager not set");
        
        uint256 balanceBefore = wflr.balanceOf(address(this));
        
        IRewardsV2.RewardClaimWithProof[] memory claims = new IRewardsV2.RewardClaimWithProof[](0);
        
        IRewardsV2(rewardsManagerAddress).claim(
            address(this),
            payable(address(this)),
            _rewardEpochId,
            false,
            claims
        );
        
        uint256 balanceAfter = wflr.balanceOf(address(this));
        uint256 claimed = balanceAfter - balanceBefore;
        
        if (claimed > 0) {
            rewardForEpoch[_rewardEpochId] = claimed;
            totalFtsoRewardsClaimed += claimed;
            totalDeposited += claimed; // Count as deposit since it backs the buffer
            
            emit FTSORewardsClaimed(_rewardEpochId, claimed);
        }
    }
    
    /**
     * @notice Claim FTSO rewards with explicit proof data
     */
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
            false,
            _claims
        );
        
        uint256 balanceAfter = wflr.balanceOf(address(this));
        uint256 claimed = balanceAfter - balanceBefore;
        
        if (claimed > 0) {
            rewardForEpoch[_rewardEpochId] = claimed;
            totalFtsoRewardsClaimed += claimed;
            totalDeposited += claimed;
            
            emit FTSORewardsClaimed(_rewardEpochId, claimed);
        }
    }
    
    /**
     * @notice Record FTSO rewards claimed externally (by executor)
     */
    function recordEpochRewards(uint256 _rewardEpochId, uint256 _amount) external {
        require(authorizedSender[msg.sender] || msg.sender == owner(), "not authorized sender");
        rewardForEpoch[_rewardEpochId] = _amount;
        totalFtsoRewardsClaimed += _amount;
        totalDeposited += _amount;
    }
    
    /**
     * @notice Get rewards claimed for a specific epoch
     */
    function getEpochReward(uint256 _rewardEpochId) external view returns (uint256) {
        return rewardForEpoch[_rewardEpochId];
    }
    
    // ============ View Functions ============
    
    function getBalance() external view returns (uint256) {
        return wflr.balanceOf(address(this));
    }
    
    // ============ Core Functions ============
    
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        totalDeposited += amount;
        emit Deposited(msg.sender, amount);
    }
    
    function withdrawToPond(uint256 amount) external nonReentrant whenNotPaused {
        require(msg.sender == pond, "Only POND");
        require(wflr.balanceOf(address(this)) >= amount, "Insufficient balance");
        
        totalWithdrawn += amount;
        require(wflr.transfer(pond, amount), "Transfer failed");
        
        emit WithdrawnToPond(pond, amount);
    }
    
    function withdrawToStake(uint256 amount) external nonReentrant whenNotPaused {
        require(msg.sender == toadzStake, "Only ToadzStake");
        require(wflr.balanceOf(address(this)) >= amount, "Insufficient balance");
        
        totalWithdrawn += amount;
        require(wflr.transfer(toadzStake, amount), "Transfer failed");
        
        emit WithdrawnToStake(toadzStake, amount);
    }
    
    function adminWithdraw(uint256 amount, address to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid address");
        require(wflr.balanceOf(address(this)) >= amount, "Insufficient balance");
        
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastWithdrawDay) {
            lastWithdrawDay = currentDay;
            withdrawnToday = 0;
        }
        
        require(withdrawnToday + amount <= dailyWithdrawLimit, "Daily limit exceeded");
        
        withdrawnToday += amount;
        totalWithdrawn += amount;
        require(wflr.transfer(to, amount), "Transfer failed");
        
        emit AdminWithdraw(to, amount);
    }
    
    // ============ Emergency Functions ============
    
    function emergencyWithdraw(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 balance = wflr.balanceOf(address(this));
        require(wflr.transfer(to, balance), "Transfer failed");
        emit AdminWithdraw(to, balance);
    }
    
    function emergencyWithdrawAll() external onlyOwner {
        uint256 balance = wflr.balanceOf(address(this));
        require(wflr.transfer(owner(), balance), "Transfer failed");
        emit AdminWithdraw(owner(), balance);
    }
    
    function emergencyUnwrap(uint256 _amount) external onlyOwner {
        IWFLR(address(wflr)).withdraw(_amount);
    }
    
    function emergencyWithdrawNative() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "Transfer failed");
    }
    
    receive() external payable {}
}

// ============ Interfaces ============

interface IWFLR {
    function delegate(address, uint256) external;
    function undelegateAll() external;
    function withdraw(uint256) external;
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
}

interface IClaimSetupManager {
    function setClaimExecutors(address[] calldata _executors) external;
    function setAllowedClaimRecipients(address[] calldata _recipients) external;
}

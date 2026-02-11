// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWFLR {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IPOND {
    function buyFor(uint256 wflrAmount, address recipient) external;
    function balanceOf(address) external view returns (uint256);
    function getCostForPond(uint256 pondAmount) external view returns (uint256, uint256, uint256);
    function getPondForWflr(uint256 wflrAmount) external view returns (uint256);
}

interface IToadzStake {
    function depositFor(address user, uint256 wflrAmount, uint8 lockTier, address referrer) external;
    function getPondRequired(uint256 wflrAmount) external view returns (uint256);
}

/**
 * @title ZapDeposit
 * @notice Single-transaction deposit into ToadzStake
 * @dev User sends FLR → Zap wraps, buys POND for user, deposits for user
 * @dev ONE MetaMask popup instead of 4
 */
contract ZapDeposit {
    IWFLR public immutable wflr;
    IPOND public immutable pond;
    IToadzStake public immutable toadzStake;
    
    event ZapExecuted(address indexed user, uint256 flrIn, uint256 staked, uint256 pondBought);
    
    constructor(address _wflr, address _pond, address _toadzStake) {
        wflr = IWFLR(_wflr);
        pond = IPOND(_pond);
        toadzStake = IToadzStake(_toadzStake);
        
        // One-time max approvals
        wflr.approve(_pond, type(uint256).max);
        wflr.approve(_toadzStake, type(uint256).max);
    }
    
    /**
     * @notice Deposit FLR into ToadzStake in ONE transaction
     * @param stakeAmount Amount of WFLR to actually stake
     * @param lockTier Lock duration (0=90d, 1=180d, 2=365d)
     * @param referrer Referrer address (or address(0))
     * @dev Send total FLR needed (use previewDeposit to calculate)
     */
    function zapDeposit(uint256 stakeAmount, uint8 lockTier, address referrer) external payable {
        require(msg.value > 0, "No FLR sent");
        
        // Wrap all FLR to WFLR
        wflr.deposit{value: msg.value}();
        
        // Calculate POND needed for stake amount
        uint256 pondRequired = toadzStake.getPondRequired(stakeAmount);
        uint256 userPondBal = pond.balanceOf(msg.sender);
        uint256 pondBought = 0;
        
        // Buy POND for user if needed
        if (userPondBal < pondRequired) {
            uint256 pondNeeded = pondRequired - userPondBal;
            (uint256 pondCost,,) = pond.getCostForPond(pondNeeded);
            
            // Add buffer, enforce minimum
            uint256 buyAmount = pondCost + (pondCost / 50); // 2% buffer
            if (buyAmount < 10 ether) buyAmount = 10 ether;
            
            // Buy POND - mints to msg.sender (user)
            pond.buyFor(buyAmount, msg.sender);
            pondBought = pond.getPondForWflr(buyAmount);
        }
        
        // Deposit for user
        toadzStake.depositFor(msg.sender, stakeAmount, lockTier, referrer);
        
        // Refund excess WFLR
        uint256 remaining = wflr.balanceOf(address(this));
        if (remaining > 0) {
            wflr.transfer(msg.sender, remaining);
        }
        
        emit ZapExecuted(msg.sender, msg.value, stakeAmount, pondBought);
    }
    
    /**
     * @notice Calculate FLR needed for deposit
     * @param stakeAmount WFLR to stake
     * @param user Address to check POND balance
     * @return totalFLR Total FLR to send
     * @return pondCost WFLR needed for POND
     * @return pondToBuy POND that will be purchased
     */
    function previewDeposit(uint256 stakeAmount, address user) external view returns (
        uint256 totalFLR,
        uint256 pondCost,
        uint256 pondToBuy
    ) {
        uint256 pondRequired = toadzStake.getPondRequired(stakeAmount);
        uint256 userPondBal = pond.balanceOf(user);
        
        if (userPondBal >= pondRequired) {
            // User has enough POND
            return (stakeAmount, 0, 0);
        }
        
        pondToBuy = pondRequired - userPondBal;
        (pondCost,,) = pond.getCostForPond(pondToBuy);
        
        // Add 5% buffer for safety
        uint256 buffer = pondCost / 20;
        totalFLR = stakeAmount + pondCost + buffer;
    }
    
    receive() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title TadzClaimer_TP
 * @notice Merkle-based airdrop for Tadz NFTs based on OG Vault locks
 * @dev Transparent Proxy pattern - uses transfer (not mint)
 * 
 * Flow:
 * 1. Admin pre-mints Tadz to this contract
 * 2. Admin sets merkle root from OGVault snapshot
 * 3. Users claim() with proof -> contract transfers Tadz to them
 * 4. After 6 months, admin can withdraw unclaimed (no rush)
 */
contract TadzClaimer_TP is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    IERC721 public tadz;
    bytes32 public merkleRoot;
    
    // Tracks how many Tadz each user has claimed
    mapping(address => uint256) public claimed;
    
    // Token IDs available for claiming (array we pop from)
    uint256[] public tokenIds;
    
    // Withdrawal unlock timestamp (6 months after deploy)
    uint256 public withdrawUnlockTime;
    
    // Pause claims
    bool public paused;
    
    event Claimed(address indexed user, uint256 amount, uint256[] tokenIds);
    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event TokensDeposited(uint256 count);
    event TokensWithdrawn(address indexed to, uint256 count);
    
    error InvalidProof();
    error NothingToClaim();
    error ClaimsPaused();
    error NotEnoughTokens();
    error WithdrawLocked();
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address _tadz, bytes32 _merkleRoot) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        
        tadz = IERC721(_tadz);
        merkleRoot = _merkleRoot;
        withdrawUnlockTime = block.timestamp + 180 days;
    }
    
    /**
     * @notice Claim Tadz based on OG lock allocation
     * @param totalAllocation Total Tadz allocated (ogCount * 3)
     * @param proof Merkle proof
     */
    function claim(uint256 totalAllocation, bytes32[] calldata proof) external nonReentrant {
        if (paused) revert ClaimsPaused();
        
        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, totalAllocation));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();
        
        // Calculate how many to transfer
        uint256 alreadyClaimed = claimed[msg.sender];
        if (totalAllocation <= alreadyClaimed) revert NothingToClaim();
        uint256 toTransfer = totalAllocation - alreadyClaimed;
        
        if (toTransfer > tokenIds.length) revert NotEnoughTokens();
        
        // Update claimed
        claimed[msg.sender] = totalAllocation;
        
        // Transfer tokens (pop from end of array)
        uint256[] memory sentIds = new uint256[](toTransfer);
        for (uint256 i = 0; i < toTransfer; i++) {
            uint256 tokenId = tokenIds[tokenIds.length - 1];
            tokenIds.pop();
            tadz.transferFrom(address(this), msg.sender, tokenId);
            sentIds[i] = tokenId;
        }
        
        emit Claimed(msg.sender, toTransfer, sentIds);
    }
    
    /**
     * @notice Check claimable amount
     */
    function getClaimable(
        address user, 
        uint256 totalAllocation, 
        bytes32[] calldata proof
    ) external view returns (uint256) {
        bytes32 leaf = keccak256(abi.encodePacked(user, totalAllocation));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) return 0;
        
        uint256 alreadyClaimed = claimed[user];
        if (totalAllocation <= alreadyClaimed) return 0;
        
        return totalAllocation - alreadyClaimed;
    }
    
    /**
     * @notice Verify proof without claiming
     */
    function verifyProof(
        address user,
        uint256 totalAllocation,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(user, totalAllocation));
        return MerkleProof.verify(proof, merkleRoot, leaf);
    }
    
    /**
     * @notice Available tokens in contract
     */
    function availableTokens() external view returns (uint256) {
        return tokenIds.length;
    }
    
    /**
     * @notice Time until withdrawal unlocks
     */
    function timeUntilWithdraw() external view returns (uint256) {
        if (block.timestamp >= withdrawUnlockTime) return 0;
        return withdrawUnlockTime - block.timestamp;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Deposit token IDs (call after transferring NFTs to this contract)
     */
    function depositTokenIds(uint256[] calldata _tokenIds) external onlyOwner {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            tokenIds.push(_tokenIds[i]);
        }
        emit TokensDeposited(_tokenIds.length);
    }
    
    /**
     * @notice Update merkle root
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        bytes32 oldRoot = merkleRoot;
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(oldRoot, _merkleRoot);
    }
    
    /**
     * @notice Pause/unpause
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }
    
    /**
     * @notice Withdraw unclaimed tokens (after 6 months)
     */
    function withdrawUnclaimed(address to, uint256 count) external onlyOwner {
        if (block.timestamp < withdrawUnlockTime) revert WithdrawLocked();
        if (count > tokenIds.length) count = tokenIds.length;
        
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = tokenIds[tokenIds.length - 1];
            tokenIds.pop();
            tadz.transferFrom(address(this), to, tokenId);
        }
        
        emit TokensWithdrawn(to, count);
    }
    
    /**
     * @notice Extend withdrawal lock (can only extend, not shorten)
     */
    function extendWithdrawLock(uint256 newUnlockTime) external onlyOwner {
        require(newUnlockTime > withdrawUnlockTime, "Can only extend");
        withdrawUnlockTime = newUnlockTime;
    }
    
    /**
     * @notice Handle ERC721 received
     */
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
    
    uint256[45] private __gap;
}

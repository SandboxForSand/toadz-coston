// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IOGVaultMinimal {
    function getOGCount(address user) external view returns (uint256);
}

/**
 * @title TadzClaimerAuto_TP
 * @notice Tadz claimer that supports automatic entitlement from OGVault (locked * 3)
 * @dev Storage layout is kept compatible with TadzClaimer_TP for proxy upgrades.
 */
contract TadzClaimerAuto_TP is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    IERC721 public tadz;
    bytes32 public merkleRoot;
    mapping(address => uint256) public claimed;
    uint256[] public tokenIds;
    uint256 public withdrawUnlockTime;
    bool public paused;

    // V2+ storage: direct entitlement source
    address public ogVault;

    event Claimed(address indexed user, uint256 amount, uint256[] tokenIds);
    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event TokensDeposited(uint256 count);
    event TokensWithdrawn(address indexed to, uint256 count);
    event OGVaultUpdated(address indexed oldVault, address indexed newVault);

    error InvalidProof();
    error NothingToClaim();
    error ClaimsPaused();
    error NotEnoughTokens();
    error InvalidClaimAmount();
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

    function initializeV2(address _ogVault) external reinitializer(2) onlyOwner {
        address oldVault = ogVault;
        ogVault = _ogVault;
        emit OGVaultUpdated(oldVault, _ogVault);
    }

    function _autoAllocation(address user) internal view returns (uint256) {
        if (ogVault == address(0)) return 0;
        uint256 locked = IOGVaultMinimal(ogVault).getOGCount(user);
        return locked * 3;
    }

    function getAutoAllocation(address user) public view returns (uint256) {
        return _autoAllocation(user);
    }

    function _resolveAllocation(
        address user,
        uint256 totalAllocation,
        bytes32[] calldata proof
    ) internal view returns (uint256 allocation, bool proofValid) {
        if (ogVault != address(0)) {
            return (_autoAllocation(user), true);
        }

        bytes32 leaf = keccak256(abi.encodePacked(user, totalAllocation));
        bool valid = MerkleProof.verify(proof, merkleRoot, leaf);
        return (totalAllocation, valid);
    }

    function _claimResolved(address user, uint256 allocation, uint256 maxAmount) internal {
        uint256 alreadyClaimed = claimed[user];
        if (allocation <= alreadyClaimed) revert NothingToClaim();
        if (maxAmount == 0) revert InvalidClaimAmount();

        uint256 remaining = allocation - alreadyClaimed;
        uint256 toTransfer = maxAmount < remaining ? maxAmount : remaining;
        if (toTransfer > tokenIds.length) revert NotEnoughTokens();

        claimed[user] = alreadyClaimed + toTransfer;

        uint256[] memory sentIds = new uint256[](toTransfer);
        for (uint256 i = 0; i < toTransfer; i++) {
            uint256 tokenId = tokenIds[tokenIds.length - 1];
            tokenIds.pop();
            tadz.transferFrom(address(this), user, tokenId);
            sentIds[i] = tokenId;
        }

        emit Claimed(user, toTransfer, sentIds);
    }

    function claim(uint256 totalAllocation, bytes32[] calldata proof) external nonReentrant {
        if (paused) revert ClaimsPaused();

        (uint256 allocation, bool proofValid) = _resolveAllocation(msg.sender, totalAllocation, proof);
        if (!proofValid) revert InvalidProof();

        _claimResolved(msg.sender, allocation, type(uint256).max);
    }

    function claimPartial(uint256 amount, uint256 totalAllocation, bytes32[] calldata proof) external nonReentrant {
        if (paused) revert ClaimsPaused();

        (uint256 allocation, bool proofValid) = _resolveAllocation(msg.sender, totalAllocation, proof);
        if (!proofValid) revert InvalidProof();

        _claimResolved(msg.sender, allocation, amount);
    }

    function getClaimable(
        address user,
        uint256 totalAllocation,
        bytes32[] calldata proof
    ) external view returns (uint256) {
        (uint256 allocation, bool proofValid) = _resolveAllocation(user, totalAllocation, proof);
        if (!proofValid) return 0;

        uint256 alreadyClaimed = claimed[user];
        if (allocation <= alreadyClaimed) return 0;

        return allocation - alreadyClaimed;
    }

    function verifyProof(
        address user,
        uint256 totalAllocation,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (ogVault != address(0)) {
            return _autoAllocation(user) >= totalAllocation;
        }

        bytes32 leaf = keccak256(abi.encodePacked(user, totalAllocation));
        return MerkleProof.verify(proof, merkleRoot, leaf);
    }

    function availableTokens() external view returns (uint256) {
        return tokenIds.length;
    }

    function timeUntilWithdraw() external view returns (uint256) {
        if (block.timestamp >= withdrawUnlockTime) return 0;
        return withdrawUnlockTime - block.timestamp;
    }

    function depositTokenIds(uint256[] calldata _tokenIds) external onlyOwner {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            tokenIds.push(_tokenIds[i]);
        }
        emit TokensDeposited(_tokenIds.length);
    }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        bytes32 oldRoot = merkleRoot;
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(oldRoot, _merkleRoot);
    }

    function setOGVault(address _ogVault) external onlyOwner {
        address oldVault = ogVault;
        ogVault = _ogVault;
        emit OGVaultUpdated(oldVault, _ogVault);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

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

    function extendWithdrawLock(uint256 newUnlockTime) external onlyOwner {
        require(newUnlockTime > withdrawUnlockTime, "Can only extend");
        withdrawUnlockTime = newUnlockTime;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    uint256[45] private __gap;
}

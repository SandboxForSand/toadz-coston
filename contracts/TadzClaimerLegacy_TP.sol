// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title TadzClaimerLegacy_TP
 * @notice Legacy claimer shape used for canary upgrade rehearsals.
 * @dev Mirrors production pre-upgrade behavior where claimPartial is absent.
 */
contract TadzClaimerLegacy_TP is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    IERC721 public tadz;
    bytes32 public merkleRoot;
    mapping(address => uint256) public claimed;
    uint256[] public tokenIds;
    uint256 public withdrawUnlockTime;
    bool public paused;

    event Claimed(address indexed user, uint256 amount, uint256[] tokenIds);
    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event TokensDeposited(uint256 count);
    event TokensWithdrawn(address indexed to, uint256 count);

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

    function _claimResolved(address user, uint256 totalAllocation, uint256 maxAmount) internal {
        uint256 alreadyClaimed = claimed[user];
        if (totalAllocation <= alreadyClaimed) revert NothingToClaim();
        if (maxAmount == 0) revert InvalidClaimAmount();

        uint256 remaining = totalAllocation - alreadyClaimed;
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

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, totalAllocation));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();

        _claimResolved(msg.sender, totalAllocation, type(uint256).max);
    }

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

    function verifyProof(
        address user,
        uint256 totalAllocation,
        bytes32[] calldata proof
    ) external view returns (bool) {
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

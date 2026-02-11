// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IOGVaultOracle {
    function ogCount(address user) external view returns (uint256);
}

/**
 * @title FToadz
 * @notice 100k NFT collection on Flare - claim 3 per OG locked on Songbird
 * @dev UUPS upgradeable, gas-optimized for Flare's shitty limits
 */
contract FToadz is 
    Initializable, 
    ERC721Upgradeable, 
    ERC721EnumerableUpgradeable, 
    OwnableUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuardUpgradeable
{
    // ============ Constants ============
    uint256 public constant MAX_SUPPLY = 100000;
    uint256 public constant FTOADZ_PER_OG = 3;
    uint256 public constant MAX_BATCH_SIZE = 50;
    
    // ============ State ============
    string public baseURI;
    uint256 public nextTokenId;
    
    IOGVaultOracle public ogVaultOracle;
    
    mapping(address => uint256) public claimed;
    mapping(address => uint256) public stuckUserAllowance;
    mapping(address => uint256) public stuckUserClaimed;
    
    // ============ Events ============
    event Claimed(address indexed user, uint256 amount, uint256 fromId, uint256 toId);
    event StuckUserClaimed(address indexed user, uint256 amount);
    event AdminTransfer(address indexed to, uint256[] tokenIds);
    event BaseURISet(string uri);
    event OracleSet(address oracle);
    event StuckUserAllowanceSet(address indexed user, uint256 allowance);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        address _ogVaultOracle,
        string memory _baseURI,
        address raffleWallet,
        address teamWallet
    ) public initializer {
        __ERC721_init("fToadz", "FTOADZ");
        __ERC721Enumerable_init();
        __Ownable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        
        ogVaultOracle = IOGVaultOracle(_ogVaultOracle);
        baseURI = _baseURI;
        nextTokenId = 1;
        
        // Mint top 20 to raffle wallet
        for (uint256 i = 0; i < 20; i++) {
            _safeMint(raffleWallet, nextTokenId++);
        }
        
        // Mint 100 to team wallet
        for (uint256 i = 0; i < 100; i++) {
            _safeMint(teamWallet, nextTokenId++);
        }
    }
    
    // ============ Claim Functions ============
    
    /**
     * @notice Claim fToadz based on OGs locked on Songbird
     * @param amount How many to claim (user controls batch size for gas)
     */
    function claim(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(amount <= MAX_BATCH_SIZE, "Exceeds max batch size");
        
        uint256 ogLocked = ogVaultOracle.ogCount(msg.sender);
        uint256 totalEntitled = ogLocked * FTOADZ_PER_OG;
        uint256 alreadyClaimed = claimed[msg.sender];
        uint256 claimable_ = totalEntitled > alreadyClaimed ? totalEntitled - alreadyClaimed : 0;
        
        require(claimable_ > 0, "Nothing to claim");
        
        uint256 toClaim = amount > claimable_ ? claimable_ : amount;
        require(nextTokenId + toClaim - 1 <= MAX_SUPPLY, "Would exceed max supply");
        
        uint256 startId = nextTokenId;
        claimed[msg.sender] += toClaim;
        
        for (uint256 i = 0; i < toClaim; i++) {
            _safeMint(msg.sender, nextTokenId++);
        }
        
        emit Claimed(msg.sender, toClaim, startId, nextTokenId - 1);
    }
    
    /**
     * @notice Check how many fToadz user can claim
     */
    function claimable(address user) external view returns (uint256) {
        uint256 ogLocked = ogVaultOracle.ogCount(user);
        uint256 totalEntitled = ogLocked * FTOADZ_PER_OG;
        uint256 alreadyClaimed = claimed[user];
        return totalEntitled > alreadyClaimed ? totalEntitled - alreadyClaimed : 0;
    }
    
    /**
     * @notice Get user's full claim status
     */
    function getClaimStatus(address user) external view returns (
        uint256 ogLocked,
        uint256 totalEntitled,
        uint256 alreadyClaimed,
        uint256 stillClaimable
    ) {
        ogLocked = ogVaultOracle.ogCount(user);
        totalEntitled = ogLocked * FTOADZ_PER_OG;
        alreadyClaimed = claimed[user];
        stillClaimable = totalEntitled > alreadyClaimed ? totalEntitled - alreadyClaimed : 0;
    }
    
    // ============ Stuck User Claims ============
    
    /**
     * @notice Claim for users whose OGs are stuck in broken contract
     */
    function claimStuck(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(amount <= MAX_BATCH_SIZE, "Exceeds max batch size");
        
        uint256 allowance = stuckUserAllowance[msg.sender];
        uint256 alreadyClaimed = stuckUserClaimed[msg.sender];
        uint256 claimable_ = allowance > alreadyClaimed ? allowance - alreadyClaimed : 0;
        
        require(claimable_ > 0, "Nothing to claim");
        
        uint256 toClaim = amount > claimable_ ? claimable_ : amount;
        require(nextTokenId + toClaim - 1 <= MAX_SUPPLY, "Would exceed max supply");
        
        stuckUserClaimed[msg.sender] += toClaim;
        
        for (uint256 i = 0; i < toClaim; i++) {
            _safeMint(msg.sender, nextTokenId++);
        }
        
        emit StuckUserClaimed(msg.sender, toClaim);
    }
    
    /**
     * @notice Check stuck user's claimable amount
     */
    function claimableStuck(address user) external view returns (uint256) {
        uint256 allowance = stuckUserAllowance[user];
        uint256 alreadyClaimed = stuckUserClaimed[user];
        return allowance > alreadyClaimed ? allowance - alreadyClaimed : 0;
    }
    
    // ============ Admin Functions ============
    
    function setStuckUserAllowance(address user, uint256 allowance) external onlyOwner {
        stuckUserAllowance[user] = allowance;
        emit StuckUserAllowanceSet(user, allowance);
    }
    
    function setStuckUserAllowanceBatch(
        address[] calldata users, 
        uint256[] calldata allowances
    ) external onlyOwner {
        require(users.length == allowances.length, "Length mismatch");
        for (uint256 i = 0; i < users.length; i++) {
            stuckUserAllowance[users[i]] = allowances[i];
            emit StuckUserAllowanceSet(users[i], allowances[i]);
        }
    }
    
    /**
     * @notice Admin mint - mint directly to any address
     */
    function adminMint(address to, uint256 amount) external onlyOwner {
        require(amount <= MAX_BATCH_SIZE, "Exceeds max batch size");
        require(nextTokenId + amount - 1 <= MAX_SUPPLY, "Would exceed max supply");
        
        for (uint256 i = 0; i < amount; i++) {
            _safeMint(to, nextTokenId++);
        }
    }
    
    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
        emit BaseURISet(_baseURI);
    }
    
    function setOGVaultOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        ogVaultOracle = IOGVaultOracle(_oracle);
        emit OracleSet(_oracle);
    }
    
    function adjustClaimed(address user, uint256 newAmount) external onlyOwner {
        claimed[user] = newAmount;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token doesn't exist");
        return string(abi.encodePacked(baseURI, _toString(tokenId), ".json"));
    }
    
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
    
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - nextTokenId + 1;
    }
    
    // ============ Required Overrides ============
    
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721Upgradeable, ERC721EnumerableUpgradeable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }
    
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
    
    // ============ Utils ============
    
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

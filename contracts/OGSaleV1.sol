// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title OGSaleV1
 * @notice Inventory-backed OG sale contract with per-collection bonding curves and bundle discount.
 * @dev Contract holds NFTs in escrow and sells them using linear curve pricing.
 */
contract OGSaleV1 is Ownable, ReentrancyGuard, Pausable {
    struct CollectionConfig {
        bool enabled;
        uint64 sold;
        uint128 basePriceWei;
        uint128 stepPriceWei;
    }

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_BUNDLE_DISCOUNT_BPS = 3_000; // 30% hard cap.

    address public treasury;
    uint16 public bundleDiscountBps = 1_000; // 10%

    mapping(address => CollectionConfig) public collections;
    mapping(address => bool) private isKnownCollection;
    mapping(address => uint256[]) private inventoryByCollection;
    address[] private collectionList;

    event CollectionConfigured(
        address indexed collection,
        bool enabled,
        uint256 basePriceWei,
        uint256 stepPriceWei
    );
    event InventoryDeposited(address indexed collection, uint256 count);
    event SinglePurchased(
        address indexed buyer,
        address indexed collection,
        uint256 indexed tokenId,
        uint256 pricePaid
    );
    event BundlePurchased(
        address indexed buyer,
        address[] collections,
        uint256[] tokenIds,
        uint256 rawPrice,
        uint256 discountedPrice
    );
    event BundleDiscountUpdated(uint16 oldDiscountBps, uint16 newDiscountBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event Withdrawn(address indexed to, uint256 amount);
    event InventoryRescued(address indexed collection, uint256 indexed tokenId, address indexed to);

    constructor(address _owner, address _treasury) {
        require(_owner != address(0), "owner=0");
        require(_treasury != address(0), "treasury=0");
        _transferOwnership(_owner);
        treasury = _treasury;
    }

    // ==================== Admin ====================

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury=0");
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function setBundleDiscountBps(uint16 _discountBps) external onlyOwner {
        require(_discountBps <= MAX_BUNDLE_DISCOUNT_BPS, "discount too high");
        uint16 old = bundleDiscountBps;
        bundleDiscountBps = _discountBps;
        emit BundleDiscountUpdated(old, _discountBps);
    }

    function configureCollection(
        address collection,
        bool enabled,
        uint128 basePriceWei,
        uint128 stepPriceWei
    ) external onlyOwner {
        require(collection != address(0), "collection=0");
        if (!isKnownCollection[collection]) {
            isKnownCollection[collection] = true;
            collectionList.push(collection);
        }

        CollectionConfig storage cfg = collections[collection];
        cfg.enabled = enabled;
        cfg.basePriceWei = basePriceWei;
        cfg.stepPriceWei = stepPriceWei;

        emit CollectionConfigured(collection, enabled, basePriceWei, stepPriceWei);
    }

    function depositBatch(address collection, uint256[] calldata tokenIds) external onlyOwner nonReentrant {
        require(isKnownCollection[collection], "unknown collection");
        require(tokenIds.length > 0, "empty");

        IERC721 nft = IERC721(collection);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            nft.transferFrom(msg.sender, address(this), tokenIds[i]);
            inventoryByCollection[collection].push(tokenIds[i]);
        }

        emit InventoryDeposited(collection, tokenIds.length);
    }

    function rescueInventory(address collection, uint256 tokenId, address to) external onlyOwner nonReentrant {
        require(to != address(0), "to=0");
        uint256[] storage inventory = inventoryByCollection[collection];
        bool found = false;
        for (uint256 i = 0; i < inventory.length; i++) {
            if (inventory[i] == tokenId) {
                inventory[i] = inventory[inventory.length - 1];
                inventory.pop();
                found = true;
                break;
            }
        }
        require(found, "not in inventory");

        IERC721(collection).transferFrom(address(this), to, tokenId);
        emit InventoryRescued(collection, tokenId, to);
    }

    function withdrawNative(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "to=0");
        require(amount <= address(this).balance, "insufficient");
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdrawn(to, amount);
    }

    // ==================== View ====================

    function getCollections() external view returns (address[] memory) {
        return collectionList;
    }

    function inventoryCount(address collection) public view returns (uint256) {
        return inventoryByCollection[collection].length;
    }

    function getCollectionInfo(address collection) external view returns (
        bool enabled,
        uint64 sold,
        uint256 inventory,
        uint128 basePriceWei,
        uint128 stepPriceWei
    ) {
        CollectionConfig memory cfg = collections[collection];
        enabled = cfg.enabled;
        sold = cfg.sold;
        inventory = inventoryByCollection[collection].length;
        basePriceWei = cfg.basePriceWei;
        stepPriceWei = cfg.stepPriceWei;
    }

    function quoteCurrent(address collection) public view returns (uint256) {
        CollectionConfig memory cfg = collections[collection];
        return uint256(cfg.basePriceWei) + (uint256(cfg.stepPriceWei) * uint256(cfg.sold));
    }

    function quoteBuy(address collection, uint256 quantity) public view returns (uint256) {
        require(quantity > 0, "qty=0");
        CollectionConfig memory cfg = collections[collection];
        uint256 soldNow = uint256(cfg.sold);
        uint256 base = uint256(cfg.basePriceWei);
        uint256 step = uint256(cfg.stepPriceWei);

        // Arithmetic progression: sum_{i=0}^{q-1} [base + step*(sold+i)]
        // = q*(2*base + step*(2*sold + q - 1))/2
        uint256 q = quantity;
        uint256 sum = q * (2 * base + step * (2 * soldNow + q - 1)) / 2;
        return sum;
    }

    function quoteBundle(address[] calldata bundleCollections) public view returns (uint256 rawPrice, uint256 discountedPrice) {
        require(bundleCollections.length > 0, "empty bundle");
        for (uint256 i = 0; i < bundleCollections.length; i++) {
            rawPrice += quoteBuy(bundleCollections[i], 1);
        }
        discountedPrice = (rawPrice * (BPS_DENOMINATOR - bundleDiscountBps)) / BPS_DENOMINATOR;
    }

    // ==================== Buy ====================

    function buySingle(address collection, uint256 maxPrice) external payable nonReentrant whenNotPaused {
        require(collections[collection].enabled, "collection disabled");
        require(inventoryByCollection[collection].length > 0, "sold out");

        uint256 price = quoteBuy(collection, 1);
        require(price <= maxPrice, "slippage");
        require(msg.value >= price, "insufficient payment");

        collections[collection].sold += 1;

        uint256 tokenId = _popInventory(collection);
        IERC721(collection).transferFrom(address(this), msg.sender, tokenId);

        _payoutAndRefund(price);
        emit SinglePurchased(msg.sender, collection, tokenId, price);
    }

    function buyBundle(address[] calldata bundleCollections, uint256 maxPrice) external payable nonReentrant whenNotPaused {
        require(bundleCollections.length > 0, "empty bundle");

        for (uint256 i = 0; i < bundleCollections.length; i++) {
            address collection = bundleCollections[i];
            require(collections[collection].enabled, "collection disabled");
            require(inventoryByCollection[collection].length > 0, "sold out");
        }

        (uint256 rawPrice, uint256 discountedPrice) = quoteBundle(bundleCollections);
        require(discountedPrice <= maxPrice, "slippage");
        require(msg.value >= discountedPrice, "insufficient payment");

        uint256[] memory tokenIds = new uint256[](bundleCollections.length);
        for (uint256 i = 0; i < bundleCollections.length; i++) {
            address collection = bundleCollections[i];
            collections[collection].sold += 1;
            uint256 tokenId = _popInventory(collection);
            tokenIds[i] = tokenId;
            IERC721(collection).transferFrom(address(this), msg.sender, tokenId);
        }

        _payoutAndRefund(discountedPrice);
        emit BundlePurchased(msg.sender, bundleCollections, tokenIds, rawPrice, discountedPrice);
    }

    // ==================== Internal ====================

    function _popInventory(address collection) internal returns (uint256 tokenId) {
        uint256[] storage inventory = inventoryByCollection[collection];
        uint256 idx = inventory.length - 1;
        tokenId = inventory[idx];
        inventory.pop();
    }

    function _payoutAndRefund(uint256 requiredAmount) internal {
        (bool paid, ) = payable(treasury).call{value: requiredAmount}("");
        require(paid, "treasury transfer failed");

        uint256 refund = msg.value - requiredAmount;
        if (refund > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: refund}("");
            require(refunded, "refund failed");
        }
    }
}

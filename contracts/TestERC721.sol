// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC721 is ERC721, Ownable {
    uint256 public nextTokenId = 1;

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
    }

    function mintBatch(address to, uint256 count) external onlyOwner returns (uint256 firstId, uint256 lastId) {
        require(count > 0, "count=0");
        firstId = nextTokenId;
        for (uint256 i = 0; i < count; i++) {
            _safeMint(to, nextTokenId++);
        }
        lastId = nextTokenId - 1;
    }
}

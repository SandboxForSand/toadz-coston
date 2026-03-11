const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OGSaleV1", function () {
  async function deployFixture() {
    const [owner, treasury, buyer] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory("TestERC721");
    const stoadz = await NFT.deploy("sToadz", "STOADZ");
    const lofts = await NFT.deploy("Lofts", "LOFTS");
    await stoadz.waitForDeployment();
    await lofts.waitForDeployment();

    const Sale = await ethers.getContractFactory("OGSaleV1");
    const sale = await Sale.deploy(owner.address, treasury.address);
    await sale.waitForDeployment();

    const stoadzAddr = await stoadz.getAddress();
    const loftsAddr = await lofts.getAddress();
    const saleAddr = await sale.getAddress();

    await sale.configureCollection(
      stoadzAddr,
      true,
      ethers.parseEther("1"),
      ethers.parseEther("0.1")
    );
    await sale.configureCollection(
      loftsAddr,
      true,
      ethers.parseEther("2"),
      ethers.parseEther("0.2")
    );

    await stoadz.mintBatch(owner.address, 5);
    await lofts.mintBatch(owner.address, 5);
    await stoadz.setApprovalForAll(saleAddr, true);
    await lofts.setApprovalForAll(saleAddr, true);
    await sale.depositBatch(stoadzAddr, [1, 2, 3, 4, 5]);
    await sale.depositBatch(loftsAddr, [1, 2, 3, 4, 5]);

    return { owner, treasury, buyer, sale, stoadz, lofts, stoadzAddr, loftsAddr };
  }

  it("quotes and buys single with curve increment", async function () {
    const { buyer, treasury, sale, stoadz, stoadzAddr } = await deployFixture();

    const quote1 = await sale.quoteCurrent(stoadzAddr);
    expect(quote1).to.equal(ethers.parseEther("1"));

    const treasuryStart = await ethers.provider.getBalance(treasury.address);
    await sale.connect(buyer).buySingle(stoadzAddr, quote1, { value: quote1 });

    expect(await stoadz.ownerOf(5)).to.equal(buyer.address); // LIFO pop.
    const info = await sale.getCollectionInfo(stoadzAddr);
    expect(info.sold).to.equal(1n);
    expect(info.inventory).to.equal(4n);

    const quote2 = await sale.quoteCurrent(stoadzAddr);
    expect(quote2).to.equal(ethers.parseEther("1.1"));

    const treasuryEnd = await ethers.provider.getBalance(treasury.address);
    expect(treasuryEnd - treasuryStart).to.equal(quote1);
  });

  it("applies bundle discount and transfers one from each collection", async function () {
    const { buyer, sale, stoadz, lofts, stoadzAddr, loftsAddr } = await deployFixture();

    const [raw, discounted] = await sale.quoteBundle([stoadzAddr, loftsAddr]);
    expect(raw).to.equal(ethers.parseEther("3")); // 1 + 2
    expect(discounted).to.equal(ethers.parseEther("2.7")); // 10% off

    await sale.connect(buyer).buyBundle([stoadzAddr, loftsAddr], discounted, { value: discounted });

    expect(await stoadz.ownerOf(5)).to.equal(buyer.address);
    expect(await lofts.ownerOf(5)).to.equal(buyer.address);

    const sInfo = await sale.getCollectionInfo(stoadzAddr);
    const lInfo = await sale.getCollectionInfo(loftsAddr);
    expect(sInfo.sold).to.equal(1n);
    expect(lInfo.sold).to.equal(1n);
  });

  it("reverts when collection disabled", async function () {
    const { buyer, sale, stoadzAddr } = await deployFixture();
    await sale.configureCollection(stoadzAddr, false, ethers.parseEther("1"), ethers.parseEther("0.1"));
    const quote = await sale.quoteBuy(stoadzAddr, 1);
    await expect(
      sale.connect(buyer).buySingle(stoadzAddr, quote, { value: quote })
    ).to.be.revertedWith("collection disabled");
  });
});


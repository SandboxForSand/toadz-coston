const { ethers } = require("hardhat");

const COSTON2 = {
  WFLR: "0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273",
  BUFFER: "0xB5cF60df70BDD3E343f7A4be2053140b26273427",
};

async function main() {
  const amountText = process.env.BUFFER_TOPUP_FLR || process.argv[2] || "10";
  const amountWei = ethers.parseEther(amountText);
  const gasReserve = ethers.parseEther("0.03");

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  const nativeBal = await ethers.provider.getBalance(signerAddr);

  console.log("network:", (await ethers.provider.getNetwork()).name);
  console.log("signer:", signerAddr);
  console.log("native C2FLR:", ethers.formatEther(nativeBal));
  console.log("topup C2FLR:", amountText);

  if (nativeBal <= amountWei + gasReserve) {
    const maxWrap = nativeBal > gasReserve ? nativeBal - gasReserve : 0n;
    throw new Error(
      `Insufficient C2FLR for wrap+gas. Max wrap now: ${ethers.formatEther(maxWrap)}`
    );
  }

  const wflr = await ethers.getContractAt(
    [
      "function deposit() external payable",
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
    ],
    COSTON2.WFLR,
    signer
  );

  const bufferBalBefore = await wflr.balanceOf(COSTON2.BUFFER);
  console.log("buffer WFLR before:", ethers.formatEther(bufferBalBefore));

  const wrapTx = await wflr.deposit({ value: amountWei });
  console.log("wrap tx:", wrapTx.hash);
  await wrapTx.wait();

  const sendTx = await wflr.transfer(COSTON2.BUFFER, amountWei);
  console.log("transfer tx:", sendTx.hash);
  await sendTx.wait();

  const bufferBalAfter = await wflr.balanceOf(COSTON2.BUFFER);
  console.log("buffer WFLR after:", ethers.formatEther(bufferBalAfter));
  console.log("delta:", ethers.formatEther(bufferBalAfter - bufferBalBefore));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


const { ethers, upgrades, network } = require("hardhat");

const MARKET_PROXY = "0xa36a221F9BAc3691BfD69A23AB67d2f6F7F40A7d";

async function main() {
  if (network.name !== "flare") {
    throw new Error("Run with --network flare");
  }

  const [signer] = await ethers.getSigners();
  const admin = await upgrades.erc1967.getAdminAddress(MARKET_PROXY);
  const impl = await upgrades.erc1967.getImplementationAddress(MARKET_PROXY);
  const iface = new ethers.Interface(["function listingFlrPerSlot() view returns (uint256)"]);
  const data = iface.encodeFunctionData("listingFlrPerSlot", []);

  console.log("signer:", signer.address);
  console.log("proxy:", MARKET_PROXY);
  console.log("admin:", admin);
  console.log("impl:", impl);

  try {
    const out = await ethers.provider.call({ to: MARKET_PROXY, data });
    const [val] = iface.decodeFunctionResult("listingFlrPerSlot", out);
    console.log("provider.call listingFlrPerSlot:", val.toString());
  } catch (err) {
    console.log("provider.call revert:", err?.shortMessage || err?.message || err);
  }

  const contract = new ethers.Contract(MARKET_PROXY, ["function listingFlrPerSlot() view returns (uint256)"], signer);
  try {
    const val = await contract.listingFlrPerSlot();
    console.log("signer call listingFlrPerSlot:", val.toString());
  } catch (err) {
    console.log("signer call revert:", err?.shortMessage || err?.message || err);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

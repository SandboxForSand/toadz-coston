const { ethers, upgrades, artifacts } = require("hardhat");

const TARGETS = [
  {
    name: "ToadzStake",
    proxy: "0xd973E756fCcB640108aAf17B3465a387802A6E49",
    contract: "ToadzStake"
  },
  {
    name: "POND",
    proxy: "0x410c65DAb32709046B1BA63caBEB4d2824D9E902",
    contract: "POND"
  }
];

function stripMetadata(bytecode) {
  if (!bytecode || bytecode === "0x") return "0x";
  if (bytecode.length < 6) return bytecode.toLowerCase();

  const lengthHex = bytecode.slice(-4);
  const metadataBytes = Number.parseInt(lengthHex, 16);
  if (!Number.isFinite(metadataBytes)) return bytecode.toLowerCase();

  const metadataHexLength = metadataBytes * 2;
  const totalTrim = metadataHexLength + 4;
  if (bytecode.length <= totalTrim) return bytecode.toLowerCase();

  return bytecode.slice(0, -totalTrim).toLowerCase();
}

async function main() {
  for (const target of TARGETS) {
    const impl = await upgrades.erc1967.getImplementationAddress(target.proxy);
    const onchainBytecode = await ethers.provider.getCode(impl);
    const artifact = await artifacts.readArtifact(target.contract);
    const localBytecode = artifact.deployedBytecode;

    const onchainNorm = stripMetadata(onchainBytecode);
    const localNorm = stripMetadata(localBytecode);

    const onchainHash = ethers.keccak256(onchainNorm);
    const localHash = ethers.keccak256(localNorm);

    console.log(`\n=== ${target.name} ===`);
    console.log("Proxy:", target.proxy);
    console.log("Implementation:", impl);
    console.log("Onchain hash:", onchainHash);
    console.log("Local hash:  ", localHash);
    console.log("Match:", onchainHash === localHash);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

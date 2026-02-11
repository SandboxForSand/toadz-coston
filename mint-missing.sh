#!/bin/bash

# Mint missing Tadz from missing-tokens.json

TADZ="0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6"
CLAIMER="0x08e687aC00311F4683eBEbEc0d234193EA9AD319"
RPC="https://flare-api.flare.network/ext/C/rpc"

# Read missing tokens and mint in batches of 50
node -e "
const missing = require('./missing-tokens.json');
const BATCH = 50;
for (let i = 0; i < missing.length; i += BATCH) {
  const batch = missing.slice(i, i + BATCH);
  console.log('[' + batch.join(',') + ']');
}
" | while read IDS; do
  echo "Minting batch..."
  cast send $TADZ "mintBatch(address,uint256[])" $CLAIMER "$IDS" \
    --rpc-url $RPC \
    --private-key $PRIVATE_KEY \
    --gas-limit 10000000
  sleep 2
done

echo "Done minting!"

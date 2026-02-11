#!/bin/bash

# Deposit missing tokens from missing-tokens.json to claimer

CLAIMER="0x08e687aC00311F4683eBEbEc0d234193EA9AD319"
RPC="https://flare-api.flare.network/ext/C/rpc"

node -e "
const missing = require('./missing-tokens.json');
const BATCH = 100;
for (let i = 0; i < missing.length; i += BATCH) {
  const batch = missing.slice(i, i + BATCH);
  console.log(JSON.stringify(batch));
}
" | while read batch; do
  echo "Depositing batch..."
  cast send $CLAIMER "depositTokenIds(uint256[])" "$batch" \
    --rpc-url $RPC \
    --private-key $PRIVATE_KEY \
    --gas-limit 5000000
  sleep 1
done

echo "Done!"

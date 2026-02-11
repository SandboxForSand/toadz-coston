#!/bin/bash

# Mint Tadz to claimer in batches of 50
# Current: 1080 minted, need up to 91020 (90k for claims)

TADZ="0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6"
CLAIMER="0x08e687aC00311F4683eBEbEc0d234193EA9AD319"
RPC="https://flare-api.flare.network/ext/C/rpc"

START=1081
END=91020
BATCH=50

for ((i=START; i<=END; i+=BATCH)); do
  # Build array of token IDs
  IDS="["
  for ((j=i; j<i+BATCH && j<=END; j++)); do
    if [ $j -gt $i ]; then
      IDS+=","
    fi
    IDS+="$j"
  done
  IDS+="]"
  
  echo "Minting $i to $((i+BATCH-1))..."
  
  cast send $TADZ "mintBatch(address,uint256[])" $CLAIMER "$IDS" \
    --rpc-url $RPC \
    --private-key $PRIVATE_KEY \
    --gas-limit 10000000
  
  # Small delay between batches
  sleep 2
done

echo "Done!"

#!/bin/bash

# Mint remaining Tadz to claimer in batches of 50
# Already minted: 1-47280
# Need to mint: 47281 to 91020

TADZ="0xbaa8344f4a383796695C1F9f3aFE1eaFfdCfeaE6"
CLAIMER="0x08e687aC00311F4683eBEbEc0d234193EA9AD319"
RPC="https://flare-api.flare.network/ext/C/rpc"

START=47281
END=91020
BATCH=50

for ((i=START; i<=END; i+=BATCH)); do
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
  
  sleep 2
done

echo "Done minting! Now run deposit script."

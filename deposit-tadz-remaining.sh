#!/bin/bash

# Deposit remaining token IDs to claimer
# Already deposited: 1031-47280
# Need to deposit: 47281 to 91020

CLAIMER="0x08e687aC00311F4683eBEbEc0d234193EA9AD319"
RPC="https://flare-api.flare.network/ext/C/rpc"

START=47281
END=91020
BATCH=100

for ((i=START; i<=END; i+=BATCH)); do
  IDS="["
  for ((j=i; j<i+BATCH && j<=END; j++)); do
    if [ $j -gt $i ]; then
      IDS+=","
    fi
    IDS+="$j"
  done
  IDS+="]"
  
  echo "Depositing $i to $((i+BATCH-1))..."
  
  cast send $CLAIMER "depositTokenIds(uint256[])" "$IDS" \
    --rpc-url $RPC \
    --private-key $PRIVATE_KEY \
    --gas-limit 5000000
  
  sleep 1
done

echo "Done!"

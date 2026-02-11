#!/bin/bash

# Deposit token IDs to claimer in batches of 100
# Already deposited: 1021-1030 (10 tokens) and claimed 3 (1028-1030)
# Need to deposit: 1031 to 47280

CLAIMER="0x08e687aC00311F4683eBEbEc0d234193EA9AD319"
RPC="https://flare-api.flare.network/ext/C/rpc"

START=1031
END=47280
BATCH=100

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
  
  echo "Depositing $i to $((i+BATCH-1))..."
  
  cast send $CLAIMER "depositTokenIds(uint256[])" "$IDS" \
    --rpc-url $RPC \
    --private-key $PRIVATE_KEY \
    --gas-limit 5000000
  
  sleep 1
done

echo "Done!"

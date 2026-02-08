#!/bin/bash
# Deploy all Chance Staking contracts to Injective Testnet.
#
# Deployment order:
#   1. drand-oracle       (no contract dependencies)
#   2. reward-distributor  (needs drand_oracle address)
#   3. staking-hub         (needs reward_distributor + drand_oracle addresses)
#
# Prerequisites:
#   - injectived CLI installed and on PATH
#   - Wasm artifacts built (run the CosmWasm optimizer first)
#   - A funded testnet key named "$FROM" in injectived keyring

set -uo pipefail

################################################################################
#                                 CONFIGURATION                                #
################################################################################

# -- Blockchain --
NODE="https://testnet.sentry.tm.injective.network:443"
CHAIN_ID="injective-888"
FEES="1500000000000000inj"
GAS="3800000"

# -- Keystore --
FROM="testnet"
PASSWORD="12345678"

# -- Addresses --
ADMIN_ADDRESS="inj1q2m26a7jdzjyfdn545vqsude3zwwtfrdap5jgz"
OPERATOR_ADDRESS="inj1q2m26a7jdzjyfdn545vqsude3zwwtfrdap5jgz"
TREASURY_ADDRESS="inj1q2m26a7jdzjyfdn545vqsude3zwwtfrdap5jgz"

# -- Validators to delegate to --
VALIDATOR_1="injvaloper1h5u937etuat5hnr2s34yaaalfpkkscl587w3v6"
VALIDATOR_2="injvaloper156t3yxd4udv0h9gwagfcmwnmm3quy0nph7tyh5"

# -- Drand quicknet config --
QUICKNET_PUBKEY_HEX="83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"
QUICKNET_CHAIN_HASH="52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
QUICKNET_GENESIS_TIME=1692803367
QUICKNET_PERIOD_SECONDS=3

# -- Reward distributor config --
REVEAL_DEADLINE_SECONDS=180

# -- Staking hub config --
EPOCH_DURATION_SECONDS=120
PROTOCOL_FEE_BPS=500
BASE_YIELD_BPS=500
REGULAR_POOL_BPS=7000
BIG_POOL_BPS=2000
CSINJ_SUBDENOM="csINJ"

# -- Wasm artifacts --
DRAND_ORACLE_WASM="./artifacts/chance_drand_oracle.wasm"
REWARD_DISTRIBUTOR_WASM="./artifacts/chance_reward_distributor.wasm"
STAKING_HUB_WASM="./artifacts/chance_staking_hub.wasm"

# -- Optional: reuse existing code IDs (set to skip uploading) --
# If set, the script will skip storing that contract's wasm and use the given ID.
# Leave empty to upload fresh.
EXISTING_DRAND_CODE_ID="39232"
EXISTING_DISTRIBUTOR_CODE_ID="39233"
EXISTING_STAKING_HUB_CODE_ID="39234"

################################################################################
#                                   HELPERS                                    #
################################################################################

# Store a wasm binary and echo the code ID.
store_code() {
    local wasm_file="$1"
    local label="$2"

    if [ ! -f "$wasm_file" ]; then
        echo "  ERROR: Wasm file not found: $wasm_file" >&2
        exit 1
    fi

    echo "  Storing $label..." >&2
    local store_response
    store_response=$(yes "$PASSWORD" | injectived tx wasm store "$wasm_file" \
        --from="$FROM" \
        --chain-id="$CHAIN_ID" \
        --yes --fees="$FEES" --gas="$GAS" \
        --node="$NODE" --output text 2>&1)

    if ! echo "$store_response" | grep -q "txhash"; then
        echo "  ERROR: Failed to submit store transaction for $label." >&2
        echo "$store_response" >&2
        exit 1
    fi

    local txhash
    txhash=$(echo "$store_response" | grep 'txhash:' | awk '{print $2}')
    echo "  > Store tx: $txhash" >&2
    echo "  > Waiting for indexing..." >&2
    sleep 8

    local query_output
    query_output=$(injectived query tx "$txhash" --node="$NODE" --output text 2>&1)

    # Parsing Code ID:
    # 1. Grep for "key: code_id" and the next line
    # 2. Grep for "value:"
    # 3. Awk to get the last field (the ID)
    # 4. Head -n 1 to ensure we only get the FIRST match (avoids duplicates)
    # 5. tr to remove double quotes and single quotes
    local code_id
    code_id=$(echo "$query_output" | grep -A 1 'key: code_id' | grep 'value:' | awk '{print $NF}' | head -n 1 | tr -d '"' | tr -d "'")

    if [ -z "$code_id" ]; then
        echo "  ERROR: Could not extract Code ID for $label from tx: $txhash" >&2
        echo "  Raw output:" >&2
        echo "$query_output" >&2
        exit 1
    fi

    echo "  Code ID: $code_id" >&2
    echo "$code_id"
}

# Instantiate a contract and echo the contract address.
# Usage: instantiate_contract <code_id> <init_msg> <label> [amount]
instantiate_contract() {
    local code_id="$1"
    local init_msg="$2"
    local label="$3"
    local amount="${4:-}"

    local amount_flag=""
    if [ -n "$amount" ]; then
        amount_flag="--amount=$amount"
        echo "  > Sending $amount with instantiation" >&2
    fi

    echo "  Instantiating $label (code $code_id)..." >&2
    local inst_response
    inst_response=$(yes "$PASSWORD" | injectived tx wasm instantiate "$code_id" "$init_msg" \
        --label="$label" \
        --admin="$ADMIN_ADDRESS" \
        --from="$FROM" \
        --chain-id="$CHAIN_ID" \
        --yes --fees="$FEES" --gas="$GAS" \
        $amount_flag \
        --node="$NODE" --output text 2>&1)

    if ! echo "$inst_response" | grep -q "txhash"; then
        echo "  ERROR: Failed to submit instantiate transaction for $label." >&2
        echo "$inst_response" >&2
        exit 1
    fi

    local txhash
    txhash=$(echo "$inst_response" | grep 'txhash:' | awk '{print $2}')
    echo "  > Instantiate tx: $txhash" >&2
    echo "  > Waiting for indexing..." >&2
    sleep 8

    local query_output
    query_output=$(injectived query tx "$txhash" --node="$NODE" --output text 2>&1)

    # Parsing Contract Address:
    # 1. Grep for "key: _contract_address"
    # 2. Get value line
    # 3. Awk last field
    # 4. Head -n 1 to avoid duplicates from multiple events
    # 5. tr to clean quotes
    local contract_address
    contract_address=$(echo "$query_output" | grep -A 1 'key: _contract_address' | grep 'value:' | awk '{print $NF}' | head -n 1 | tr -d '"' | tr -d "'")

    if [[ -z "$contract_address" || "$contract_address" != inj* ]]; then
        echo "  ERROR: Could not extract contract address for $label from tx: $txhash" >&2
        echo "  Raw output snippet:" >&2
        echo "$query_output" | grep -A 5 "instantiate" >&2
        exit 1
    fi

    echo "  Contract address: $contract_address" >&2
    echo "$contract_address"
}

################################################################################
#                                 DEPLOY FLOW                                  #
################################################################################

echo ""
echo "================================================="
echo "  CHANCE STAKING - TESTNET DEPLOYMENT"
echo "================================================="
echo ""
echo "  Chain:     $CHAIN_ID"
echo "  Node:      $NODE"
echo "  Signer:    $FROM"
echo ""

# ── 1. Store all wasm codes ──────────────────────────────────────────────────

echo "-------------------------------------------------"
echo "  STEP 1: Storing Wasm codes"
echo "-------------------------------------------------"

if [ -n "$EXISTING_DRAND_CODE_ID" ]; then
    DRAND_CODE_ID="$EXISTING_DRAND_CODE_ID"
    echo "  Reusing existing drand-oracle code ID: $DRAND_CODE_ID"
else
    DRAND_CODE_ID=$(store_code "$DRAND_ORACLE_WASM" "drand-oracle")
fi
echo ""

if [ -n "$EXISTING_DISTRIBUTOR_CODE_ID" ]; then
    DISTRIBUTOR_CODE_ID="$EXISTING_DISTRIBUTOR_CODE_ID"
    echo "  Reusing existing reward-distributor code ID: $DISTRIBUTOR_CODE_ID"
else
    DISTRIBUTOR_CODE_ID=$(store_code "$REWARD_DISTRIBUTOR_WASM" "reward-distributor")
fi
echo ""

if [ -n "$EXISTING_STAKING_HUB_CODE_ID" ]; then
    STAKING_HUB_CODE_ID="$EXISTING_STAKING_HUB_CODE_ID"
    echo "  Reusing existing staking-hub code ID: $STAKING_HUB_CODE_ID"
else
    STAKING_HUB_CODE_ID=$(store_code "$STAKING_HUB_WASM" "staking-hub")
fi
echo ""

echo "  Code IDs:"
echo "    drand-oracle:       $DRAND_CODE_ID"
echo "    reward-distributor: $DISTRIBUTOR_CODE_ID"
echo "    staking-hub:        $STAKING_HUB_CODE_ID"
echo ""

# ── 2. Instantiate drand-oracle ─────────────────────────────────────────────

echo "-------------------------------------------------"
echo "  STEP 2: Instantiating drand-oracle"
echo "-------------------------------------------------"

DRAND_INIT_MSG=$(cat <<EOF
{
  "operators": ["$OPERATOR_ADDRESS"],
  "quicknet_pubkey_hex": "$QUICKNET_PUBKEY_HEX",
  "chain_hash": "$QUICKNET_CHAIN_HASH",
  "genesis_time": $QUICKNET_GENESIS_TIME,
  "period_seconds": $QUICKNET_PERIOD_SECONDS
}
EOF
)
DRAND_INIT_MSG=$(echo "$DRAND_INIT_MSG" | tr -d '\n' | tr -s ' ')

DRAND_ORACLE_ADDRESS=$(instantiate_contract "$DRAND_CODE_ID" "$DRAND_INIT_MSG" "Chance Drand Oracle v1.0")
echo ""

# ── 3. Instantiate reward-distributor ───────────────────────────────────────

echo "-------------------------------------------------"
echo "  STEP 3: Instantiating reward-distributor"
echo "-------------------------------------------------"

DISTRIBUTOR_INIT_MSG=$(cat <<EOF
{
  "operator": "$OPERATOR_ADDRESS",
  "staking_hub": "$ADMIN_ADDRESS",
  "drand_oracle": "$DRAND_ORACLE_ADDRESS",
  "reveal_deadline_seconds": $REVEAL_DEADLINE_SECONDS
}
EOF
)
DISTRIBUTOR_INIT_MSG=$(echo "$DISTRIBUTOR_INIT_MSG" | tr -d '\n' | tr -s ' ')

REWARD_DISTRIBUTOR_ADDRESS=$(instantiate_contract "$DISTRIBUTOR_CODE_ID" "$DISTRIBUTOR_INIT_MSG" "Chance Reward Distributor v1.0")
echo ""

# ── 4. Instantiate staking-hub ──────────────────────────────────────────────

echo "-------------------------------------------------"
echo "  STEP 4: Instantiating staking-hub"
echo "-------------------------------------------------"

STAKING_HUB_INIT_MSG=$(cat <<EOF
{
  "operator": "$OPERATOR_ADDRESS",
  "reward_distributor": "$REWARD_DISTRIBUTOR_ADDRESS",
  "drand_oracle": "$DRAND_ORACLE_ADDRESS",
  "validators": ["$VALIDATOR_1", "$VALIDATOR_2"],
  "epoch_duration_seconds": $EPOCH_DURATION_SECONDS,
  "protocol_fee_bps": $PROTOCOL_FEE_BPS,
  "treasury": "$TREASURY_ADDRESS",
  "base_yield_bps": $BASE_YIELD_BPS,
  "regular_pool_bps": $REGULAR_POOL_BPS,
  "big_pool_bps": $BIG_POOL_BPS,
  "csinj_subdenom": "$CSINJ_SUBDENOM"
}
EOF
)
STAKING_HUB_INIT_MSG=$(echo "$STAKING_HUB_INIT_MSG" | tr -d '\n' | tr -s ' ')

# Token Factory denom creation requires 1 INJ fee on testnet (0.1 INJ on mainnet)
STAKING_HUB_ADDRESS=$(instantiate_contract "$STAKING_HUB_CODE_ID" "$STAKING_HUB_INIT_MSG" "Chance Staking Hub v1.0" "1000000000000000000inj")
echo ""

# ── 5. Update reward-distributor ────────────────────────────────────────────

echo "-------------------------------------------------"
echo "  STEP 5: Updating reward-distributor staking_hub"
echo "-------------------------------------------------"

echo "  Updating reward-distributor staking_hub to: $STAKING_HUB_ADDRESS"

UPDATE_CONFIG_MSG=$(cat <<EOF
{
  "update_config": {
    "staking_hub": "$STAKING_HUB_ADDRESS"
  }
}
EOF
)
UPDATE_CONFIG_MSG=$(echo "$UPDATE_CONFIG_MSG" | tr -d '\n' | tr -s ' ')

UPDATE_RESPONSE=$(yes "$PASSWORD" | injectived tx wasm execute "$REWARD_DISTRIBUTOR_ADDRESS" "$UPDATE_CONFIG_MSG" \
    --from="$FROM" \
    --chain-id="$CHAIN_ID" \
    --yes --fees="$FEES" --gas="$GAS" \
    --node="$NODE" --output text 2>&1)

if ! echo "$UPDATE_RESPONSE" | grep -q "txhash"; then
    echo "  ERROR: Failed to submit UpdateConfig transaction."
    echo "$UPDATE_RESPONSE"
    exit 1
fi

UPDATE_TXHASH=$(echo "$UPDATE_RESPONSE" | grep 'txhash:' | awk '{print $2}')
echo "  > UpdateConfig tx: $UPDATE_TXHASH"
echo "  > Waiting for indexing..."
sleep 8

# Verify the update succeeded
VERIFY_OUTPUT=$(injectived query tx "$UPDATE_TXHASH" --node="$NODE" --output text 2>&1)
if echo "$VERIFY_OUTPUT" | grep -q "code: 0"; then
    echo "  reward-distributor staking_hub updated successfully."
else
    echo "  WARNING: UpdateConfig tx may have failed. Check tx: $UPDATE_TXHASH"
fi
echo ""

################################################################################
#                              DEPLOYMENT SUMMARY                              #
################################################################################

echo "================================================="
echo "  DEPLOYMENT COMPLETE"
echo "================================================="
echo ""
printf "  %-28s %s\n" "drand-oracle code ID:" "$DRAND_CODE_ID"
printf "  %-28s %s\n" "drand-oracle address:" "$DRAND_ORACLE_ADDRESS"
echo ""
printf "  %-28s %s\n" "reward-distributor code ID:" "$DISTRIBUTOR_CODE_ID"
printf "  %-28s %s\n" "reward-distributor address:" "$REWARD_DISTRIBUTOR_ADDRESS"
echo ""
printf "  %-28s %s\n" "staking-hub code ID:" "$STAKING_HUB_CODE_ID"
printf "  %-28s %s\n" "staking-hub address:" "$STAKING_HUB_ADDRESS"
echo ""
echo "================================================="

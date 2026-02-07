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
VALIDATOR_1="injvaloper1ultw9r29l8nxy5u6thcgusjn95vsy2caw722q5"
VALIDATOR_2="injvaloper1qdcgqaae4v2zz99hq0g60yqt6qhxm4g0d5mrf7"

# -- Drand quicknet config --
QUICKNET_PUBKEY_HEX="83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"
QUICKNET_CHAIN_HASH="52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
QUICKNET_GENESIS_TIME=1692803367
QUICKNET_PERIOD_SECONDS=3

# -- Reward distributor config --
REVEAL_DEADLINE_SECONDS=3600
REGULAR_DRAW_REWARD="10000000"
BIG_DRAW_REWARD="100000000"

# -- Staking hub config --
EPOCH_DURATION_SECONDS=86400
PROTOCOL_FEE_BPS=500
BASE_YIELD_BPS=500
REGULAR_POOL_BPS=7000
BIG_POOL_BPS=2000
CSINJ_SUBDENOM="csINJ"

# -- Wasm artifacts --
DRAND_ORACLE_WASM="./artifacts/chance_drand_oracle.wasm"
REWARD_DISTRIBUTOR_WASM="./artifacts/chance_reward_distributor.wasm"
STAKING_HUB_WASM="./artifacts/chance_staking_hub.wasm"

################################################################################
#                                   HELPERS                                    #
################################################################################

# Store a wasm binary and echo the code ID.
# Usage: store_code <wasm_file> <label>
store_code() {
    local wasm_file="$1"
    local label="$2"

    if [ ! -f "$wasm_file" ]; then
        echo "  ERROR: Wasm file not found: $wasm_file"
        echo "  Build artifacts first with the CosmWasm optimizer."
        exit 1
    fi

    echo "  Storing $label..."
    local store_response
    store_response=$(yes "$PASSWORD" | injectived tx wasm store "$wasm_file" \
        --from="$FROM" \
        --chain-id="$CHAIN_ID" \
        --yes --fees="$FEES" --gas="$GAS" \
        --node="$NODE" 2>&1)

    if ! echo "$store_response" | grep -q "txhash"; then
        echo "  ERROR: Failed to submit store transaction for $label."
        echo "$store_response"
        exit 1
    fi

    local txhash
    txhash=$(echo "$store_response" | grep 'txhash:' | awk '{print $2}')
    echo "  > Store tx: $txhash"
    echo "  > Waiting for indexing..."
    sleep 10

    local query_output
    query_output=$(injectived query tx "$txhash" --node="$NODE" 2>&1)

    local code_id
    code_id=$(echo "$query_output" | grep -A 1 'key: code_id' | grep 'value:' | head -1 | sed 's/.*value: "\(.*\)".*/\1/')

    if [ -z "$code_id" ]; then
        echo "  ERROR: Could not extract Code ID for $label from tx: $txhash"
        echo "  Check the transaction on the explorer."
        exit 1
    fi

    echo "  Code ID: $code_id"
    echo "$code_id"
}

# Instantiate a contract and echo the contract address.
# Usage: instantiate_contract <code_id> <init_msg> <label> [amount]
instantiate_contract() {
    local code_id="$1"
    local init_msg="$2"
    local label="$3"
    local amount="${4:-}"

    echo "  Instantiating $label (code $code_id)..."
    local amount_flag=""
    if [ -n "$amount" ]; then
        amount_flag="--amount=$amount"
        echo "  > Sending $amount with instantiation"
    fi

    local inst_response
    inst_response=$(yes "$PASSWORD" | injectived tx wasm instantiate "$code_id" "$init_msg" \
        --label="$label" \
        --admin="$ADMIN_ADDRESS" \
        --from="$FROM" \
        --chain-id="$CHAIN_ID" \
        --yes --fees="$FEES" --gas="$GAS" \
        $amount_flag \
        --node="$NODE" 2>&1)

    if ! echo "$inst_response" | grep -q "txhash"; then
        echo "  ERROR: Failed to submit instantiate transaction for $label."
        echo "$inst_response"
        exit 1
    fi

    local txhash
    txhash=$(echo "$inst_response" | grep 'txhash:' | awk '{print $2}')
    echo "  > Instantiate tx: $txhash"
    echo "  > Waiting for indexing..."
    sleep 10

    local query_output
    query_output=$(injectived query tx "$txhash" --node="$NODE" 2>&1)

    local contract_address
    contract_address=$(echo "$query_output" | grep -A 1 'key: _contract_address' | grep 'value:' | head -1 | sed 's/.*value: "\(.*\)".*/\1/')

    if [ -z "$contract_address" ]; then
        echo "  ERROR: Could not extract contract address for $label from tx: $txhash"
        echo "  Check the transaction on the explorer."
        exit 1
    fi

    echo "  Contract address: $contract_address"
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
echo "  Admin:     $ADMIN_ADDRESS"
echo "  Operator:  $OPERATOR_ADDRESS"
echo "  Treasury:  $TREASURY_ADDRESS"
echo ""

# ── 1. Store all wasm codes ──────────────────────────────────────────────────

echo "-------------------------------------------------"
echo "  STEP 1: Storing Wasm codes"
echo "-------------------------------------------------"

DRAND_CODE_ID=$(store_code "$DRAND_ORACLE_WASM" "drand-oracle")
echo ""
DISTRIBUTOR_CODE_ID=$(store_code "$REWARD_DISTRIBUTOR_WASM" "reward-distributor")
echo ""
STAKING_HUB_CODE_ID=$(store_code "$STAKING_HUB_WASM" "staking-hub")
echo ""

echo "  Stored code IDs:"
echo "    drand-oracle:       $DRAND_CODE_ID"
echo "    reward-distributor: $DISTRIBUTOR_CODE_ID"
echo "    staking-hub:        $STAKING_HUB_CODE_ID"
echo ""

# ── 2. Instantiate drand-oracle (no dependencies) ───────────────────────────

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
# Compact to single line for CLI
DRAND_INIT_MSG=$(echo "$DRAND_INIT_MSG" | tr -d '\n' | tr -s ' ')

DRAND_ORACLE_ADDRESS=$(instantiate_contract "$DRAND_CODE_ID" "$DRAND_INIT_MSG" "Chance Drand Oracle v1.0")
echo ""

# ── 3. Instantiate reward-distributor (needs drand_oracle) ──────────────────

echo "-------------------------------------------------"
echo "  STEP 3: Instantiating reward-distributor"
echo "-------------------------------------------------"

DISTRIBUTOR_INIT_MSG=$(cat <<EOF
{
  "operator": "$OPERATOR_ADDRESS",
  "staking_hub": "$ADMIN_ADDRESS",
  "drand_oracle": "$DRAND_ORACLE_ADDRESS",
  "reveal_deadline_seconds": $REVEAL_DEADLINE_SECONDS,
  "regular_draw_reward": "$REGULAR_DRAW_REWARD",
  "big_draw_reward": "$BIG_DRAW_REWARD"
}
EOF
)
DISTRIBUTOR_INIT_MSG=$(echo "$DISTRIBUTOR_INIT_MSG" | tr -d '\n' | tr -s ' ')

# NOTE: staking_hub is set to ADMIN_ADDRESS as a placeholder.
# After staking-hub is deployed, update it via UpdateConfig or migrate.
REWARD_DISTRIBUTOR_ADDRESS=$(instantiate_contract "$DISTRIBUTOR_CODE_ID" "$DISTRIBUTOR_INIT_MSG" "Chance Reward Distributor v1.0")
echo ""

# ── 4. Instantiate staking-hub (needs reward_distributor + drand_oracle) ────

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

# ── 5. Update reward-distributor's staking_hub to the real address ──────────

echo "-------------------------------------------------"
echo "  STEP 5: Updating reward-distributor staking_hub"
echo "-------------------------------------------------"

# The reward-distributor was instantiated with a placeholder staking_hub.
# If UpdateConfig supports changing staking_hub, call it here.
# Otherwise this step must be done manually or via contract migration.
echo "  NOTE: The reward-distributor was instantiated with staking_hub=$ADMIN_ADDRESS"
echo "  You may need to update it to the real staking-hub address: $STAKING_HUB_ADDRESS"
echo "  via an UpdateConfig or migrate transaction."
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
printf "  %-28s %s\n" "Admin:" "$ADMIN_ADDRESS"
printf "  %-28s %s\n" "Operator:" "$OPERATOR_ADDRESS"
printf "  %-28s %s\n" "Treasury:" "$TREASURY_ADDRESS"
echo ""
echo "================================================="

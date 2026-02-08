import { Network, getNetworkEndpoints } from "@injectivelabs/networks";
import { ChainId, EvmChainId } from "@injectivelabs/ts-types";

// Toggle between testnet and mainnet here
export const NETWORK = Network.Testnet;
export const CHAIN_ID = ChainId.Testnet;
export const EVM_CHAIN_ID = EvmChainId.Injective;

export const ENDPOINTS = getNetworkEndpoints(NETWORK);

// Contract addresses — set after deployment via deploy_testnet.sh
// These are placeholders; update after deploying contracts
export const CONTRACTS = {
    stakingHub: "inj1ue9x4varmfaz3c8x07eqrjz4ekz7nflu50ynrk",
    rewardDistributor: "inj1nstzftt4tgk6gca5auluftzvzenrr606t6rrsr",
    drandOracle: "inj1r6r6xugh3qy483g8z5jn97ssaz067epx3ac6kd",
} as const;

// INJ has 18 decimals
export const INJ_DECIMALS = 18;
export const INJ_DENOM = "inj";

// csINJ denom is factory/{staking_hub_address}/csINJ
export const getCsinjDenom = () =>
    CONTRACTS.stakingHub ? `factory/${CONTRACTS.stakingHub}/csINJ` : "";

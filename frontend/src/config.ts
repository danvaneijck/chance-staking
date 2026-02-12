import { Network, getNetworkEndpoints } from "@injectivelabs/networks";
import { ChainId, EvmChainId } from "@injectivelabs/ts-types";

export const NETWORK = Network.Testnet;
export const CHAIN_ID = ChainId.Testnet;
export const EVM_CHAIN_ID = EvmChainId.Injective;

export const ENDPOINTS = getNetworkEndpoints(NETWORK);

export const CONTRACTS = {
    drandOracle: "inj12dg907vrnw3zdsh8hjvf4ywqky8gw7e3v7lwf7",
    rewardDistributor: "inj1thz9kqf74w4a8yakpx62xmnll3nf032rnnukyy",
    stakingHub: "inj15vq83p8l6wl7qneulzgnt66dwheh2ecpprj0kn",
} as const;

export const INJ_DECIMALS = 18;
export const INJ_DENOM = "inj";

export const getCsinjDenom = () =>
    CONTRACTS.stakingHub ? `factory/${CONTRACTS.stakingHub}/csINJ` : "";

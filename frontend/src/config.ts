import { Network, getNetworkEndpoints } from "@injectivelabs/networks";
import { ChainId, EvmChainId } from "@injectivelabs/ts-types";

export const NETWORK = Network.Testnet;
export const CHAIN_ID = ChainId.Testnet;
export const EVM_CHAIN_ID = EvmChainId.Injective;

export const ENDPOINTS = getNetworkEndpoints(NETWORK);

export const CONTRACTS = {
    drandOracle: "inj125aaphw8dgut3d4ju3myqmyel76jc4tsccnstw",
    rewardDistributor: "inj184vlqxmfjsva9hewmj9ddqkvl5kdmcjetk94hy",
    stakingHub: "inj1n2pvkp3mcslsydq8uvxcrp5jeyerqmkqxucm2e",
} as const;

export const INJ_DECIMALS = 18;
export const INJ_DENOM = "inj";

export const getCsinjDenom = () =>
    CONTRACTS.stakingHub ? `factory/${CONTRACTS.stakingHub}/csINJ` : "";

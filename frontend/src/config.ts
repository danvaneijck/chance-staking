import { Network, getNetworkEndpoints } from "@injectivelabs/networks";
import { ChainId, EvmChainId } from "@injectivelabs/ts-types";

export const NETWORK = Network.Testnet;
export const CHAIN_ID = ChainId.Testnet;
export const EVM_CHAIN_ID = EvmChainId.Injective;

export const ENDPOINTS = getNetworkEndpoints(NETWORK);

export const CONTRACTS = {
    drandOracle: "inj1uc0luks5djcwnytasp85v497pyg4k4sae347yp",
    rewardDistributor: "inj1l0u7s0qnltlp4h5d527l8kt8rzku5pgwfcy87u",
    stakingHub: "inj137a49kunvxv8q55c4mlprj2cj4qavu3r2mjlfq",
} as const;

export const INJ_DECIMALS = 18;
export const INJ_DENOM = "inj";

export const getCsinjDenom = () =>
    CONTRACTS.stakingHub ? `factory/${CONTRACTS.stakingHub}/csINJ` : "";

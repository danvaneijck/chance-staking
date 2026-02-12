import { Network, getNetworkEndpoints } from "@injectivelabs/networks";
import { ChainId, EvmChainId } from "@injectivelabs/ts-types";

export const NETWORK = Network.Testnet;
export const CHAIN_ID = ChainId.Testnet;
export const EVM_CHAIN_ID = EvmChainId.Injective;

export const ENDPOINTS = getNetworkEndpoints(NETWORK);

export const CONTRACTS = {
    drandOracle: "inj1jwztm5q5gnaq0jgt36v8wkskx6ryyul9nx4q6a",
    rewardDistributor: "inj1pzl6p4el05lum6qd3h2e78gfsnaztll8g54fmr",
    stakingHub: "inj17l2r0vgfuv4sl6j2m47fhl8fypa6jezne5hdav",
} as const;

export const INJ_DECIMALS = 18;
export const INJ_DENOM = "inj";

export const getCsinjDenom = () =>
    CONTRACTS.stakingHub ? `factory/${CONTRACTS.stakingHub}/csINJ` : "";

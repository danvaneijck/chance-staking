import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ChainId, EvmChainId } from "@injectivelabs/ts-types";
import { Network, getNetworkEndpoints } from "@injectivelabs/networks";
import { MsgBroadcaster } from "@injectivelabs/wallet-core";
import { Wallet } from "@injectivelabs/wallet-base";
import { WalletStrategy } from "@injectivelabs/wallet-strategy";
import { getInjectiveAddress } from "@injectivelabs/sdk-ts";
import { NETWORK, CHAIN_ID, EVM_CHAIN_ID, CONTRACTS } from "../config";
import * as contracts from "../services/contracts";

// ---------- Types ----------
export type WalletType = "metamask" | "keplr" | "leap" | "rabby";

interface WalletState {
    address: string;
    injectiveAddress: string;
    walletType: WalletType | null;
    isConnecting: boolean;
    isConnected: boolean;
}

interface BalanceState {
    injBalance: string;
    csinjBalance: string;
}

interface ContractState {
    exchangeRate: string;
    totalInjBacking: string;
    totalCsinjSupply: string;
    currentEpoch: number;
    totalStaked: string;
    regularPoolBalance: string;
    bigPoolBalance: string;
    totalDrawsCompleted: number;
    totalRewardsDistributed: string;
}

interface UserState {
    unstakeRequests: contracts.UnstakeRequestEntry[];
    userWins: contracts.UserWinsResponse | null;
    userWinDraws: contracts.Draw[];
}

interface DrawsState {
    recentDraws: contracts.Draw[];
}

interface AppState
    extends WalletState, BalanceState, ContractState, UserState, DrawsState {
    isLoading: boolean;
    error: string | null;

    // Wallet actions
    connect: (type: WalletType) => Promise<void>;
    disconnect: () => void;

    // Data loading
    fetchContractData: () => Promise<void>;
    fetchUserData: () => Promise<void>;
    fetchBalances: () => Promise<void>;
    fetchDraws: () => Promise<void>;

    // Tx actions
    stake: (amount: string) => Promise<void>;
    unstake: (amount: string) => Promise<void>;
    claimUnstaked: (requestIds: number[]) => Promise<void>;
}

// ---------- Wallet infra (module-level singletons) ----------
const walletStrategy = new WalletStrategy({
    chainId: CHAIN_ID,
    evmOptions: { rpcUrl: "", evmChainId: EVM_CHAIN_ID },
    strategies: {},
});

const msgBroadcaster = new MsgBroadcaster({
    walletStrategy,
    simulateTx: true,
    network: NETWORK,
    endpoints: getNetworkEndpoints(NETWORK),
    gasBufferCoefficient: 1.1,
});

const WALLET_MAP: Record<WalletType, Wallet> = {
    metamask: Wallet.Metamask,
    keplr: Wallet.Keplr,
    leap: Wallet.Leap,
    rabby: Wallet.Metamask,
};

// ---------- Store ----------
export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            // Initial wallet state
            address: "",
            injectiveAddress: "",
            walletType: null,
            isConnecting: false,
            isConnected: false,

            // Initial balances
            injBalance: "0",
            csinjBalance: "0",

            // Initial contract state
            exchangeRate: "1.0",
            totalInjBacking: "0",
            totalCsinjSupply: "0",
            currentEpoch: 0,
            totalStaked: "0",
            regularPoolBalance: "0",
            bigPoolBalance: "0",
            totalDrawsCompleted: 0,
            totalRewardsDistributed: "0",

            // Initial user state
            unstakeRequests: [],
            userWins: null,
            userWinDraws: [],

            // Initial draws state
            recentDraws: [],

            isLoading: false,
            error: null,

            // ──── Wallet actions ────
            connect: async (type: WalletType) => {
                set({ isConnecting: true, error: null });
                try {
                    walletStrategy.setWallet(WALLET_MAP[type]);
                    const addresses = await walletStrategy.getAddresses();
                    if (addresses.length > 0) {
                        const addr = addresses[0];
                        let injAddr = addr;
                        // try {
                        //   injAddr = getInjectiveAddress(addr)
                        // } catch {
                        //   // Already an inj address
                        // }
                        set({
                            address: addr,
                            injectiveAddress: injAddr,
                            walletType: type,
                            isConnected: true,
                            isConnecting: false,
                        });
                        // Fetch data after connect
                        const state = get();
                        state.fetchBalances();
                        state.fetchUserData();
                    } else {
                        set({ isConnecting: false });
                    }
                } catch (err: any) {
                    set({
                        error: err?.message || "Failed to connect wallet",
                        isConnecting: false,
                    });
                }
            },

            disconnect: () => {
                set({
                    address: "",
                    injectiveAddress: "",
                    walletType: null,
                    isConnected: false,
                    injBalance: "0",
                    csinjBalance: "0",
                    unstakeRequests: [],
                    userWins: null,
                    userWinDraws: [],
                    error: null,
                });
            },

            // ──── Data loading ────
            fetchContractData: async () => {
                if (!CONTRACTS.stakingHub || !CONTRACTS.rewardDistributor)
                    return;
                try {
                    const [exchangeRateData, drawState] = await Promise.all([
                        contracts.fetchExchangeRate(),
                        contracts.fetchDrawState(),
                    ]);
                    set({
                        exchangeRate: exchangeRateData.rate,
                        totalInjBacking: exchangeRateData.total_inj_backing,
                        totalCsinjSupply: exchangeRateData.total_csinj_supply,
                        regularPoolBalance: drawState.regular_pool_balance,
                        bigPoolBalance: drawState.big_pool_balance,
                        totalDrawsCompleted: drawState.total_draws_completed,
                        totalRewardsDistributed:
                            drawState.total_rewards_distributed,
                    });
                } catch (err: any) {
                    console.error("Failed to fetch contract data:", err);
                }
            },

            fetchBalances: async () => {
                const { injectiveAddress } = get();
                if (!injectiveAddress) return;
                try {
                    const [inj, csinj] = await Promise.all([
                        contracts.fetchInjBalance(injectiveAddress),
                        contracts.fetchCsinjBalance(injectiveAddress),
                    ]);
                    set({ injBalance: inj, csinjBalance: csinj });
                } catch (err: any) {
                    console.error("Failed to fetch balances:", err);
                }
            },

            fetchUserData: async () => {
                const { injectiveAddress } = get();
                if (!injectiveAddress || !CONTRACTS.stakingHub) return;
                try {
                    const [unstakeReqs, userWins, winDraws] = await Promise.all(
                        [
                            contracts.fetchUnstakeRequests(injectiveAddress),
                            CONTRACTS.rewardDistributor
                                ? contracts.fetchUserWins(injectiveAddress)
                                : null,
                            CONTRACTS.rewardDistributor
                                ? contracts.fetchUserWinDetails(
                                      injectiveAddress,
                                  )
                                : [],
                        ],
                    );
                    set({
                        unstakeRequests: unstakeReqs,
                        userWins: userWins,
                        userWinDraws: winDraws || [],
                    });
                } catch (err: any) {
                    console.error("Failed to fetch user data:", err);
                }
            },

            fetchDraws: async () => {
                if (!CONTRACTS.rewardDistributor) return;
                try {
                    const { draws } = await contracts.fetchDrawHistory(
                        undefined,
                        20,
                    );
                    if (draws) {
                        set({ recentDraws: draws });
                    }
                } catch (err: any) {
                    console.error("Failed to fetch draws:", err);
                }
            },

            // ──── Tx actions ────
            stake: async (amount: string) => {
                const { injectiveAddress } = get();
                if (!injectiveAddress) throw new Error("Wallet not connected");
                set({ isLoading: true, error: null });
                try {
                    const msg = contracts.buildStakeMsg(
                        injectiveAddress,
                        amount,
                    );
                    await msgBroadcaster.broadcast({
                        msgs: [msg],
                        injectiveAddress,
                    });
                    // Refresh data
                    await Promise.all([
                        get().fetchBalances(),
                        get().fetchContractData(),
                    ]);
                } catch (err: any) {
                    set({ error: err?.message || "Stake failed" });
                    throw err;
                } finally {
                    set({ isLoading: false });
                }
            },

            unstake: async (amount: string) => {
                const { injectiveAddress } = get();
                if (!injectiveAddress) throw new Error("Wallet not connected");
                set({ isLoading: true, error: null });
                try {
                    const msg = contracts.buildUnstakeMsg(
                        injectiveAddress,
                        amount,
                    );
                    await msgBroadcaster.broadcast({
                        msgs: [msg],
                        injectiveAddress,
                    });
                    await Promise.all([
                        get().fetchBalances(),
                        get().fetchUserData(),
                        get().fetchContractData(),
                    ]);
                } catch (err: any) {
                    set({ error: err?.message || "Unstake failed" });
                    throw err;
                } finally {
                    set({ isLoading: false });
                }
            },

            claimUnstaked: async (requestIds: number[]) => {
                const { injectiveAddress } = get();
                if (!injectiveAddress) throw new Error("Wallet not connected");
                set({ isLoading: true, error: null });
                try {
                    const msg = contracts.buildClaimUnstakedMsg(
                        injectiveAddress,
                        requestIds,
                    );
                    await msgBroadcaster.broadcast({
                        msgs: [msg],
                        injectiveAddress,
                    });
                    await Promise.all([
                        get().fetchBalances(),
                        get().fetchUserData(),
                    ]);
                } catch (err: any) {
                    set({ error: err?.message || "Claim failed" });
                    throw err;
                } finally {
                    set({ isLoading: false });
                }
            },
        }),
        {
            name: "chance-staking-wallet",
            partialize: (state) => ({
                address: state.address,
                injectiveAddress: state.injectiveAddress,
                walletType: state.walletType,
                isConnected: state.isConnected,
            }),
        },
    ),
);

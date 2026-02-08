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
    epochStartTime: string;
    epochDurationSeconds: number;
    totalStaked: string;
    regularPoolBalance: string;
    bigPoolBalance: string;
    totalDrawsCompleted: number;
    totalRewardsDistributed: string;
}

export interface Toast {
    id: number;
    type: 'success' | 'info' | 'warning';
    title: string;
    message: string;
}

interface ToastState {
    toasts: Toast[];
}

interface NavigationState {
    selectedDrawId: number | null;
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
    extends WalletState, BalanceState, ContractState, UserState, DrawsState, ToastState, NavigationState {
    isLoading: boolean;
    error: string;

    // Wallet actions
    connect: (type: WalletType) => Promise<void>;
    disconnect: () => void;

    // Data loading
    fetchContractData: () => Promise<void>;
    fetchUserData: () => Promise<void>;
    fetchBalances: () => Promise<void>;
    fetchDraws: () => Promise<void>;

    // Toast actions
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: number) => void;

    // Navigation actions
    selectDraw: (drawId: number | null) => void;

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
            epochStartTime: "0",
            epochDurationSeconds: 86400,
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

            // Toast state
            toasts: [],

            // Navigation state
            selectedDrawId: null,

            isLoading: false,
            error: "",

            // ──── Toast actions ────
            addToast: (toast) => {
                const id = Date.now();
                set((state) => ({
                    toasts: [...state.toasts, { ...toast, id }],
                }));
                setTimeout(() => {
                    set((state) => ({
                        toasts: state.toasts.filter((t) => t.id !== id),
                    }));
                }, 5000);
            },

            removeToast: (id) => {
                set((state) => ({
                    toasts: state.toasts.filter((t) => t.id !== id),
                }));
            },

            // ──── Navigation actions ────
            selectDraw: (drawId) => {
                set({ selectedDrawId: drawId });
                if (drawId !== null) {
                    window.location.hash = `draw/${drawId}`;
                } else {
                    history.replaceState(null, "", window.location.pathname);
                }
            },

            // ──── Wallet actions ────
            connect: async (type: WalletType) => {
                set({ isConnecting: true, error: "" });
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
                    error: "",
                });
            },

            // ──── Data loading ────
            fetchContractData: async () => {
                if (!CONTRACTS.stakingHub || !CONTRACTS.rewardDistributor)
                    return;
                try {
                    const [exchangeRateData, drawState, epochState, hubConfig] =
                        await Promise.all([
                            contracts.fetchExchangeRate(),
                            contracts.fetchDrawState(),
                            contracts.fetchEpochState(),
                            contracts.fetchStakingHubConfig(),
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
                        currentEpoch: epochState.current_epoch,
                        epochStartTime: epochState.epoch_start_time,
                        epochDurationSeconds:
                            hubConfig.epoch_duration_seconds,
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
                    const drawState = await contracts.fetchDrawState();
                    const count = 20;
                    const startAfter = Math.max(
                        0,
                        drawState.next_draw_id - count - 1,
                    );
                    const { draws } = await contracts.fetchDrawHistory(
                        startAfter > 0 ? startAfter : undefined,
                        count,
                    );
                    if (draws) {
                        const prevDraws = get().recentDraws;
                        const prevRevealedIds = new Set(
                            prevDraws
                                .filter((d) => d.status === "revealed")
                                .map((d) => d.id),
                        );
                        // Detect newly revealed draws (only after initial load)
                        if (prevDraws.length > 0) {
                            for (const draw of draws) {
                                if (
                                    draw.status === "revealed" &&
                                    !prevRevealedIds.has(draw.id)
                                ) {
                                    const typeLabel =
                                        draw.draw_type === "big"
                                            ? "Big Jackpot"
                                            : "Regular Draw";
                                    const rewardInj =
                                        parseFloat(draw.reward_amount) /
                                        1e18;
                                    get().addToast({
                                        type: "success",
                                        title: `${typeLabel} #${draw.id} Revealed!`,
                                        message: `Winner: ${draw.winner?.slice(0, 10)}... won ${rewardInj.toFixed(2)} INJ`,
                                    });
                                }
                            }
                        }
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
                set({ isLoading: true, error: "" });
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
                set({ isLoading: true, error: "" });
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
                set({ isLoading: true, error: "" });
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

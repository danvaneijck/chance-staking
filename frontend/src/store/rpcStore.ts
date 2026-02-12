import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getNetworkEndpoints, Network } from "@injectivelabs/networks";
import { NETWORK } from "../config";

export interface Endpoint {
    grpc: string;
    rest?: string;
    label?: string;
    custom?: boolean;
}

interface RpcState {
    endpoints: Endpoint[];
    activeIndex: number;
    modalOpen: boolean;

    selectEndpoint: (i: number) => void;
    addCustomEndpoint: (grpc: string, rest?: string) => void;
    removeCustomEndpoint: (i: number) => void;
    openModal: () => void;
    closeModal: () => void;
}

const sdkEndpoints = getNetworkEndpoints(NETWORK);

const defaultEndpoints: Endpoint[] =
    NETWORK === Network.Testnet
        ? [
              {
                  grpc: sdkEndpoints.grpc,
                  rest: "https://testnet.sentry.lcd.injective.network",
                  label: "Injective Official",
              },
              {
                  grpc: "https://injective-testnet-grpc.publicnode.com",
                  rest: "https://injective-testnet-rest.publicnode.com",
                  label: "PublicNode",
              },
          ]
        : [
              {
                  grpc: sdkEndpoints.grpc,
                  rest: "https://sentry.lcd.injective.network",
                  label: "Injective Official",
              },
              {
                  grpc: "https://injective-grpc.publicnode.com",
                  rest: "https://injective-rest.publicnode.com",
                  label: "PublicNode",
              },
          ];

export const useRpcStore = create<RpcState>()(
    persist(
        (set, get) => ({
            endpoints: [...defaultEndpoints],
            activeIndex: 0,
            modalOpen: false,

            selectEndpoint: (i) => {
                const { endpoints } = get();
                if (i >= 0 && i < endpoints.length) {
                    set({ activeIndex: i });
                }
            },

            addCustomEndpoint: (grpc, rest) => {
                grpc = grpc.trim().replace(/\/+$/, "");
                if (!/^https?:\/\/.+/i.test(grpc)) return;

                const { endpoints } = get();
                if (endpoints.some((e) => e.grpc === grpc)) return;

                const list = [
                    ...endpoints,
                    {
                        grpc,
                        rest: rest?.trim().replace(/\/+$/, "") || undefined,
                        label: "Custom",
                        custom: true,
                    },
                ];
                set({ endpoints: list, activeIndex: list.length - 1 });
            },

            removeCustomEndpoint: (i) => {
                const { endpoints, activeIndex } = get();
                if (!endpoints[i]?.custom) return;
                const list = endpoints.filter((_, idx) => idx !== i);
                set({
                    endpoints: list,
                    activeIndex:
                        activeIndex >= list.length
                            ? list.length - 1
                            : activeIndex > i
                              ? activeIndex - 1
                              : activeIndex,
                });
            },

            openModal: () => set({ modalOpen: true }),
            closeModal: () => set({ modalOpen: false }),
        }),
        {
            name: "rpc-store",
            partialize: (state) => ({
                endpoints: state.endpoints,
                activeIndex: state.activeIndex,
            }),
            merge: (persisted, current) => {
                const p = persisted as Partial<RpcState> | undefined;
                if (!p?.endpoints) return current;

                // Ensure default endpoints are always present
                const merged = [...defaultEndpoints];
                const defaultGrpcs = new Set(
                    defaultEndpoints.map((e) => e.grpc),
                );
                for (const ep of p.endpoints) {
                    if (ep.custom && !defaultGrpcs.has(ep.grpc)) {
                        merged.push(ep);
                    }
                }

                const activeIndex = Math.min(
                    p.activeIndex ?? 0,
                    merged.length - 1,
                );
                return { ...current, endpoints: merged, activeIndex };
            },
        },
    ),
);

export const useCurrentGrpc = () =>
    useRpcStore((s) => s.endpoints[s.activeIndex]?.grpc ?? sdkEndpoints.grpc);

export const useCurrentRest = () =>
    useRpcStore((s) => s.endpoints[s.activeIndex]?.rest ?? "");

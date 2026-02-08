import {
  ChainGrpcWasmApi,
  ChainGrpcBankApi,
  ChainGrpcStakingApi,
  MsgExecuteContract,
  PrivateKey,
  MsgBroadcasterWithPk,
} from "@injectivelabs/sdk-ts";
import {
  getNetworkEndpoints,
  Network,
} from "@injectivelabs/networks";
import { config } from "./config";
import { logger } from "./utils/logger";

const networkMap: Record<string, Network> = {
  testnet: Network.Testnet,
  mainnet: Network.Mainnet,
};

const network = networkMap[config.network] || Network.Testnet;
const endpoints = getNetworkEndpoints(network);

const chainId = config.network === "mainnet" ? "injective-1" : "injective-888";

const privateKey = PrivateKey.fromMnemonic(config.mnemonic);
const injectiveAddress = privateKey.toAddress().toBech32();

logger.info(`Operator address: ${injectiveAddress}`);
logger.info(`Network: ${config.network} (${chainId})`);

export const wasmClient = new ChainGrpcWasmApi(endpoints.grpc);
export const bankClient = new ChainGrpcBankApi(endpoints.grpc);
export const stakingClient = new ChainGrpcStakingApi(endpoints.grpc);

const broadcaster = new MsgBroadcasterWithPk({
  privateKey: privateKey,
  network: network,
  simulateTx: true,
});

// Mutex to serialize transaction execution and prevent sequence mismatch errors
let txMutexPromise: Promise<void> = Promise.resolve();

function acquireTxMutex(): Promise<() => void> {
  let release: () => void;
  const prev = txMutexPromise;
  txMutexPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return prev.then(() => release!);
}

export function getOperatorAddress(): string {
  return injectiveAddress;
}

export async function queryContract<T>(contractAddress: string, queryMsg: object): Promise<T> {
  const response = await wasmClient.fetchSmartContractState(
    contractAddress,
    Buffer.from(JSON.stringify(queryMsg)).toString("base64")
  );
  const decoded = Buffer.from(response.data as unknown as string, "base64").toString("utf-8");
  return JSON.parse(decoded) as T;
}

export async function executeContract(
  contractAddress: string,
  msg: object,
  funds?: { denom: string; amount: string }[]
): Promise<string> {
  const release = await acquireTxMutex();
  try {
    const execMsg = MsgExecuteContract.fromJSON({
      sender: injectiveAddress,
      contractAddress,
      msg,
      funds: funds || [],
    });

    const txResponse = await broadcaster.broadcast({
      msgs: execMsg,
    });

    logger.info(`Tx broadcast success: ${txResponse.txHash}`);
    return txResponse.txHash;
  } finally {
    release();
  }
}

export { chainId, endpoints, injectiveAddress };

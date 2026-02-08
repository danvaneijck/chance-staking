import { config } from "../config";
import { queryContract, executeContract } from "../clients";
import { logger } from "../utils/logger";

interface DrandBeaconResponse {
  round: number;
  randomness: string;
  signature: string;
}

interface StoredBeacon {
  round: number;
  randomness: number[];
  signature: number[];
  verified: boolean;
  submitted_at: string;
  submitted_by: string;
}

export async function fetchLatestDrandRound(): Promise<DrandBeaconResponse> {
  const url = `${config.drand.apiUrl}/${config.drand.chainHash}/public/latest`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch latest drand round: ${response.statusText}`);
  }
  return response.json() as Promise<DrandBeaconResponse>;
}

export async function fetchDrandRound(round: number): Promise<DrandBeaconResponse> {
  const url = `${config.drand.apiUrl}/${config.drand.chainHash}/public/${round}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch drand round ${round}: ${response.statusText}`);
  }
  return response.json() as Promise<DrandBeaconResponse>;
}

export async function getLatestStoredRound(): Promise<number> {
  return queryContract<number>(config.contracts.drandOracle, { latest_round: {} });
}

export async function getStoredBeacon(round: number): Promise<StoredBeacon | null> {
  return queryContract<StoredBeacon | null>(config.contracts.drandOracle, {
    beacon: { round },
  });
}

export async function submitBeacon(round: number, signatureHex: string): Promise<string> {
  logger.info(`Submitting drand beacon for round ${round}`);
  return executeContract(config.contracts.drandOracle, {
    submit_beacon: {
      round,
      signature_hex: signatureHex,
    },
  });
}

export async function syncDrandBeacons(): Promise<void> {
  const latestStored = await getLatestStoredRound();
  const latestDrand = await fetchLatestDrandRound();

  logger.debug(`Latest stored round: ${latestStored}, latest drand round: ${latestDrand.round}`);

  if (latestDrand.round <= latestStored) {
    logger.debug("Drand oracle is up to date");
    return;
  }

  // Submit any missing rounds that are needed
  // We only submit the latest round unless there are committed draws waiting for specific rounds
  const beacon = latestDrand;
  const existing = await getStoredBeacon(beacon.round);
  if (!existing) {
    await submitBeacon(beacon.round, beacon.signature);
    logger.info(`Submitted drand beacon for round ${beacon.round}`);
  }
}

export async function submitSpecificRound(round: number): Promise<void> {
  const existing = await getStoredBeacon(round);
  if (existing) {
    logger.debug(`Drand round ${round} already stored`);
    return;
  }

  const beacon = await fetchDrandRound(round);
  await submitBeacon(beacon.round, beacon.signature);
  logger.info(`Submitted drand beacon for round ${beacon.round}`);
}

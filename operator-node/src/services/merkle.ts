import { sha256, computeLeafHash } from "../utils/crypto";

export interface SnapshotEntry {
  address: string;
  balance: string;
  cumulative_start: string;
  cumulative_end: string;
}

export function buildMerkleTree(entries: SnapshotEntry[]): {
  root: string;
  leaves: Buffer[];
} {
  if (entries.length === 0) {
    throw new Error("Cannot build merkle tree from empty entries");
  }

  const leaves = entries.map((e) =>
    computeLeafHash(e.address, BigInt(e.cumulative_start), BigInt(e.cumulative_end))
  );

  const root = computeRoot(leaves);
  return { root: root.toString("hex"), leaves };
}

function computeRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 1) return leaves[0];

  const nextLevel: Buffer[] = [];
  for (let i = 0; i < leaves.length; i += 2) {
    if (i + 1 < leaves.length) {
      nextLevel.push(hashPairSorted(leaves[i], leaves[i + 1]));
    } else {
      // Odd leaf gets promoted
      nextLevel.push(leaves[i]);
    }
  }
  return computeRoot(nextLevel);
}

function hashPairSorted(a: Buffer, b: Buffer): Buffer {
  // M-02 FIX: Add domain separation prefix (0x01) for internal node hashes
  const prefix = Buffer.from([0x01]);
  const cmp = Buffer.compare(a, b);
  if (cmp <= 0) {
    return sha256(Buffer.concat([prefix, a, b]));
  } else {
    return sha256(Buffer.concat([prefix, b, a]));
  }
}

export function generateProof(leaves: Buffer[], index: number): string[] {
  const proof: string[] = [];
  let currentLeaves = [...leaves];
  let idx = index;

  while (currentLeaves.length > 1) {
    const nextLevel: Buffer[] = [];

    for (let i = 0; i < currentLeaves.length; i += 2) {
      if (i + 1 < currentLeaves.length) {
        if (i === idx || i + 1 === idx) {
          const siblingIdx = i === idx ? i + 1 : i;
          proof.push(currentLeaves[siblingIdx].toString("hex"));
        }
        nextLevel.push(hashPairSorted(currentLeaves[i], currentLeaves[i + 1]));
      } else {
        // Odd node, promoted without a sibling
        nextLevel.push(currentLeaves[i]);
      }
    }

    idx = Math.floor(idx / 2);
    currentLeaves = nextLevel;
  }

  return proof;
}

export function findWinnerIndex(
  entries: SnapshotEntry[],
  winningTicket: bigint
): number {
  for (let i = 0; i < entries.length; i++) {
    const start = BigInt(entries[i].cumulative_start);
    const end = BigInt(entries[i].cumulative_end);
    if (winningTicket >= start && winningTicket < end) {
      return i;
    }
  }
  throw new Error(`No winner found for ticket ${winningTicket}`);
}

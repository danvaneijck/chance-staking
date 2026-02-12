import { createHash, randomBytes } from "crypto";

export function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function generateSecret(bytes = 32): Buffer {
  return randomBytes(bytes);
}

export function computeOperatorCommit(secret: Buffer): string {
  return sha256(secret).toString("hex");
}

export function xorBuffers(a: Buffer, b: Buffer): Buffer {
  const len = Math.min(a.length, b.length);
  const result = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

export function computeWinningTicket(
  drandRandomness: Buffer,
  operatorSecret: Buffer,
  totalWeight: bigint
): bigint {
  const secretHash = sha256(operatorSecret);
  const finalRandomness = xorBuffers(drandRandomness, secretHash);
  // u128 from first 16 bytes big-endian
  let value = BigInt(0);
  for (let i = 0; i < 16; i++) {
    value = (value << BigInt(8)) | BigInt(finalRandomness[i]);
  }
  return value % totalWeight;
}

export function computeLeafHash(
  address: string,
  cumulativeStart: bigint,
  cumulativeEnd: bigint
): Buffer {
  // M-02 FIX: Add domain separation prefix (0x00) for leaf hashes
  const prefix = Buffer.from([0x00]);
  const addressBytes = Buffer.from(address, "utf-8");
  const startBytes = bigintToBe16(cumulativeStart);
  const endBytes = bigintToBe16(cumulativeEnd);
  return sha256(Buffer.concat([prefix, addressBytes, startBytes, endBytes]));
}

export function bigintToBe16(value: bigint): Buffer {
  const buf = Buffer.alloc(16);
  for (let i = 15; i >= 0; i--) {
    buf[i] = Number(value & BigInt(0xff));
    value >>= BigInt(8);
  }
  return buf;
}

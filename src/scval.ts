/**
 * Typed ScVal decoding utilities.
 *
 * Soroban contract calls return `xdr.ScVal` values from `simulateTransaction`.
 * The raw host representation differs from the plain-JS shapes the SDK exposes:
 * - maps come back as `ScVal.scvMap(...)`, not objects
 * - `i128`/`u64` values come back as `BigInt`, not numbers or strings
 * - `Address` values come back as strkey strings
 * - 32-byte identifiers (`BytesN<32>`) come back as bytes, not addresses
 *
 * These helpers normalize that surface so modules can parse contract results
 * without hand-rolling XDR handling. They also accept already-native plain
 * values (e.g. in tests or mocks) so callers can be written once.
 */

import * as StellarSdk from '@stellar/stellar-sdk';

/** The stellar-base XDR `ScVal` type. */
export type ScVal = StellarSdk.xdr.ScVal;

const SCVAL_BYTES_LEN = 32;

/** Convert an `ScVal` (or a value already produced by `scValToNative`) into a
 * plain JS value. Unknown/scval-less inputs pass through untouched. */
export function toNative(value: unknown): unknown {
  if (value instanceof StellarSdk.xdr.ScVal) {
    return StellarSdk.scValToNative(value);
  }
  return value;
}

/** Decode an `ScVal` into a plain object. Non-map values yield `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  const native = toNative(value);
  if (native !== null && typeof native === 'object' && !Array.isArray(native)) {
    return native as Record<string, unknown>;
  }
  return {};
}

/** Decode an `ScVal` into a string (symbols, strings, and addresses). */
export function asString(value: unknown): string {
  const native = toNative(value);
  if (native === null || native === undefined) return '';
  return String(native);
}

/** Decode a fixed-point integer `ScVal` (i128/u64/etc) into a decimal string.
 * Amounts are returned as strings to avoid JS precision loss. */
export function asAmount(value: unknown): string {
  const native = toNative(value);
  if (native === null || native === undefined) return '0';
  return native.toString();
}

/** Decode a fixed-point integer `ScVal` into a JS number. Prefer `asAmount`
 * for values that can exceed `Number.MAX_SAFE_INTEGER`. */
export function asNumber(value: unknown): number {
  const native = toNative(value);
  if (native === null || native === undefined) return 0;
  return Number(native);
}

/** Decode an `ScVal` into a boolean. */
export function asBoolean(value: unknown): boolean {
  const native = toNative(value);
  if (native === null || native === undefined) return false;
  return Boolean(native);
}

/** Decode an address `ScVal` into its strkey string form. */
export function asAddress(value: unknown): string {
  const native = toNative(value);
  if (native === null || native === undefined) return '';
  return String(native);
}

/** Decode a bytes `ScVal` into a Buffer. */
export function asBytes(value: unknown): Buffer {
  const native = toNative(value);
  if (native === null || native === undefined) return Buffer.alloc(0);
  if (Buffer.isBuffer(native)) return native;
  if (native instanceof Uint8Array) return Buffer.from(native);
  if (typeof native === 'string') return Buffer.from(native, 'base64');
  return Buffer.alloc(0);
}

/** Decode a vector `ScVal` into a JS array. */
export function asVec(value: unknown): unknown[] {
  const native = toNative(value);
  if (Array.isArray(native)) return native;
  if (native !== null && typeof native === 'object') {
    return Object.values(native);
  }
  return [];
}

/** Decode an option `ScVal` (or `scvVoid`) into `undefined` when absent. */
export function asOption<T>(value: unknown, decode: (v: unknown) => T): T | undefined {
  const native = toNative(value);
  if (native === null || native === undefined) return undefined;
  return decode(native);
}

/** Convert a byte Buffer to a lowercase hex string. */
export function bytesToHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString('hex');
}

/** Convert a hex string (optionally `0x`-prefixed) to a Buffer. */
export function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex.replace(/^0x/, ''), 'hex');
}

/**
 * Build the `ScVal` used on-chain for 32-byte identifiers (project ids, pool
 * ids, order ids, retirement ids, nullifiers). These are `BytesN<32>` in the
 * contracts and must be encoded as `ScVal.bytes`, *not* addresses.
 *
 * @param hexOrBytes - 32-byte value as a hex string or Buffer.
 */
export function idToScVal(hexOrBytes: string | Buffer): ScVal {
  const bytes =
    typeof hexOrBytes === 'string' ? hexToBytes(hexOrBytes) : Buffer.from(hexOrBytes);
  if (bytes.length !== SCVAL_BYTES_LEN) {
    throw new TypeError(
      `Expected a 32-byte identifier, received ${bytes.length} bytes`,
    );
  }
  return StellarSdk.nativeToScVal(bytes, { type: 'bytes' });
}

/** Decode a 32-byte `ScVal` identifier into a lowercase hex string. */
export function idFromScVal(value: unknown): string {
  const bytes = asBytes(value);
  if (bytes.length !== SCVAL_BYTES_LEN) {
    throw new TypeError(
      `Expected a 32-byte identifier ScVal, received ${bytes.length} bytes`,
    );
  }
  return bytesToHex(bytes);
}

/** Order book sides encoded on-chain as a one-element vector of symbols
 * (`Vec<Symbol>`, e.g. `["Buy"]`). */
export function sideToScVal(side: 'buy' | 'sell'): ScVal {
  const variant = side === 'buy' ? 'Buy' : 'Sell';
  return StellarSdk.nativeToScVal([
    StellarSdk.nativeToScVal(variant, { type: 'symbol' }),
  ]);
}

/** Decode an order-side `ScVal` into a lowercase `'buy' | 'sell'`. */
export function asSide(value: unknown): 'buy' | 'sell' {
  const variant = asString(asVec(value)[0]).toLowerCase();
  if (variant === 'sell') return 'sell';
  return 'buy';
}

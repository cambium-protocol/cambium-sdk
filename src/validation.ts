/**
 * Input validation helpers.
 *
 * Write methods build and simulate transactions, which costs a network
 * round-trip. These helpers reject malformed inputs locally — before any RPC
 * call — with a typed `ConfigError` naming the offending parameter, so
 * integrators get fast, clear feedback instead of an opaque simulation
 * failure or a transaction that is rejected on-chain.
 */

import { ConfigError } from './errors';

/** Match a non-negative integer amount expressed as a decimal string. */
const AMOUNT_RE = /^(0|[1-9]\d*)$/;

/** Match a 32-byte identifier expressed as lowercase/uppercase hex. */
const ID_RE = /^[0-9a-fA-F]{64}$/;

/** Render a value in an error message without throwing on BigInt. */
function describe(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

/**
 * Assert that `value` is a non-negative integer decimal string (as all on-chain
 * amounts are represented). Throws `ConfigError` otherwise.
 */
export function assertValidAmount(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !AMOUNT_RE.test(value)) {
    throw new ConfigError(
      `${name} must be a non-negative integer string, received ${describe(value)}`,
    );
  }
}

/**
 * Assert that `value` is a 32-byte identifier in hex form (project ids, pool
 * ids, order ids, retirement ids, nullifiers). Throws `ConfigError` otherwise.
 */
export function assertValidId(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new ConfigError(
      `${name} must be a 32-byte hex string, received ${describe(value)}`,
    );
  }
}

/**
 * Assert that `value` is a positive calendar year (e.g. 2025) usable as a
 * vintage year. Throws `ConfigError` otherwise.
 */
export function assertValidYear(name: string, value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new ConfigError(
      `${name} must be a positive integer year, received ${describe(value)}`,
    );
  }
}

/**
 * Typed contract events.
 *
 * Soroban contracts emit events that are surfaced by the RPC server as raw
 * `xdr.ScVal` topics and values. These helpers decode the Cambium contracts'
 * events into typed structures and reconstruct on-chain record ids where the
 * contract derives them from event-visible data.
 *
 * Retirement events (`retire`):
 *   topics: ("retire", project_id: BytesN<32>, retiree: RetireeRef)
 *   data:   (vintage_year: u32, amount: i128)
 *
 * The retirement record id is keccak256(project_id || vintage_year_be ||
 * amount_be || ledger_sequence_be) and `retired_at` is the ledger sequence,
 * so both can be rebuilt exactly from the event — event listings round-trip
 * with `getRetirement(id)`.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { keccak256 } from 'js-sha3';
import { RetireeRef } from './types';
import {
  asAmount,
  asNumber,
  asString,
  asVec,
  idFromScVal,
} from './scval';

/** A decoded `retire` event emitted by the retirement contract. */
export interface RetireEvent {
  /** Retirement contract that emitted the event. */
  contractId: string;
  /** Ledger sequence the event occurred on. */
  ledger: number;
  /** ISO timestamp of the closing ledger. */
  ledgerClosedAt: string;
  /** Soroban event id. */
  id: string;
  /** Pagination token for this event. */
  pagingToken: string;
  /** Project the retired credits belong to (32-byte hex id). */
  projectId: string;
  /** Who performed the retirement. */
  retiree: RetireeRef;
  /** Vintage year of the retired credits. */
  vintageYear: number;
  /** Number of credits retired. */
  amount: string;
}

/**
 * Decode a raw `retire` event (as returned by `Server.getEvents`) into a
 * typed `RetireEvent`.
 */
export function parseRetireEvent(
  raw: StellarSdk.SorobanRpc.Api.EventResponse,
): RetireEvent {
  const topic = (raw.topic ?? []).map((t) => t);
  const projectId = idFromScVal(topic[1]);
  const retiree = parseRetiree(topic[2]);
  const value = asVec(raw.value);

  return {
    contractId: String(raw.contractId ?? ''),
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    id: raw.id,
    pagingToken: raw.pagingToken,
    projectId,
    retiree,
    vintageYear: asNumber(value[0]),
    amount: asAmount(value[1]),
  };
}

/** Decode a `RetireeRef` enum topic value (`["Public", addr]` | `["Shielded", bytes]`). */
function parseRetiree(value: unknown): RetireeRef {
  const parts = asVec(value);
  const variant = asString(parts[0]);
  if (variant === 'Public') {
    return { type: 'public', address: asString(parts[1]) };
  }
  return { type: 'shielded', nullifierHash: idFromScVal(parts[1]) };
}

/**
 * Reconstruct a retirement record id exactly as the contract derives it:
 * `keccak256(project_id_bytes || vintage_year_be || amount_be || sequence_be)`.
 *
 * @param projectId - Project id (32-byte hex)
 * @param vintageYear - Vintage year
 * @param amount - Amount retired (decimal string)
 * @param ledger - Ledger sequence of the retirement
 */
export function retirementRecordId(
  projectId: string,
  vintageYear: number,
  amount: string,
  ledger: number,
): string {
  const sequence = Buffer.alloc(8);
  sequence.writeBigUInt64BE(BigInt(ledger), 0);

  const vintage = Buffer.alloc(4);
  vintage.writeUInt32BE(vintageYear, 0);

  const preimage = Buffer.concat([
    Buffer.from(projectId, 'hex'),
    vintage,
    i128ToBigEndianBytes(BigInt(amount)),
    sequence,
  ]);

  return keccak256(preimage);
}

/** Encode an i128 as 16 big-endian bytes (two's complement). */
export function i128ToBigEndianBytes(value: bigint): Buffer {
  const masked = BigInt.asUintN(128, value);
  return Buffer.from(masked.toString(16).padStart(32, '0'), 'hex');
}

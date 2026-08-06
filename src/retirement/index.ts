/**
 * Retirement module — read and write operations for credit retirement.
 *
 * Maps to the `retirement` Soroban contract:
 * - retire(params) -> Transaction (unsigned)
 * - getRetirement(id) -> RetirementRecord
 * - listRetirements(filter?) -> RetirementRecord[] (event-based)
 * - getRetirementEvents(opts?) -> RetireEvent[] (typed events API)
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import {
  RetireParams,
  RetirementRecord,
  RetirementFilter,
  RetireeRef,
} from '../types';
import { ConfigError } from '../errors';
import { parseRetireEvent, retirementRecordId, RetireEvent } from '../events';
import {
  asAmount,
  asBytes,
  asNumber,
  asRecord,
  asString,
  bytesToHex,
  idFromScVal,
  idToScVal,
} from '../scval';

export class RetirementModule {
  private client: CambiumClient;

  constructor(client: CambiumClient) {
    this.client = client;
  }

  /** Get the retirement contract address. */
  private get contractId(): string {
    return this.client.contracts.retirement;
  }

  /**
   * Build an unsigned transaction to retire carbon credits.
   *
   * @param params - Retirement parameters (from, projectId, vintageYear,
   * amount, shield?, nullifier?)
   * @returns An unsigned transaction ready for signing and submission.
   *
   * Retirements are public by default: the retiring address is recorded
   * on-chain. When `shield: true`, only `nullifier` is recorded — the caller
   * must supply a 32-byte nullifier commitment derived off-chain from a
   * secret so the contract cannot link the retirement back to the caller.
   */
  async retire(params: RetireParams): Promise<StellarSdk.Transaction> {
    const shield = params.shield ?? false;
    const nullifier = params.nullifier ?? '00'.repeat(32);

    if (shield && !params.nullifier) {
      throw new ConfigError(
        'nullifier is required when shield is true',
      );
    }
    if (shield && nullifier === '00'.repeat(32)) {
      throw new ConfigError('nullifier must be non-zero for shielded retirement');
    }

    const args = [
      new StellarSdk.Address(params.from).toScVal(),
      idToScVal(params.projectId),
      StellarSdk.nativeToScVal(params.vintageYear, { type: 'u32' }),
      StellarSdk.nativeToScVal(params.amount, { type: 'i128' }),
      StellarSdk.nativeToScVal(shield, { type: 'bool' }),
      idToScVal(nullifier),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'retire',
      args,
      params.from,
    );
  }

  /**
   * Retrieve a retirement record by its on-chain ID.
   * @param id - The 32-byte hex retirement record ID
   */
  async getRetirement(id: string): Promise<RetirementRecord> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_retirement',
      [idToScVal(id)],
    );

    return this.parseRecord(result);
  }

  /**
   * List retirement records matching an optional filter.
   *
   * Soroban storage does not support iteration, so this method reconstructs
   * the list from `retire` events (see `getRetirementEvents`). The contract
   * derives each record id as keccak256(project_id, vintage_year, amount,
   * ledger_sequence) and records `retired_at` as the ledger sequence, so the
   * returned records round-trip exactly with `getRetirement(id)`.
   *
   * Events are only fetched for a recent ledger window (the latest 50,000
   * ledgers by default); for full historical listing, pass `startLedger` to
   * `getRetirementEvents` and index off-chain.
   *
   * @param filter - Optional filter (projectId, public retiree address)
   */
  async listRetirements(
    filter: RetirementFilter = {},
  ): Promise<RetirementRecord[]> {
    const events = await this.getRetirementEvents();
    let records = events.map((event) => ({
      id: retirementRecordId(
        event.projectId,
        event.vintageYear,
        event.amount,
        event.ledger,
      ),
      projectId: event.projectId,
      vintageYear: event.vintageYear,
      amount: event.amount,
      retiredAt: event.ledger,
      retiree: event.retiree,
    }));

    if (filter.projectId) {
      records = records.filter((r) => r.projectId === filter.projectId);
    }
    if (filter.retiree) {
      records = records.filter(
        (r) =>
          r.retiree.type === 'public' &&
          r.retiree.address === filter.retiree,
      );
    }

    return records;
  }

  /**
   * Fetch and decode raw `retire` events emitted by the retirement contract.
   *
   * Each event carries everything needed to reconstruct the retirement
   * (project, vintage, amount, retiree, ledger). This is the on-chain
   * event-based view; pair it with `listRetirements` for record-shaped
   * results.
   *
   * @param opts - Ledger range and pagination options for the RPC query
   */
  async getRetirementEvents(opts?: {
    startLedger?: number;
    limit?: number;
  }): Promise<RetireEvent[]> {
    const events = await this.client.getContractEvents(
      this.contractId,
      'retire',
      opts,
    );
    return events.map(parseRetireEvent);
  }

  // -- Parsers --

  private parseRecord(value: unknown): RetirementRecord {
    const obj = asRecord(value);
    const retireeRaw = asRecord(obj.retiree);

    let retiree: RetireeRef;
    if (retireeRaw.Public !== undefined) {
      retiree = {
        type: 'public',
        address: asString(retireeRaw.Public),
      };
    } else if (retireeRaw.Shielded !== undefined) {
      retiree = {
        type: 'shielded',
        nullifierHash: bytesToHex(asBytes(retireeRaw.Shielded)),
      };
    } else {
      retiree = { type: 'public', address: '' };
    }

    return {
      id: idFromScVal(obj.id),
      projectId: idFromScVal(obj.project_id),
      vintageYear: asNumber(obj.vintage_year),
      amount: asAmount(obj.amount),
      retiredAt: asNumber(obj.retired_at),
      retiree,
    };
  }
}

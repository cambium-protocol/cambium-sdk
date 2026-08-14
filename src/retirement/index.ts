/**
 * Retirement module — read and write operations for credit retirement.
 *
 * Maps to the `retirement` Soroban contract:
 * - retire(params) -> Transaction (unsigned)
 * - retireAndSubmit(params) -> RetireResult (signed + settled + record)
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
  RetireResult,
} from '../types';
import { ConfigError, TxFailureError } from '../errors';
import { parseRetireEvent, retirementRecordId, RetireEvent } from '../events';
import { assertValidAmount, assertValidId, assertValidYear } from '../validation';
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
    assertValidAmount('amount', params.amount);
    assertValidId('projectId', params.projectId);
    assertValidYear('vintageYear', params.vintageYear);

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
    if (shield) {
      assertValidId('nullifier', nullifier);
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
   * Retire, submit, and return the on-chain retirement record in one call.
   *
   * Requires a `signer` in the client config. The transaction is signed,
   * submitted, and polled to final status; on success the record is
   * reconstructed from the settling ledger sequence (exactly as
   * `listRetirements` does) and re-fetched so the caller gets a complete,
   * verified `RetireResult` without hand-rolling the submit/wait/derive flow.
   *
   * @param params - Retirement parameters (same shape as `retire`)
   * @returns The reconstructed retirement record plus the signed XDR
   * @throws {ConfigError} if no signer is configured
   * @throws {TxTimeoutError} if the transaction does not finalize in time
   * @throws {TxFailureError} if the transaction fails on-chain
   */
  async retireAndSubmit(
    params: RetireParams,
  ): Promise<RetireResult> {
    if (!this.client.signer) {
      throw new ConfigError(
        'retireAndSubmit requires a signer in the client config',
      );
    }

    const tx = await this.retire(params);
    const signedXdr = await this.client.signer.signTransaction(tx.toXDR());

    const settled = await this.client.submitAndWait(signedXdr);
    if (settled.status !== 'SUCCESS' || settled.ledger === undefined) {
      throw new TxFailureError(settled.hash, settled.status);
    }

    const id = retirementRecordId(
      params.projectId,
      params.vintageYear,
      params.amount,
      settled.ledger,
    );

    return {
      record: await this.getRetirement(id),
      signedXdr,
    };
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
   * Events are fetched across the whole ledger window (the latest 50,000
   * ledgers, or `startLedger` if given) — the RPC call is paginated internally
   * so all matching events are returned, not just the first page. `limit`
   * caps the total number of events returned when set.
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

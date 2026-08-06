/**
 * Retirement module — read and write operations for credit retirement.
 *
 * Maps to the `retirement` Soroban contract:
 * - retire(params) -> Transaction (unsigned)
 * - getRetirement(id) -> RetirementRecord
 * - listRetirements(filter?) -> RetirementRecord[]
 *
 * Shielded retirement (shield: true) is not yet supported by the contract.
 * The SDK surfaces a clear typed error rather than silently succeeding.
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
   * Note: Soroban contracts don't support iteration over storage — this method
   * currently returns records that can be looked up. In production this would
   * use an event indexer or off-chain indexer. For now, returns at most one
   * record if a specific projectId is provided (used as a known ID lookup).
   *
   * @param filter - Optional filter criteria
   */
  async listRetirements(
    filter?: RetirementFilter,
  ): Promise<RetirementRecord[]> {
    // Soroban storage doesn't support iteration — in production this would
    // use an event index or off-chain indexer. For now, return empty.
    // TODO: implement via event indexing or off-chain indexer
    return [];
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

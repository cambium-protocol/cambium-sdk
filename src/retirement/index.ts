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
import { NotYetImplementedError } from '../errors';

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
   * @param params - Retirement parameters (from, projectId, vintageYear, amount, shield?)
   * @returns An unsigned transaction ready for signing and submission.
   *
   * When `shield: true`, throws NotYetImplementedError because the underlying
   * contract does not yet support shielded retirement. This is never a silent
   * success — the contract would also reject it, and we surface that early.
   */
  async retire(params: RetireParams): Promise<StellarSdk.Transaction> {
    if (params.shield) {
      throw new NotYetImplementedError(
        'shielded retirement (shield: true) — contract does not yet support this path',
      );
    }

    const args = [
      new StellarSdk.Address(params.from).toScVal(),
      new StellarSdk.Address(params.projectId).toScVal(),
      StellarSdk.nativeToScVal(params.vintageYear, { type: 'u32' }),
      StellarSdk.nativeToScVal(params.amount, { type: 'i128' }),
      StellarSdk.nativeToScVal(false, { type: 'bool' }),
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
      [new StellarSdk.Address(id).toScVal()],
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
    const obj = value as Record<string, unknown>;
    const retireeRaw = obj.retiree as Record<string, unknown> | undefined;

    let retiree: RetireeRef;
    if (retireeRaw && 'Public' in retireeRaw) {
      retiree = {
        type: 'public',
        address: String((retireeRaw.Public as Record<string, unknown>)._0 || ''),
      };
    } else if (retireeRaw && 'Shielded' in retireeRaw) {
      retiree = {
        type: 'shielded',
        nullifierHash: String(
          (retireeRaw.Shielded as Record<string, unknown>)._0 || '',
        ),
      };
    } else {
      retiree = { type: 'public', address: '' };
    }

    return {
      id: String(obj.id || ''),
      projectId: String(obj.project_id || ''),
      vintageYear: Number(obj.vintage_year || 0),
      amount: String(obj.amount || '0'),
      retiredAt: Number(obj.retired_at || 0),
      retiree,
    };
  }
}

/**
 * Retirement module — stubs for credit retirement operations.
 *
 * DEFERRED to Day 4: This module contains typed stubs only.
 * Full implementation will include:
 * - retire(params) -> Transaction (unsigned)
 * - getRetirement(id) -> RetirementRecord
 * - listRetirements(filter?) -> RetirementRecord[]
 * - Shielded retirement via ZK proof provider
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import { RetireParams, RetirementRecord, RetirementFilter } from '../types';
import { NotYetImplementedError } from '../errors';

export class RetirementModule {
  private client: CambiumClient;

  constructor(client: CambiumClient) {
    this.client = client;
  }

  /**
   * Retire carbon credits (stub — not yet implemented).
   * TODO: Implement on Day 4
   */
  async retire(_params: RetireParams): Promise<StellarSdk.Transaction> {
    throw new NotYetImplementedError(
      'retirement.retire — will be implemented on Day 4',
    );
  }

  /**
   * Get a retirement record by ID (stub — not yet implemented).
   * TODO: Implement on Day 4
   */
  async getRetirement(_id: string): Promise<RetirementRecord> {
    throw new NotYetImplementedError(
      'retirement.getRetirement — will be implemented on Day 4',
    );
  }

  /**
   * List retirement records (stub — not yet implemented).
   * TODO: Implement on Day 4
   */
  async listRetirements(
    _filter?: RetirementFilter,
  ): Promise<RetirementRecord[]> {
    throw new NotYetImplementedError(
      'retirement.listRetirements — will be implemented on Day 4',
    );
  }
}

/**
 * Credits module — read and write operations for the credit token.
 *
 * Maps to the `credit-token` SEP-41 contract:
 * - balanceOf(address) -> string (balance as decimal string)
 * - transfer(from, to, amount) -> Transaction (unsigned)
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import { TransferParams } from '../types';
import { ConfigError } from '../errors';

export class CreditsModule {
  private client: CambiumClient;

  constructor(client: CambiumClient) {
    this.client = client;
  }

  /** Get the credit token contract address. */
  private get contractId(): string {
    return this.client.contracts.creditToken;
  }

  /**
   * Get the token balance for an address.
   * @param address - The Stellar address to check
   * @returns Balance as a decimal string
   */
  async balanceOf(address: string): Promise<string> {
    const result = await this.client.invokeContract(
      this.contractId,
      'balance',
      [new StellarSdk.Address(address).toScVal()],
    );

    return String(result);
  }

  /**
   * Build an unsigned transaction to transfer credits.
   * @param params - Transfer parameters (from, to, amount)
   * @returns Unsigned transaction ready for signing
   */
  async transfer(params: TransferParams): Promise<StellarSdk.Transaction> {
    const args = [
      new StellarSdk.Address(params.from).toScVal(),
      new StellarSdk.Address(params.to).toScVal(),
      StellarSdk.nativeToScVal(params.amount, { type: 'i128' }),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'transfer',
      args,
      params.from,
    );
  }

  /**
   * Transfer and submit in one step (requires signer in client config).
   * @param params - Transfer parameters
   */
  async transferAndSubmit(
    params: TransferParams,
  ): Promise<{ status: string; hash?: string }> {
    const tx = await this.transfer(params);

    if (!this.client.signer) {
      throw new ConfigError(
        'transferAndSubmit requires a signer in the client config',
      );
    }

    const signedXdr = await this.client.signer.signTransaction(
      tx.toXDR(),
    );

    const result = await this.client.submit(signedXdr);
    return {
      status: result.status,
      hash: result.hash,
    };
  }
}

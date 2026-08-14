/**
 * Credits module — read and write operations for the credit token.
 *
 * Maps to the `credit-token` SEP-41 contract:
 * - balance(id) / allowance(owner, spender) -> reads
 * - transfer / transferFrom / approve -> Transactions (unsigned)
 * - name / symbol / decimals / admin / getBurner / isAllowlisted -> reads
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import {
  AllowanceParams,
  ApproveParams,
  TransferFromParams,
  TransferParams,
} from '../types';
import { asAmount, asBoolean, asNumber, asOption, asString } from '../scval';

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

    return asAmount(result);
  }

  /**
   * Get the allowance `spender` has over `owner`'s tokens.
   * @param params - Allowance parameters (owner, spender)
   * @returns Allowance as a decimal string
   */
  async allowance(params: AllowanceParams): Promise<string> {
    const result = await this.client.invokeContract(
      this.contractId,
      'allowance',
      [
        new StellarSdk.Address(params.owner).toScVal(),
        new StellarSdk.Address(params.spender).toScVal(),
      ],
    );

    return asAmount(result);
  }

  /**
   * Build an unsigned transaction to approve `spender` to spend up to
   * `amount` of `from`'s tokens.
   * @param params - Approval parameters (from, spender, amount)
   */
  async approve(params: ApproveParams): Promise<StellarSdk.Transaction> {
    const args = [
      new StellarSdk.Address(params.from).toScVal(),
      new StellarSdk.Address(params.spender).toScVal(),
      StellarSdk.nativeToScVal(params.amount, { type: 'i128' }),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'approve',
      args,
      params.from,
    );
  }

  /**
   * Build an unsigned transaction to transfer `amount` of `from`'s tokens to
   * `to` using an existing allowance granted to `spender`.
   * @param params - Transfer-from parameters (spender, from, to, amount)
   */
  async transferFrom(
    params: TransferFromParams,
  ): Promise<StellarSdk.Transaction> {
    const args = [
      new StellarSdk.Address(params.spender).toScVal(),
      new StellarSdk.Address(params.from).toScVal(),
      new StellarSdk.Address(params.to).toScVal(),
      StellarSdk.nativeToScVal(params.amount, { type: 'i128' }),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'transfer_from',
      args,
      params.spender,
    );
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
   * Get the token's name (SEP-41 `name`).
   */
  async name(): Promise<string> {
    const result = await this.client.invokeContract(
      this.contractId,
      'name',
      [],
    );
    return asString(result);
  }

  /**
   * Get the token's symbol (SEP-41 `symbol`).
   */
  async symbol(): Promise<string> {
    const result = await this.client.invokeContract(
      this.contractId,
      'symbol',
      [],
    );
    return asString(result);
  }

  /**
   * Get the number of decimals used to represent amounts on-chain
   * (SEP-41 `decimals`). Combined with `name`/`symbol` this lets integrators
   * render balances without hardcoding token metadata.
   */
  async decimals(): Promise<number> {
    const result = await this.client.invokeContract(
      this.contractId,
      'decimals',
      [],
    );
    return asNumber(result);
  }

  /**
   * Get the token contract's admin address (the registry contract on-chain).
   */
  async admin(): Promise<string> {
    const result = await this.client.invokeContract(
      this.contractId,
      'admin',
      [],
    );
    return asString(result);
  }

  /**
   * Get the authorized burner contract address, if one has been configured.
   */
  async getBurner(): Promise<string | undefined> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_burner',
      [],
    );
    return asOption(result, asString);
  }

  /**
   * Check whether an address is allowlisted.
   * @param address - The address to check
   */
  async isAllowlisted(address: string): Promise<boolean> {
    const result = await this.client.invokeContract(
      this.contractId,
      'is_allowlisted',
      [new StellarSdk.Address(address).toScVal()],
    );
    return asBoolean(result);
  }

  /**
   * Transfer and submit in one step (requires signer in client config).
   * @param params - Transfer parameters
   */
  async transferAndSubmit(
    params: TransferParams,
  ): Promise<{ status: string; hash?: string }> {
    const tx = await this.transfer(params);
    const result = await this.client.signAndSend(tx);
    return {
      status: result.status,
      hash: result.hash,
    };
  }
}

/**
 * Marketplace module — read and write operations for AMM pools and trading.
 *
 * Maps to the `marketplace` Soroban contract:
 * - getPool(poolId) -> PoolState
 * - quote(poolId, amountIn) -> Quote (read-only price estimate)
 * - swap(params) -> Transaction (unsigned)
 * - placeLimitOrder -> stub (NotYetImplemented)
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import { PoolState, Quote, SwapParams } from '../types';
import { NotYetImplementedError, PoolNotFoundError } from '../errors';

export class MarketplaceModule {
  private client: CambiumClient;

  constructor(client: CambiumClient) {
    this.client = client;
  }

  /** Get the marketplace contract address. */
  private get contractId(): string {
    return this.client.contracts.marketplace;
  }

  /**
   * Get the state of a liquidity pool.
   * @param poolId - The pool's ID (32-byte hex)
   */
  async getPool(poolId: string): Promise<PoolState> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_pool',
      [new StellarSdk.Address(poolId).toScVal()],
    );

    return this.parsePool(result);
  }

  /**
   * Get a price quote for swapping through a pool (read-only, no tx).
   *
   * Calculates the expected output amount using the constant-product formula
   * without building a transaction. Useful for displaying estimated prices.
   *
   * @param params - The swap parameters (poolId, amountIn)
   * @returns A Quote with expected output and price impact
   */
  async quote(params: { poolId: string; amountIn: string }): Promise<Quote> {
    const pool = await this.getPool(params.poolId);

    const creditReserves = BigInt(pool.creditReserves);
    const pairedReserves = BigInt(pool.pairedReserves);
    const amountIn = BigInt(params.amountIn);

    // Constant-product AMM: dy = (y * dx) / (x + dx)
    const amountOut =
      (pairedReserves * amountIn) / (creditReserves + amountIn);

    // Price impact = (amountOut / amountIn) / (pairedReserves / creditReserves) - 1
    const spotPrice = pairedReserves * 10000n / creditReserves;
    const executionPrice = amountOut * 10000n / amountIn;
    const priceImpact =
      ((executionPrice - spotPrice) * 10000n) / spotPrice;

    return {
      poolId: params.poolId,
      amountIn: params.amountIn,
      amountOut: amountOut.toString(),
      priceImpact: `${Number(priceImpact) / 100}%`,
    };
  }

  /**
   * Build an unsigned transaction to swap tokens through an AMM pool.
   * @param params - Swap parameters (poolId, amountIn, minAmountOut, trader)
   */
  async swap(params: SwapParams): Promise<StellarSdk.Transaction> {
    const args = [
      new StellarSdk.Address(params.poolId).toScVal(),
      StellarSdk.nativeToScVal(params.amountIn, { type: 'i128' }),
      StellarSdk.nativeToScVal(params.minAmountOut, { type: 'i128' }),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'swap',
      args,
      params.trader,
    );
  }

  /**
   * Place a limit order (not yet implemented — deferred per roadmap).
   */
  async placeLimitOrder(): Promise<never> {
    throw new NotYetImplementedError(
      'limit order book (place_limit_order)',
    );
  }

  /**
   * Cancel an order (not yet implemented — deferred per roadmap).
   */
  async cancelOrder(): Promise<never> {
    throw new NotYetImplementedError('cancel order');
  }

  /**
   * Get the order book (not yet implemented — deferred per roadmap).
   */
  async getOrderBook(): Promise<never> {
    throw new NotYetImplementedError('order book');
  }

  // -- Parser --

  private parsePool(value: unknown): PoolState {
    const obj = value as Record<string, unknown>;
    return {
      id: String(obj.id || ''),
      creditToken: String(obj.credit_token || ''),
      pairedAsset: String(obj.paired_asset || ''),
      creditReserves: String(obj.credit_reserves || '0'),
      pairedReserves: String(obj.paired_reserves || '0'),
    };
  }
}

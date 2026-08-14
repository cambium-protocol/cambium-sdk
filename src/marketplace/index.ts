/**
 * Marketplace module — read and write operations for AMM pools and the order
 * book.
 *
 * Maps to the `marketplace` Soroban contract:
 * - getPool(poolId) -> PoolState
 * - quote(poolId, amountIn) -> Quote (read-only price estimate)
 * - swap(params) -> Transaction (unsigned)
 * - placeLimitOrder / cancelOrder -> Transaction (unsigned)
 * - getOrder(orderId) / getOrderBook(poolId) -> Order reads
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import {
  CancelOrderParams,
  CreatePoolParams,
  Order,
  PlaceLimitOrderParams,
  PoolState,
  Quote,
  SwapParams,
} from '../types';
import {
  asAmount,
  asNumber,
  asRecord,
  asSide,
  asString,
  asVec,
  idFromScVal,
  idToScVal,
  sideToScVal,
} from '../scval';
import { assertValidAmount, assertValidId } from '../validation';

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
      [idToScVal(poolId)],
    );

    return this.parsePool(result);
  }

  /**
   * Build an unsigned transaction to create a new liquidity pool.
   *
   * The creator must provide initial liquidity for both sides of the pool.
   * Tokens are transferred from the creator to the pool via
   * approve + transfer_from, so the creator must approve the marketplace to
   * spend both tokens before submitting this transaction.
   *
   * @param params - Pool parameters (poolId, creditToken, pairedAsset,
   * initialCredit, initialPaired, creator)
   * @returns An unsigned transaction that resolves to the created pool.
   */
  async createPool(params: CreatePoolParams): Promise<StellarSdk.Transaction> {
    assertValidId('poolId', params.poolId);
    assertValidAmount('initialCredit', params.initialCredit);
    assertValidAmount('initialPaired', params.initialPaired);
    const args = [
      idToScVal(params.poolId),
      new StellarSdk.Address(params.creditToken).toScVal(),
      StellarSdk.nativeToScVal(params.pairedAsset, { type: 'symbol' }),
      StellarSdk.nativeToScVal(params.initialCredit, { type: 'i128' }),
      StellarSdk.nativeToScVal(params.initialPaired, { type: 'i128' }),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'create_pool',
      args,
      params.creator,
    );
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
    assertValidId('poolId', params.poolId);
    assertValidAmount('amountIn', params.amountIn);
    assertValidAmount('minAmountOut', params.minAmountOut);
    const args = [
      idToScVal(params.poolId),
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
   * Build an unsigned transaction to place a limit order on the order book.
   *
   * The sold asset is escrowed to the marketplace immediately: sell orders
   * escrow `amount` credit tokens, buy orders escrow `amount * price` units of
   * the paired asset (the caller must approve the marketplace to transfer the
   * escrow token first). The order sweeps resting opposite-side orders that
   * cross, then rests the unfilled remainder on the book.
   *
   * @param params - Order parameters
   * @returns An unsigned transaction that resolves to the placed order's id.
   */
  async placeLimitOrder(
    params: PlaceLimitOrderParams,
  ): Promise<StellarSdk.Transaction> {
    assertValidAmount('amount', params.amount);
    assertValidAmount('price', params.price);
    assertValidId('poolId', params.poolId);
    const args = [
      new StellarSdk.Address(params.trader).toScVal(),
      sideToScVal(params.side),
      StellarSdk.nativeToScVal(params.amount, { type: 'i128' }),
      StellarSdk.nativeToScVal(params.price, { type: 'i128' }),
      idToScVal(params.poolId),
      new StellarSdk.Address(params.pairedToken).toScVal(),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'place_limit_order',
      args,
      params.trader,
    );
  }

  /**
   * Build an unsigned transaction to cancel a resting order and refund its
   * escrow to the order's trader.
   *
   * @param params - Cancellation parameters (trader, orderId)
   * @returns An unsigned transaction. Errors: Unauthorized if `trader` is not
   * the owner, NotFound if the order does not exist, OrderClosed if it was
   * already fully filled or cancelled.
   */
  async cancelOrder(
    params: CancelOrderParams,
  ): Promise<StellarSdk.Transaction> {
    assertValidId('orderId', params.orderId);
    const args = [
      new StellarSdk.Address(params.trader).toScVal(),
      idToScVal(params.orderId),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'cancel_order',
      args,
      params.trader,
    );
  }

  /**
   * Get a single resting order by id.
   * @param orderId - The order's id (32-byte hex)
   */
  async getOrder(orderId: string): Promise<Order> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_order',
      [idToScVal(orderId)],
    );
    return this.parseOrder(result);
  }

  /**
   * Get all resting orders for a pool.
   * @param poolId - The pool's id (32-byte hex)
   */
  async getOrderBook(poolId: string): Promise<Order[]> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_orders',
      [idToScVal(poolId)],
    );
    return this.parseOrders(result);
  }

  // -- Parsers --

  private parsePool(value: unknown): PoolState {
    const obj = asRecord(value);
    return {
      id: idFromScVal(obj.id),
      creditToken: asString(obj.credit_token),
      pairedAsset: asString(obj.paired_asset),
      creditReserves: asAmount(obj.credit_reserves),
      pairedReserves: asAmount(obj.paired_reserves),
    };
  }

  private parseOrder(value: unknown): Order {
    const obj = asRecord(value);
    return {
      id: idFromScVal(obj.id),
      trader: asString(obj.trader),
      side: asSide(obj.side),
      amount: asAmount(obj.amount),
      remaining: asAmount(obj.remaining),
      price: asAmount(obj.price),
      poolId: idFromScVal(obj.pool_id),
      pairedToken: asString(obj.paired_token),
      createdAt: asNumber(obj.created_at),
    };
  }

  private parseOrders(value: unknown): Order[] {
    return asVec(value).map((order) => this.parseOrder(order));
  }
}

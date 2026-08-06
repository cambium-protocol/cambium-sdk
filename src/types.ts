/**
 * Core types for the Cambium Protocol SDK.
 *
 * These types mirror the on-chain contract data models defined in
 * contracts/shared/src/lib.rs and contracts/registry/src/types.rs.
 */

/** Network type for client configuration. */
export type Network = 'testnet' | 'mainnet' | 'futurenet' | 'local';

/** Contract addresses deployed on-chain. */
export interface ContractAddresses {
  registry: string;
  creditToken: string;
  marketplace: string;
  retirement: string;
  zkVerifier?: string;
}

/** A registered carbon project. */
export interface Project {
  id: string;
  methodology: string;
  geography: string;
  externalRegistryRef?: string;
  verifyingKeyVersion: number;
}

/** Per-year issuance and retirement totals for a project. */
export interface Vintage {
  projectId: string;
  year: number;
  totalIssued: string;
  totalRetired: string;
}

/** A liquidity pool in the marketplace. */
export interface PoolState {
  id: string;
  creditToken: string;
  pairedAsset: string;
  creditReserves: string;
  pairedReserves: string;
}

/** Price quote from the AMM. */
export interface Quote {
  poolId: string;
  amountIn: string;
  amountOut: string;
  priceImpact: string;
}

/** A retirement record. */
export interface RetirementRecord {
  id: string;
  projectId: string;
  vintageYear: number;
  amount: string;
  retiredAt: number;
  retiree: RetireeRef;
}

/** Reference to who performed a retirement. */
export type RetireeRef =
  | { type: 'public'; address: string }
  | { type: 'shielded'; nullifierHash: string };

/** Parameters for a token transfer. */
export interface TransferParams {
  from: string;
  to: string;
  amount: string;
}

/** Parameters for transferring tokens on behalf of another address. */
export interface TransferFromParams {
  /** Address spending the allowance (authorizes the call). */
  spender: string;
  /** Address whose tokens are being moved. */
  from: string;
  to: string;
  amount: string;
}

/** Parameters for approving an allowance. */
export interface ApproveParams {
  /** Address granting the allowance (authorizes the call). */
  from: string;
  /** Address allowed to spend `from`'s tokens. */
  spender: string;
  amount: string;
}

/** Parameters for reading an allowance. */
export interface AllowanceParams {
  /** Token owner. */
  owner: string;
  /** Address allowed to spend `owner`'s tokens. */
  spender: string;
}

/** Parameters for a swap. */
export interface SwapParams {
  poolId: string;
  amountIn: string;
  minAmountOut: string;
  trader: string;
}

/** Parameters for creating a liquidity pool. */
export interface CreatePoolParams {
  /** Unique pool identifier (32-byte hex). */
  poolId: string;
  /** Address of the credit token contract. */
  creditToken: string;
  /** Symbol of the paired asset (e.g. "XLM", "USDC"). */
  pairedAsset: string;
  /** Initial credit token liquidity (must be > 0). */
  initialCredit: string;
  /** Initial paired-asset liquidity (must be > 0). */
  initialPaired: string;
  /** Address creating the pool and providing initial liquidity. */
  creator: string;
}

/** Side of a limit order. */
export type OrderSide = 'buy' | 'sell';

/** A resting limit order on the marketplace order book. */
export interface Order {
  id: string;
  /** Address that placed the order and funded its escrow. */
  trader: string;
  /** Which side of the book this order rests on. */
  side: OrderSide;
  /** Original credit quantity of the order. */
  amount: string;
  /** Unfilled credit quantity remaining (0 once filled or cancelled). */
  remaining: string;
  /** Limit price in paired-asset units per credit token. */
  price: string;
  /** Pool this order trades against (defines the credit token). */
  poolId: string;
  /** Contract address of the paired asset escrowed for buy orders. */
  pairedToken: string;
  /** Ledger timestamp when the order was placed. */
  createdAt: number;
}

/** A record of credits and paired asset exchanged in a fill. */
export interface Fill {
  /** Maker (resting) order id. */
  makerId: string;
  /** Taker (incoming) order id. */
  takerId: string;
  /** Credit tokens transferred from the seller to the buyer. */
  credits: string;
  /** Paired-asset units paid from the buyer to the seller. */
  paired: string;
}

/** Parameters for placing a limit order. */
export interface PlaceLimitOrderParams {
  /** Address placing the order (authorizes the call and funds escrow). */
  trader: string;
  /** Which side of the book to place the order on. */
  side: OrderSide;
  /** Credit quantity (must be > 0). */
  amount: string;
  /** Limit price in paired-asset units per credit (must be > 0). */
  price: string;
  /** Pool this order trades against (32-byte hex id). */
  poolId: string;
  /** Contract address of the paired asset to escrow for buy orders. */
  pairedToken: string;
}

/** Parameters for cancelling a limit order. */
export interface CancelOrderParams {
  /** Address that placed the order (must be the order owner). */
  trader: string;
  /** The order's id (32-byte hex). */
  orderId: string;
}

/** Parameters for retirement. */
export interface RetireParams {
  /** The address retiring the credits (authorizes the call). */
  from: string;
  /** The project these credits belong to (32-byte hex id). */
  projectId: string;
  /** The vintage year of the credits. */
  vintageYear: number;
  /** Number of credits to retire. */
  amount: string;
  /**
   * When true, only the `nullifier` is recorded on-chain (the retiree's
   * identity is not revealed). Defaults to false.
   */
  shield?: boolean;
  /**
   * Identity-hiding commitment for shielded retirements (32-byte hex).
   * Required when `shield: true`; ignored otherwise.
   */
  nullifier?: string;
}

/** Filter for listing projects. */
export interface ProjectFilter {
  methodology?: string;
  geography?: string;
}

/** Filter for listing retirement records. */
export interface RetirementFilter {
  projectId?: string;
  retiree?: string;
}

/** Result of a retirement operation. */
export interface RetireResult {
  record: RetirementRecord;
  /** The signed transaction XDR, if a signer was configured. */
  signedXdr?: string;
}

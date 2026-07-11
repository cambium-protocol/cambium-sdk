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

/** Parameters for a swap. */
export interface SwapParams {
  poolId: string;
  amountIn: string;
  minAmountOut: string;
  trader: string;
}

/** Parameters for retirement. */
export interface RetireParams {
  from: string;
  projectId: string;
  vintageYear: number;
  amount: string;
  shield?: boolean;
}

/** Filter for listing projects. */
export interface ProjectFilter {
  methodology?: string;
  geography?: string;
}

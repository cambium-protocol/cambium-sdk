/**
 * Cambium Protocol SDK — public API exports.
 */

// Client
export { CambiumClient, CambiumClientConfig, TxPollOptions } from './client';

// Types
export {
  Network,
  ContractAddresses,
  Project,
  Vintage,
  GovernanceConfig,
  VkeyState,
  PoolState,
  Quote,
  Order,
  OrderSide,
  Fill,
  RetirementRecord,
  RetireeRef,
  TransferParams,
  TransferFromParams,
  ApproveParams,
  AllowanceParams,
  SwapParams,
  CreatePoolParams,
  CancelOrderParams,
  PlaceLimitOrderParams,
  RetireParams,
  RetirementFilter,
  RetireResult,
  ProjectFilter,
} from './types';

// Modules (re-exported for direct access)
export { RegistryModule } from './registry';
export { CreditsModule } from './credits';
export { MarketplaceModule } from './marketplace';
export { RetirementModule } from './retirement';

// Events
export { RetireEvent, parseRetireEvent, retirementRecordId } from './events';

// Errors
export {
  CambiumError,
  ContractError,
  NotFoundError,
  InvalidProofError,
  AlreadyRegisteredError,
  InsufficientBalanceError,
  PoolNotFoundError,
  NotYetImplementedError,
  ConfigError,
  TxTimeoutError,
  TxFailureError,
  SimulationError,
} from './errors';

// Signers
export { Signer } from './signers/types';
export { FreighterSigner } from './signers/freighter';

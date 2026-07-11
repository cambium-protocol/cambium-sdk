/**
 * Typed error hierarchy for the Cambium SDK.
 *
 * All SDK methods throw a CambiumError subclass on failure,
 * mapping to on-chain error codes from contracts/shared/src/lib.rs.
 */

/** Base error for all Cambium SDK errors. */
export class CambiumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CambiumError';
  }
}

/** Error thrown when a contract call fails. */
export class ContractError extends CambiumError {
  public code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}

/** The requested entity was not found. */
export class NotFoundError extends ContractError {
  constructor(entity: string, id: string) {
    super(2, `${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/** The proof provided is invalid or malformed. */
export class InvalidProofError extends ContractError {
  constructor(message = 'Invalid proof') {
    super(4, message);
    this.name = 'InvalidProofError';
  }
}

/** The project has already been registered. */
export class AlreadyRegisteredError extends ContractError {
  constructor(id: string) {
    super(5, `Project already registered: ${id}`);
    this.name = 'AlreadyRegisteredError';
  }
}

/** Insufficient token balance. */
export class InsufficientBalanceError extends ContractError {
  constructor(message = 'Insufficient balance') {
    super(8, message);
    this.name = 'InsufficientBalanceError';
  }
}

/** Pool not found. */
export class PoolNotFoundError extends ContractError {
  constructor(poolId: string) {
    super(9, `Pool not found: ${poolId}`);
    this.name = 'PoolNotFoundError';
  }
}

/** Feature not yet implemented. */
export class NotYetImplementedError extends ContractError {
  constructor(feature: string) {
    super(7, `Not yet implemented: ${feature}`);
    this.name = 'NotYetImplementedError';
  }
}

/** Configuration error. */
export class ConfigError extends CambiumError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

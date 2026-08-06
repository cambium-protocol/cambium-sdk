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

/** A submitted transaction did not reach a final status in time. */
export class TxTimeoutError extends CambiumError {
  constructor(hash: string, timeoutMs: number) {
    super(
      `Transaction ${hash} did not reach a final status within ${timeoutMs}ms`,
    );
    this.name = 'TxTimeoutError';
  }
}

/**
 * A transaction simulation failed before reaching the network.
 *
 * Thrown when the Soroban RPC returns an error from `simulateTransaction`
 * that is not a recognized contract error code (e.g. a host/VM failure, an
 * expired ledger entry, or an invalid argument encoding).
 */
export class SimulationError extends CambiumError {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationError';
  }
}

/**
 * Extract a contract error code embedded in a simulation error string.
 *
 * Soroban RPC returns contract errors as strings, e.g.
 * `host invocation failed: ... ContractError(4) ...`. Returns the numeric
 * code when one is present, otherwise `undefined`.
 */
export function extractContractErrorCode(message: string): number | undefined {
  const contractError = message.match(/ContractError\((\d+)\)/);
  if (contractError) return Number(contractError[1]);

  const statusCode = message.match(/(?:error|failed).*?\bcode[:\s]+(\d+)/i);
  if (statusCode) return Number(statusCode[1]);

  return undefined;
}

/**
 * Convert a simulation error string into a typed SDK error.
 *
 * Recognized contract error codes surface as `ContractError` (so callers can
 * inspect `err.code`); anything else surfaces as `SimulationError`.
 */
export function fromSimulationError(message: string): CambiumError {
  const code = extractContractErrorCode(message);
  if (code !== undefined) {
    return new ContractError(code, message);
  }
  return new SimulationError(message);
}

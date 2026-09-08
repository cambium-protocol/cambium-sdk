/**
 * Unit tests for the error-mapping helpers.
 */

import {
  ContractError,
  SimulationError,
  extractContractErrorCode,
  fromSimulationError,
} from '../../src/errors';

describe('extractContractErrorCode', () => {
  test('parses a ContractError(n) code', () => {
    expect(
      extractContractErrorCode('host invocation failed: ContractError(4)'),
    ).toBe(4);
  });

  test('parses a generic status "code:" message (fallback branch)', () => {
    expect(extractContractErrorCode('transaction failed with code: 7')).toBe(7);
    expect(extractContractErrorCode('host error code 99')).toBe(99);
  });

  test('returns undefined when no code is present', () => {
    expect(extractContractErrorCode('ledger entry not found')).toBeUndefined();
    expect(extractContractErrorCode('')).toBeUndefined();
  });
});

describe('fromSimulationError', () => {
  test('maps a recognized code to a ContractError carrying the numeric code', () => {
    const err = fromSimulationError('host invocation failed: ContractError(9)');
    expect(err).toBeInstanceOf(ContractError);
    const contractErr = err as ContractError;
    expect(contractErr.code).toBe(9);
    expect(contractErr.message).toContain('ContractError(9)');
  });

  test('falls back to SimulationError without a recognized code', () => {
    const err = fromSimulationError('host invocation failed: Out of resources');
    expect(err).toBeInstanceOf(SimulationError);
  });
});
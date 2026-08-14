/**
 * Unit tests for the input validation helpers.
 */

import { ConfigError } from '../../src/errors';
import {
  assertValidAmount,
  assertValidId,
  assertValidYear,
} from '../../src/validation';

describe('validation helpers', () => {
  test('assertValidAmount accepts non-negative integer strings', () => {
    expect(() => assertValidAmount('amount', '0')).not.toThrow();
    expect(() => assertValidAmount('amount', '1')).not.toThrow();
    expect(() => assertValidAmount('amount', '123456789')).not.toThrow();
    expect(() => assertValidAmount('amount', '10'.repeat(30))).not.toThrow();
  });

  test('assertValidAmount rejects non-amount values with a typed error', () => {
    for (const bad of [
      '-5',
      '1.5',
      '1e3',
      ' 10',
      '10 ',
      'abc',
      '0x10',
      '',
      undefined,
      null,
      100,
      100n,
      NaN,
    ]) {
      expect(() => assertValidAmount('amount', bad)).toThrow(ConfigError);
    }
  });

  test('assertValidAmount names the offending parameter', () => {
    expect(() => assertValidAmount('minAmountOut', 'x')).toThrow(
      'minAmountOut must be a non-negative integer string',
    );
  });

  test('assertValidId accepts 64-char hex ids in either case', () => {
    expect(() => assertValidId('projectId', 'ab'.repeat(32))).not.toThrow();
    expect(() => assertValidId('projectId', 'AB'.repeat(32))).not.toThrow();
    expect(() => assertValidId('projectId', 'a'.repeat(64))).not.toThrow();
  });

  test('assertValidId rejects non-32-byte or non-hex ids', () => {
    for (const bad of [
      'abcd',
      'ab'.repeat(31),
      'ab'.repeat(33),
      'not-a-hex-id',
      'zz'.repeat(32),
      '',
      undefined,
      Buffer.alloc(32),
    ]) {
      expect(() => assertValidId('proposalId', bad)).toThrow(ConfigError);
    }
  });

  test('assertValidYear accepts positive integer years', () => {
    expect(() => assertValidYear('vintageYear', 2025)).not.toThrow();
    expect(() => assertValidYear('vintageYear', 1)).not.toThrow();
  });

  test('assertValidYear rejects non-positive or non-integer years', () => {
    for (const bad of [0, -2025, 2025.5, '2025', undefined, NaN]) {
      expect(() => assertValidYear('vintageYear', bad)).toThrow(ConfigError);
    }
  });
});

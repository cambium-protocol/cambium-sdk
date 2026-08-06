/**
 * Unit tests for the ScVal decoding utilities.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  asAmount,
  asBoolean,
  asBytes,
  asNumber,
  asRecord,
  asString,
  asVec,
  bytesToHex,
  hexToBytes,
  idFromScVal,
  idToScVal,
  toNative,
} from '../../src/scval';

function scvMap(entries: Record<string, unknown>): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(entries, { type: 'contract' });
}

function i128(n: bigint): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(n, { type: 'i128' });
}

describe('scval utilities', () => {
  test('toNative passes non-ScVal values through untouched', () => {
    expect(toNative({ id: 'x' })).toEqual({ id: 'x' });
    expect(toNative('100')).toBe('100');
    expect(toNative(100n)).toBe(100n);
    expect(toNative(undefined)).toBe(undefined);
  });

  test('asRecord decodes a real ScVal map with symbol keys', () => {
    const map = scvMap({
      id: 'abc',
      total_issued: 42n,
      year: 2025n,
    });
    const record = asRecord(map);
    expect(record.id).toBe('abc');
    expect(record.total_issued).toBe(42n);
    expect(record.year).toBe(2025n);
  });

  test('asRecord accepts plain objects', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord('nope')).toEqual({});
  });

  test('asAmount normalizes bigint and number to a decimal string', () => {
    expect(asAmount(i128(123456789n))).toBe('123456789');
    expect(asAmount('7')).toBe('7');
    expect(asAmount(undefined)).toBe('0');
    expect(asAmount(null)).toBe('0');
  });

  test('asNumber converts u32 and bigint', () => {
    expect(asNumber(StellarSdk.nativeToScVal(2025, { type: 'u32' }))).toBe(2025);
    expect(asNumber(99n)).toBe(99);
    expect(asNumber(undefined)).toBe(0);
  });

  test('asBoolean decodes bool ScVals', () => {
    expect(asBoolean(StellarSdk.nativeToScVal(true, { type: 'bool' }))).toBe(true);
    expect(asBoolean(StellarSdk.nativeToScVal(false, { type: 'bool' }))).toBe(false);
    expect(asBoolean(undefined)).toBe(false);
  });

  test('asBytes handles Uint8Array and base64 output from scValToNative', () => {
    const buf = Buffer.from([1, 2, 3]);
    expect(asBytes(StellarSdk.nativeToScVal(buf, { type: 'bytes' }))).toEqual(buf);
    expect(asBytes(new Uint8Array([1, 2, 3]))).toEqual(buf);
    expect(asBytes(undefined)).toEqual(Buffer.alloc(0));
  });

  test('asVec decodes vector ScVals', () => {
    const vec = StellarSdk.nativeToScVal([1, 2], { type: 'u32' });
    expect(asVec(vec)).toEqual([1, 2]);
    expect(asVec([1, 2])).toEqual([1, 2]);
    expect(asVec(undefined)).toEqual([]);
  });

  test('asString decodes symbols and strings', () => {
    expect(asString(StellarSdk.nativeToScVal('VM0007', { type: 'symbol' }))).toBe('VM0007');
    expect(asString(StellarSdk.nativeToScVal('hello', { type: 'string' }))).toBe('hello');
    expect(asString(undefined)).toBe('');
  });

  test('hexToBytes and bytesToHex round-trip', () => {
    const hex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    expect(bytesToHex(hexToBytes(hex))).toBe(hex);
  });

  test('idToScVal encodes 32-byte identifiers as bytes ScVal', () => {
    const hex = '01'.repeat(32);
    const scval = idToScVal(hex);
    expect(scval.switch().name).toBe('scvBytes');
    expect(asBytes(scval).toString('hex')).toBe(hex);
  });

  test('idToScVal rejects wrong-length identifiers', () => {
    expect(() => idToScVal('abcd')).toThrow(TypeError);
    expect(() => idToScVal(Buffer.alloc(2))).toThrow(TypeError);
  });

  test('idFromScVal decodes bytes back to hex', () => {
    const hex = 'ab'.repeat(32);
    const scval = StellarSdk.nativeToScVal(Buffer.from(hex, 'hex'), { type: 'bytes' });
    expect(idFromScVal(scval)).toBe(hex);
  });
});

/**
 * Unit tests for the CreditsModule.
 */

import { mockStellarSdk } from '../helpers/mockStellarSdk';
import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../../src/client';
import { ConfigError } from '../../src/errors';

// Mock the StellarSdk module
jest.mock('@stellar/stellar-sdk', () =>
  mockStellarSdk({
    retvalBuilder: (real) => real.nativeToScVal(1000n, { type: 'i128' }),
  }),
);

describe('CreditsModule', () => {
  const validConfig = {
    network: 'testnet' as const,
    rpcUrl: 'https://soroban-testnet.stellar.org',
    contracts: {
      registry: 'C...REGISTRY',
      creditToken: 'C...TOKEN',
      marketplace: 'C...MARKETPLACE',
      retirement: 'C...RETIREMENT',
    },
  };

  test('balanceOf returns balance as string', async () => {
    const client = new CambiumClient(validConfig);
    const balance = await client.credits.balanceOf('GABC...');
    expect(balance).toBe('1000');
  });

  test('allowance returns allowance as string', async () => {
    const client = new CambiumClient(validConfig);
    const allowance = await client.credits.allowance({
      owner: 'GABC...',
      spender: 'GDEF...',
    });
    expect(allowance).toBe('1000');
  });

  test('approve builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.credits.approve({
      from: 'GABC...',
      spender: 'GDEF...',
      amount: '500',
    });
    expect(tx).toBeDefined();
  });

  test('transferFrom builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.credits.transferFrom({
      spender: 'GABC...',
      from: 'GDEF...',
      to: 'GHIJ...',
      amount: '250',
    });
    expect(tx).toBeDefined();
  });

  test('transfer builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.credits.transfer({
      from: 'GABC...',
      to: 'GDEF...',
      amount: '500',
    });
    expect(tx).toBeDefined();
  });

  test('admin returns the admin address string', async () => {
    const RealAddress = jest.requireActual('@stellar/stellar-sdk').Address;
    const adminAddress = 'CBSLLVCIZBXKPHY73PN5DVHQKNGK4FAZBXMQLKZCJABABUX5OQGPHC43';

    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: RealAddress.fromString(adminAddress).toScVal() },
    });

    expect(await client.credits.admin()).toBe(adminAddress);
  });

  test('getBurner returns undefined when no burner is set', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: null },
    });

    expect(await client.credits.getBurner()).toBeUndefined();
  });

  test('isAllowlisted returns parsed boolean', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: StellarSdk.nativeToScVal(true) },
    });

    expect(await client.credits.isAllowlisted('GABC...')).toBe(true);
  });

  test('transferAndSubmit throws ConfigError when no signer', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.credits.transferAndSubmit({
        from: 'GABC...',
        to: 'GDEF...',
        amount: '500',
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('transferAndSubmit succeeds with signer configured', async () => {
    const mockSigner = {
      getPublicKey: jest.fn().mockResolvedValue('GABC...'),
      signTransaction: jest.fn().mockResolvedValue('signed-xdr'),
    };

    const client = new CambiumClient({
      ...validConfig,
      signer: mockSigner,
    });

    const result = await client.credits.transferAndSubmit({
      from: 'GABC...',
      to: 'GDEF...',
      amount: '500',
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.hash).toBe('abc123');
    expect(mockSigner.signTransaction).toHaveBeenCalledWith(
      'mock-xdr',
      'Test SDF Network ; September 2015',
    );
  });

  test('name returns the token name string', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: StellarSdk.nativeToScVal('Cambium', { type: 'symbol' }) },
    });

    expect(await client.credits.name()).toBe('Cambium');
  });

  test('symbol returns the token symbol string', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: StellarSdk.nativeToScVal('CAMB', { type: 'symbol' }) },
    });

    expect(await client.credits.symbol()).toBe('CAMB');
  });

  test('decimals returns the token decimals as a number', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: StellarSdk.nativeToScVal(7, { type: 'u32' }) },
    });

    expect(await client.credits.decimals()).toBe(7);
  });

  test('transfer rejects a negative amount before simulation', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.credits.transfer({
        from: 'GABC...',
        to: 'GDEF...',
        amount: '-5',
      }),
    ).rejects.toThrow(ConfigError);
  });
});

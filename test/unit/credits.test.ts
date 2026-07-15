/**
 * Unit tests for the CreditsModule.
 */

import { CambiumClient } from '../../src/client';
import { ConfigError } from '../../src/errors';

// Mock the StellarSdk module
jest.mock('@stellar/stellar-sdk', () => {
  const mockServer = {
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 12345 }),
    getAccount: jest.fn().mockResolvedValue({
      accountId: 'GABC',
      sequence: '0',
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      result: { retval: '1000' },
    }),
    sendTransaction: jest.fn().mockResolvedValue({
      status: 'SUCCESS',
      hash: 'abc123',
    }),
  };

  return {
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => mockServer),
      Api: {
        isSimulationError: jest.fn().mockReturnValue(false),
      },
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue({}),
    })),
    Address: jest.fn().mockImplementation((addr: string) => ({
      toScVal: jest.fn().mockReturnValue({ address: addr }),
    })),
    TransactionBuilder: Object.assign(
      jest.fn().mockImplementation(() => ({
        addOperation: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue({
          toXDR: jest.fn().mockReturnValue('mock-xdr'),
        }),
      })),
      {
        cloneFrom: jest.fn().mockImplementation(() => ({
          build: jest.fn().mockReturnValue({
            toXDR: jest.fn().mockReturnValue('mock-xdr'),
          }),
        })),
        fromXDR: jest.fn().mockReturnValue({}),
      },
    ),
    nativeToScVal: jest.fn().mockReturnValue({}),
    TimeoutInfinite: 0,
    BASE_FEE: '100',
    Keypair: {
      random: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('GDEF...'),
      }),
    },
    Account: jest.fn(),
  };
});

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

  test('transfer builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.credits.transfer({
      from: 'GABC...',
      to: 'GDEF...',
      amount: '500',
    });
    expect(tx).toBeDefined();
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
    expect(mockSigner.signTransaction).toHaveBeenCalledWith('mock-xdr');
  });
});

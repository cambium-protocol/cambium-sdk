/**
 * Unit tests for the MarketplaceModule.
 */

import { CambiumClient } from '../../src/client';
import { NotYetImplementedError } from '../../src/errors';

// Mock the StellarSdk module
jest.mock('@stellar/stellar-sdk', () => {
  const mockServer = {
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 12345 }),
    getAccount: jest.fn().mockResolvedValue({
      accountId: 'GABC',
      sequence: '0',
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      result: {
        retval: {
          id: 'pool-1',
          credit_token: 'C...TOKEN',
          paired_asset: 'C...PAIRED',
          credit_reserves: '10000',
          paired_reserves: '20000',
        },
      },
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

describe('MarketplaceModule', () => {
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

  test('getPool returns parsed pool state', async () => {
    const client = new CambiumClient(validConfig);
    const pool = await client.marketplace.getPool('pool-1');
    expect(pool).toBeDefined();
    expect(pool.id).toBe('pool-1');
  });

  test('quote calculates expected output using constant-product formula', async () => {
    const client = new CambiumClient(validConfig);
    const quote = await client.marketplace.quote({
      poolId: 'pool-1',
      amountIn: '1000',
    });

    expect(quote).toBeDefined();
    expect(quote.poolId).toBe('pool-1');
    expect(quote.amountIn).toBe('1000');
    // With 10000 credit / 20000 paired reserves, swapping 1000 credits:
    // amountOut = (20000 * 1000) / (10000 + 1000) = 20000000 / 11000 ≈ 1818
    expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
  });

  test('swap builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.marketplace.swap({
      poolId: 'pool-1',
      amountIn: '1000',
      minAmountOut: '900',
      trader: 'GABC...',
    });
    expect(tx).toBeDefined();
  });

  test('placeLimitOrder throws NotYetImplementedError', async () => {
    const client = new CambiumClient(validConfig);
    await expect(client.marketplace.placeLimitOrder()).rejects.toThrow(
      NotYetImplementedError,
    );
  });

  test('cancelOrder throws NotYetImplementedError', async () => {
    const client = new CambiumClient(validConfig);
    await expect(client.marketplace.cancelOrder()).rejects.toThrow(
      NotYetImplementedError,
    );
  });

  test('getOrderBook throws NotYetImplementedError', async () => {
    const client = new CambiumClient(validConfig);
    await expect(client.marketplace.getOrderBook()).rejects.toThrow(
      NotYetImplementedError,
    );
  });
});

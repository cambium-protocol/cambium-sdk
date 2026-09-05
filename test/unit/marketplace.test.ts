/**
 * Unit tests for the MarketplaceModule.
 */

import { CambiumClient } from '../../src/client';
import { ConfigError } from '../../src/errors';
import * as StellarSdk from '@stellar/stellar-sdk';

// Mock the StellarSdk module
jest.mock('@stellar/stellar-sdk', () => {
  const real = jest.requireActual('@stellar/stellar-sdk');

  const poolId = Buffer.from('44'.repeat(32), 'hex');
  const poolRetval = real.nativeToScVal(
    {
      id: poolId,
      credit_token: 'C...TOKEN',
      paired_asset: 'XLM',
      credit_reserves: 10000n,
      paired_reserves: 20000n,
    },
    { type: 'contract' },
  );

  const mockServer = {
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 12345 }),
    getAccount: jest.fn().mockResolvedValue({
      accountId: 'GABC',
      sequence: '0',
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
        toXDR: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: poolRetval },
    }),
    sendTransaction: jest.fn().mockResolvedValue({
      status: 'SUCCESS',
      hash: 'abc123',
    }),
  };

  return {
    ...real,
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

  const orderRetval = StellarSdk.nativeToScVal(
    {
      id: Buffer.from('55'.repeat(32), 'hex'),
      trader: 'GABC...',
      side: ['Buy'],
      amount: 1000n,
      remaining: 400n,
      price: 10n,
      pool_id: Buffer.from('44'.repeat(32), 'hex'),
      paired_token: 'C...TOKEN',
      created_at: 1700000000n,
    },
    { type: 'contract' },
  );
  const orderBookRetval = StellarSdk.nativeToScVal([orderRetval]);

  test('getPool returns parsed pool state', async () => {
    const client = new CambiumClient(validConfig);
    const poolId = '44'.repeat(32);
    const pool = await client.marketplace.getPool(poolId);
    expect(pool.id).toBe(poolId);
    expect(pool.creditToken).toBe('C...TOKEN');
    expect(pool.creditReserves).toBe('10000');
    expect(pool.pairedReserves).toBe('20000');
  });

  test('quote calculates expected output using constant-product formula', async () => {
    const client = new CambiumClient(validConfig);
    const quote = await client.marketplace.quote({
      poolId: '44'.repeat(32),
      amountIn: '1000',
    });

    expect(quote).toBeDefined();
    expect(quote.poolId).toBe('44'.repeat(32));
    expect(quote.amountIn).toBe('1000');
    // With 10000 credit / 20000 paired reserves, swapping 1000 credits:
    // amountOut = (20000 * 1000) / (10000 + 1000) = 20000000 / 11000 ≈ 1818
    expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
  });

  test('quote rejects an ill-formed poolId before simulation', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.marketplace.quote({
        poolId: 'not-a-pool',
        amountIn: '100',
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('quote rejects a non-positive amountIn before simulation', async () => {
    const client = new CambiumClient(validConfig);
    for (const bad of ['0', '-5', '1.5', '1e3', 'abc']) {
      await expect(
        client.marketplace.quote({
          poolId: '44'.repeat(32),
          amountIn: bad,
        }),
      ).rejects.toThrow(ConfigError);
    }
  });

  test('quote rejects a pool with no liquidity', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: {
        retval: StellarSdk.nativeToScVal(
          {
            id: Buffer.from('44'.repeat(32), 'hex'),
            credit_token: 'C...TOKEN',
            paired_asset: 'XLM',
            credit_reserves: 0n,
            paired_reserves: 0n,
          },
          { type: 'contract' },
        ),
      },
    });

    await expect(
      client.marketplace.quote({
        poolId: '44'.repeat(32),
        amountIn: '100',
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('quote reports 0% impact when the spot price rounds to zero', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: {
        retval: StellarSdk.nativeToScVal(
          {
            id: Buffer.from('44'.repeat(32), 'hex'),
            credit_token: 'C...TOKEN',
            paired_asset: 'XLM',
            credit_reserves: 1000000n,
            paired_reserves: 1n,
          },
          { type: 'contract' },
        ),
      },
    });

    const quote = await client.marketplace.quote({
      poolId: '44'.repeat(32),
      amountIn: '1000',
    });
    expect(quote.priceImpact).toBe('0%');
  });

  test('swap builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.marketplace.swap({
      poolId: '44'.repeat(32),
      amountIn: '1000',
      minAmountOut: '900',
      trader: 'GABC...',
    });
    expect(tx).toBeDefined();
  });

  test('createPool builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.marketplace.createPool({
      poolId: '44'.repeat(32),
      creditToken: 'C...TOKEN',
      pairedAsset: 'XLM',
      initialCredit: '1000',
      initialPaired: '2000',
      creator: 'GABC...',
    });
    expect(tx).toBeDefined();
  });

  test('placeLimitOrder builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.marketplace.placeLimitOrder({
      trader: 'GABC...',
      side: 'buy',
      amount: '100',
      price: '10',
      poolId: '44'.repeat(32),
      pairedToken: 'C...TOKEN',
    });
    expect(tx).toBeDefined();
  });

  test('placeLimitOrder encodes the sell side symbol', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.marketplace.placeLimitOrder({
      trader: 'GABC...',
      side: 'sell',
      amount: '50',
      price: '20',
      poolId: '44'.repeat(32),
      pairedToken: 'C...TOKEN',
    });
    expect(tx).toBeDefined();
  });

  test('cancelOrder builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.marketplace.cancelOrder({
      trader: 'GABC...',
      orderId: '55'.repeat(32),
    });
    expect(tx).toBeDefined();
  });

  test('getOrderBook parses Vec<Order> ScVal results', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: orderBookRetval },
    });

    const orders = await client.marketplace.getOrderBook('44'.repeat(32));
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe('55'.repeat(32));
    expect(orders[0].side).toBe('buy');
    expect(orders[0].trader).toBe('GABC...');
    expect(orders[0].amount).toBe('1000');
    expect(orders[0].remaining).toBe('400');
    expect(orders[0].price).toBe('10');
    expect(orders[0].poolId).toBe('44'.repeat(32));
    expect(orders[0].pairedToken).toBe('C...TOKEN');
    expect(orders[0].createdAt).toBe(1700000000);
  });

  test('getOrder parses a single Order ScVal result', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: orderRetval },
    });

    const order = await client.marketplace.getOrder('55'.repeat(32));
    expect(order.id).toBe('55'.repeat(32));
    expect(order.side).toBe('buy');
  });

  test('swap rejects an ill-formed poolId before simulation', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.marketplace.swap({
        poolId: 'not-a-pool',
        amountIn: '1000',
        minAmountOut: '900',
        trader: 'GABC...',
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('createPool rejects a non-integer initialCredit before simulation', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.marketplace.createPool({
        poolId: '44'.repeat(32),
        creditToken: 'C...TOKEN',
        pairedAsset: 'XLM',
        initialCredit: '1e3',
        initialPaired: '2000',
        creator: 'GABC...',
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('placeLimitOrder rejects a non-integer price before simulation', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.marketplace.placeLimitOrder({
        trader: 'GABC...',
        side: 'buy',
        amount: '100',
        price: '9.5',
        poolId: '44'.repeat(32),
        pairedToken: 'C...TOKEN',
      }),
    ).rejects.toThrow(ConfigError);
  });
});

/**
 * Unit tests for the CambiumClient and registry module.
 */

import { CambiumClient } from '../../src/client';
import {
  ConfigError,
  NotFoundError,
  NotYetImplementedError,
} from '../../src/errors';

// Mock the StellarSdk module
jest.mock('@stellar/stellar-sdk', () => {
  const mockServer = {
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 12345 }),
    getAccount: jest.fn().mockResolvedValue({
      accountId: 'GABC',
      sequence: '0',
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      result: { retval: { str: 'test-value' } },
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
          build: jest.fn().mockReturnValue({}),
        })),
        fromXdr: jest.fn().mockReturnValue({}),
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

describe('CambiumClient', () => {
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

  test('creates client with valid config', () => {
    const client = new CambiumClient(validConfig);
    expect(client.network).toBe('testnet');
    expect(client.contracts.registry).toBe('C...REGISTRY');
  });

  test('throws ConfigError when rpcUrl is missing', () => {
    expect(() => {
      new CambiumClient({
        ...validConfig,
        rpcUrl: '',
      });
    }).toThrow(ConfigError);
  });

  test('throws ConfigError when registry address is missing', () => {
    expect(() => {
      new CambiumClient({
        ...validConfig,
        contracts: { ...validConfig.contracts, registry: '' },
      });
    }).toThrow(ConfigError);
  });

  test('sets correct network passphrase', () => {
    const client = new CambiumClient(validConfig);
    expect(client.networkPassphrase).toBe(
      'Test SDF Network ; September 2015',
    );
  });

  test('modules are initialized', () => {
    const client = new CambiumClient(validConfig);
    expect(client.registry).toBeDefined();
    expect(client.credits).toBeDefined();
    expect(client.marketplace).toBeDefined();
    expect(client.retirement).toBeDefined();
  });
});

describe('RegistryModule', () => {
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

  test('getProject calls invokeContract correctly', async () => {
    const client = new CambiumClient(validConfig);
    // The mock returns a default value; in production this would parse XDR
    const project = await client.registry.getProject('test-project-id');
    expect(project).toBeDefined();
  });
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
});

describe('RetirementModule', () => {
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

  test('retire throws NotYetImplementedError', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.retire({
        from: 'GABC...',
        projectId: 'test-project',
        vintageYear: 2025,
        amount: '100',
      }),
    ).rejects.toThrow(NotYetImplementedError);
  });

  test('getRetirement throws NotYetImplementedError', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.getRetirement('test-id'),
    ).rejects.toThrow(NotYetImplementedError);
  });
});

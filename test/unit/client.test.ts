/**
 * Unit tests for the CambiumClient and registry module.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../../src/client';
import {
  ConfigError,
  ContractError,
  NotYetImplementedError,
  SimulationError,
} from '../../src/errors';

// Mock the StellarSdk module
jest.mock('@stellar/stellar-sdk', () => {
  const real = jest.requireActual('@stellar/stellar-sdk');

  const projectId = Buffer.from('11'.repeat(32), 'hex');
  const defaultRetval = real.nativeToScVal(
    {
      id: projectId,
      methodology: 'VM0007',
      geography: 'BRA',
      external_registry_ref: real.nativeToScVal(Buffer.from('VERRA:123'), {
        type: 'bytes',
      }),
      verifying_key_version: 3,
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
      result: { retval: defaultRetval },
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
        cloneFrom: jest.fn().mockImplementation((_tx: unknown, opts: unknown) => ({
          build: jest.fn().mockReturnValue({
            toXDR: jest.fn().mockReturnValue('mock-xdr'),
            sorobanData: (opts as { sorobanData?: string }).sorobanData,
          }),
        })),
        fromXdr: jest.fn().mockReturnValue({}),
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

  const mockServer = () => {
    const client = new CambiumClient(validConfig);
    return (client as unknown as { server: { simulateTransaction: jest.Mock } })
      .server;
  };

  const projectRetval = () =>
    StellarSdk.nativeToScVal(
      {
        id: Buffer.from('11'.repeat(32), 'hex'),
        methodology: 'VM0007',
        geography: 'BRA',
        external_registry_ref: StellarSdk.nativeToScVal(
          Buffer.from('VERRA:123'),
          { type: 'bytes' },
        ),
        verifying_key_version: 3,
      },
      { type: 'contract' },
    );

  afterEach(() => {
    (StellarSdk.SorobanRpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(
      false,
    );
    mockServer().simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
        toXDR: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: projectRetval() },
    });
  });

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

  test('invokeContract throws ContractError on recognized contract error', async () => {
    mockServer().simulateTransaction.mockResolvedValue({
      error: 'host invocation failed: ContractError(4)',
    });
    (StellarSdk.SorobanRpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(
      true,
    );

    const client = new CambiumClient(validConfig);
    const err = await client.registry.getProject('11'.repeat(32)).catch((e) => e);
    expect(err).toBeInstanceOf(ContractError);
    expect((err as ContractError).code).toBe(4);
  });

  test('invokeContract throws SimulationError when no code is present', async () => {
    mockServer().simulateTransaction.mockResolvedValue({
      error: 'host invocation failed: Out of resources',
    });
    (StellarSdk.SorobanRpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(
      true,
    );

    const client = new CambiumClient(validConfig);
    await expect(client.registry.getProject('11'.repeat(32))).rejects.toThrow(
      SimulationError,
    );
  });

  test('buildTransaction attaches simulated sorobanData and fee', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.buildTransaction(
      'C...MARKETPLACE',
      'swap',
      [],
      'GABC...',
    );
    const built = tx as unknown as { sorobanData?: string };
    expect(built.sorobanData).toBe('mock-soroban-data');
    expect(StellarSdk.TransactionBuilder.cloneFrom).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fee: '100' }),
    );
  });

  test('buildTransaction throws ContractError on contract simulation failure', async () => {
    mockServer().simulateTransaction.mockResolvedValue({
      error: 'contract call failed: ContractError(9)',
    });
    (StellarSdk.SorobanRpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(
      true,
    );

    const client = new CambiumClient(validConfig);
    const err = await client
      .buildTransaction('C...MARKETPLACE', 'get_pool', [], 'GABC...')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ContractError);
    expect((err as ContractError).code).toBe(9);
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

  test('getProject parses ScVal project result', async () => {
    const client = new CambiumClient(validConfig);
    const project = await client.registry.getProject('11'.repeat(32));
    expect(project.id).toBe('11'.repeat(32));
    expect(project.methodology).toBe('VM0007');
    expect(project.geography).toBe('BRA');
    expect(project.externalRegistryRef).toBe('VERRA:123');
    expect(project.verifyingKeyVersion).toBe(3);
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

  test('retire (public) builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.retirement.retire({
      from: 'GABC...',
      projectId: '33'.repeat(32),
      vintageYear: 2025,
      amount: '100',
    });
    expect(tx).toBeDefined();
  });

  test('retire with shield: true throws NotYetImplementedError', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.retire({
        from: 'GABC...',
        projectId: '33'.repeat(32),
        vintageYear: 2025,
        amount: '100',
        shield: true,
      }),
    ).rejects.toThrow(NotYetImplementedError);
  });

  test('getRetirement calls invokeContract correctly', async () => {
    const recordId = Buffer.from('22'.repeat(32), 'hex');
    const recordRetval = StellarSdk.nativeToScVal(
      {
        id: recordId,
        project_id: Buffer.from('33'.repeat(32), 'hex'),
        vintage_year: 2025,
        amount: 100n,
        retired_at: 12345n,
        retiree: {
          Public: 'GABC...',
        },
      },
      { type: 'contract' },
    );
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock } }
    ).server;
    server.simulateTransaction.mockResolvedValue({
      transactionData: {
        build: jest.fn().mockReturnValue('mock-soroban-data'),
      },
      minResourceFee: '100',
      result: { retval: recordRetval },
    });

    const record = await client.retirement.getRetirement('22'.repeat(32));
    expect(record.id).toBe('22'.repeat(32));
    expect(record.projectId).toBe('33'.repeat(32));
    expect(record.vintageYear).toBe(2025);
    expect(record.amount).toBe('100');
    expect(record.retiree).toEqual({
      type: 'public',
      address: 'GABC...',
    });
  });

  test('listRetirements returns array', async () => {
    const client = new CambiumClient(validConfig);
    const records = await client.retirement.listRetirements();
    expect(Array.isArray(records)).toBe(true);
  });
});

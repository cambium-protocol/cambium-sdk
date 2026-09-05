/**
 * Unit tests for the CambiumClient and registry module.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../../src/client';
import { retirementRecordId } from '../../src/events';
import {
  ConfigError,
  ContractError,
  SimulationError,
  TxFailureError,
  TxTimeoutError,
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
    getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    getEvents: jest.fn().mockResolvedValue({ events: [] }),
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
    return client.server as unknown as {
      simulateTransaction: jest.Mock;
      getTransaction: jest.Mock;
      sendTransaction: jest.Mock;
      getEvents: jest.Mock;
    };
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
    const getEvents = mockServer().getEvents as unknown as jest.Mock;
    getEvents.mockReset();
    getEvents.mockResolvedValue({ events: [] });
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

  test('waitForTransaction returns SUCCESS once the tx settles', async () => {
    const getTransaction = mockServer().getTransaction as unknown as jest.Mock;
    getTransaction
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'SUCCESS' });

    const client = new CambiumClient(validConfig);
    const status = await client.waitForTransaction('abc123', {
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(status).toBe('SUCCESS');
    expect(getTransaction).toHaveBeenCalledWith('abc123');
  });

  test('waitForTransaction throws TxTimeoutError when tx never settles', async () => {
    mockServer().getTransaction.mockResolvedValue({ status: 'PENDING' });

    const client = new CambiumClient(validConfig);
    await expect(
      client.waitForTransaction('abc123', {
        intervalMs: 5,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(TxTimeoutError);
  });

  test('signAndSend throws ConfigError when no signer is configured', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.signAndSend({} as never),
    ).rejects.toThrow(ConfigError);
  });

  test('signAndSend signs with the configured signer and submits', async () => {
    const mockSigner = {
      getPublicKey: jest.fn().mockResolvedValue('GABC...'),
      signTransaction: jest.fn().mockResolvedValue('signed-xdr'),
    };

    const client = new CambiumClient({ ...validConfig, signer: mockSigner });
    const result = await client.signAndSend({
      toXDR: jest.fn().mockReturnValue('mock-xdr'),
    } as never);

    expect(mockSigner.signTransaction).toHaveBeenCalledWith(
      'mock-xdr',
      'Test SDF Network ; September 2015',
    );
    expect(result.status).toBe('SUCCESS');
    expect(result.hash).toBe('abc123');
  });

  test('submitAndWait returns settlement details once the tx settles', async () => {
    const server = mockServer();
    server.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 20000,
      createdAt: 1700000000,
      envelopeXdr: { toXDR: jest.fn().mockReturnValue('env-base64') },
      resultXdr: { toXDR: jest.fn().mockReturnValue('result-base64') },
    });

    const client = new CambiumClient(validConfig);
    const result = await client.submitAndWait('signed-xdr');

    expect(result.hash).toBe('abc123');
    expect(result.status).toBe('SUCCESS');
    expect(result.ledger).toBe(20000);
    expect(result.createdAt).toBe(1700000000);
    expect(result.envelopeXdr).toBe('env-base64');
    expect(result.resultXdr).toBe('result-base64');
  });

  test('getContractEvents paginates through a full ledger window', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { getEvents: jest.Mock } }
    ).server;

    const makeEvent = (n: number) => ({
      type: 'contract',
      ledger: n,
      ledgerClosedAt: '2026-08-06T00:00:00Z',
      contractId: 'C...RETIREMENT',
      id: `event-${n}`,
      pagingToken: `pt-${n}`,
      topic: [],
      value: undefined,
    });

    // Two full pages of 200 plus a final short page = 450 events total.
    const fullPage = Array.from({ length: 200 }, (_, i) => makeEvent(i));
    const fullPage2 = Array.from({ length: 200 }, (_, i) => makeEvent(200 + i));
    const partialPage = Array.from({ length: 50 }, (_, i) =>
      makeEvent(400 + i),
    );

    server.getEvents
      .mockResolvedValueOnce({ events: fullPage })
      .mockResolvedValueOnce({ events: fullPage2 })
      .mockResolvedValueOnce({ events: partialPage });

    const events = await client.getContractEvents(
      'C...RETIREMENT',
      'retire',
    );

    expect(events).toHaveLength(450);
    expect(server.getEvents).toHaveBeenCalledTimes(3);
    expect(server.getEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'pt-399' }),
    );
  });

  test('getContractEvents stops at an explicit limit', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { getEvents: jest.Mock } }
    ).server;

    const makeEvent = (n: number) => ({
      type: 'contract',
      ledger: n,
      ledgerClosedAt: '2026-08-06T00:00:00Z',
      contractId: 'C...RETIREMENT',
      id: `event-${n}`,
      pagingToken: `pt-${n}`,
      topic: [],
      value: undefined,
    });
    const firstPage = Array.from({ length: 200 }, (_, i) => makeEvent(i));
    const secondPage = Array.from({ length: 50 }, (_, i) => makeEvent(200 + i));
    server.getEvents
      .mockResolvedValueOnce({ events: firstPage })
      .mockResolvedValueOnce({ events: secondPage });

    const events = await client.getContractEvents('C...RETIREMENT', 'retire', {
      limit: 250,
    });

    expect(events).toHaveLength(250);
    expect(server.getEvents).toHaveBeenCalledTimes(2);
  });

  test('getContractEvents avoids an infinite loop on a non-advancing cursor', async () => {
    const client = new CambiumClient(validConfig);
    const server = (
      client as unknown as { server: { getEvents: jest.Mock } }
    ).server;

    const stale = Array.from({ length: 200 }, (_, i) => ({
      type: 'contract',
      ledger: i,
      ledgerClosedAt: '2026-08-06T00:00:00Z',
      contractId: 'C...RETIREMENT',
      id: `event-${i}`,
      pagingToken: 'same-token',
      topic: [],
      value: undefined,
    }));
    server.getEvents.mockResolvedValue({ events: stale });

    const events = await client.getContractEvents(
      'C...RETIREMENT',
      'retire',
    );

    expect(events).toHaveLength(200);
    expect(server.getEvents).toHaveBeenCalledTimes(2);
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

  test('getGovernance parses multi-sig config', async () => {
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
            threshold: 2,
            signers: ['GABC...', 'GDEF...', 'GHIJ...'],
            timelock_secs: 86400n,
          },
          { type: 'contract' },
        ),
      },
    });

    const config = await client.registry.getGovernance();
    expect(config.threshold).toBe(2);
    expect(config.signers).toHaveLength(3);
    expect(config.signers[0]).toBe('GABC...');
    expect(config.timelockSecs).toBe(86400);
  });

  test('getVkey parses verifying key state', async () => {
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
            version: 3,
            key: Buffer.from('66'.repeat(32), 'hex'),
          },
          { type: 'contract' },
        ),
      },
    });

    const vkey = await client.registry.getVkey('VM0007');
    expect(vkey.version).toBe(3);
    expect(vkey.key).toBe('66'.repeat(32));
  });

  test('proposeVkeyUpdate builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.registry.proposeVkeyUpdate({
      signer: 'GABC...',
      methodology: 'VM0007',
      newKey: '77'.repeat(32),
    });
    expect(tx).toBeDefined();
  });

  test('approveVkeyUpdate builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.registry.approveVkeyUpdate({
      signer: 'GDEF...',
      proposalId: '88'.repeat(32),
    });
    expect(tx).toBeDefined();
  });

  test('executeVkeyUpdate builds transaction successfully', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.registry.executeVkeyUpdate(
      '88'.repeat(32),
      'GABC...',
    );
    expect(tx).toBeDefined();
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

  const retirementServer = () => {
    const client = new CambiumClient(validConfig);
    return client.server as unknown as {
      simulateTransaction: jest.Mock;
      getEvents: jest.Mock;
    };
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

  test('retire with shield: true builds transaction with nullifier', async () => {
    const client = new CambiumClient(validConfig);
    const tx = await client.retirement.retire({
      from: 'GABC...',
      projectId: '33'.repeat(32),
      vintageYear: 2025,
      amount: '100',
      shield: true,
      nullifier: 'aa'.repeat(32),
    });
    expect(tx).toBeDefined();
  });

  test('retire with shield: true requires a nullifier', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.retire({
        from: 'GABC...',
        projectId: '33'.repeat(32),
        vintageYear: 2025,
        amount: '100',
        shield: true,
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('retire rejects a zero nullifier for shielded retirement', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.retire({
        from: 'GABC...',
        projectId: '33'.repeat(32),
        vintageYear: 2025,
        amount: '100',
        shield: true,
        nullifier: '00'.repeat(32),
      }),
    ).rejects.toThrow(ConfigError);
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

  test('listRetirements reconstructs records from retire events', async () => {
    const event = {
      type: 'contract',
      ledger: 12345,
      ledgerClosedAt: '2026-08-06T00:00:00Z',
      contractId: 'C...RETIREMENT',
      id: 'event-1',
      pagingToken: 'pt-1',
      topic: [
        StellarSdk.nativeToScVal('retire', { type: 'symbol' }),
        StellarSdk.nativeToScVal(Buffer.from('33'.repeat(32), 'hex'), {
          type: 'bytes',
        }),
        StellarSdk.nativeToScVal(['Public', 'GABC...']),
      ],
      value: StellarSdk.nativeToScVal([
          StellarSdk.nativeToScVal(2025, { type: 'u32' }),
          StellarSdk.nativeToScVal(100n, { type: 'i128' }),
        ]),
    };
    retirementServer().getEvents.mockResolvedValue({ events: [event] });

    const client = new CambiumClient(validConfig);
    const records = await client.retirement.listRetirements();
    expect(records).toHaveLength(1);
    expect(records[0].projectId).toBe('33'.repeat(32));
    expect(records[0].vintageYear).toBe(2025);
    expect(records[0].amount).toBe('100');
    expect(records[0].retiredAt).toBe(12345);
    expect(records[0].retiree).toEqual({ type: 'public', address: 'GABC...' });
  });

  test('listRetirements filters records by projectId', async () => {
    const event = {
      type: 'contract',
      ledger: 12345,
      ledgerClosedAt: '2026-08-06T00:00:00Z',
      contractId: 'C...RETIREMENT',
      id: 'event-1',
      pagingToken: 'pt-1',
      topic: [
        StellarSdk.nativeToScVal('retire', { type: 'symbol' }),
        StellarSdk.nativeToScVal(Buffer.from('33'.repeat(32), 'hex'), {
          type: 'bytes',
        }),
        StellarSdk.nativeToScVal(['Public', 'GABC...']),
      ],
      value: StellarSdk.nativeToScVal([
          StellarSdk.nativeToScVal(2025, { type: 'u32' }),
          StellarSdk.nativeToScVal(100n, { type: 'i128' }),
        ]),
    };
    retirementServer().getEvents.mockResolvedValue({ events: [event] });

    const client = new CambiumClient(validConfig);
    const matched = await client.retirement.listRetirements({
      projectId: '33'.repeat(32),
    });
    expect(matched).toHaveLength(1);

    const missed = await client.retirement.listRetirements({
      projectId: '44'.repeat(32),
    });
    expect(missed).toHaveLength(0);
  });

  test('getRetirementEvents parses a shielded retiree', async () => {
    const event = {
      type: 'contract',
      ledger: 12345,
      ledgerClosedAt: '2026-08-06T00:00:00Z',
      contractId: 'C...RETIREMENT',
      id: 'event-2',
      pagingToken: 'pt-2',
      topic: [
        StellarSdk.nativeToScVal('retire', { type: 'symbol' }),
        StellarSdk.nativeToScVal(Buffer.from('33'.repeat(32), 'hex'), {
          type: 'bytes',
        }),
        StellarSdk.nativeToScVal([
          StellarSdk.nativeToScVal('Shielded', { type: 'symbol' }),
          StellarSdk.nativeToScVal(Buffer.from('99'.repeat(32), 'hex'), {
            type: 'bytes',
          }),
        ]),
      ],
      value: StellarSdk.nativeToScVal([
          StellarSdk.nativeToScVal(2024, { type: 'u32' }),
          StellarSdk.nativeToScVal(50n, { type: 'i128' }),
        ]),
    };
    retirementServer().getEvents.mockResolvedValue({ events: [event] });

    const client = new CambiumClient(validConfig);
    const [parsed] = await client.retirement.getRetirementEvents();
    expect(parsed.projectId).toBe('33'.repeat(32));
    expect(parsed.retiree).toEqual({
      type: 'shielded',
      nullifierHash: '99'.repeat(32),
    });
    expect(parsed.amount).toBe('50');
  });

  test('retirementRecordId matches the on-chain derivation', () => {
    const id = retirementRecordId('33'.repeat(32), 2025, '100', 12345);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(retirementRecordId('33'.repeat(32), 2025, '100', 12345)).toBe(id);
  });

  test('retireAndSubmit requires a signer', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.retireAndSubmit({
        from: 'GABC...',
        projectId: '33'.repeat(32),
        vintageYear: 2025,
        amount: '100',
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('retireAndSubmit signs, settles, and returns the reconstructed record', async () => {
    const mockSigner = {
      getPublicKey: jest.fn().mockResolvedValue('GABC...'),
      signTransaction: jest.fn().mockResolvedValue('signed-xdr'),
    };

    const client = new CambiumClient({ ...validConfig, signer: mockSigner });
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock; getTransaction: jest.Mock } }
    ).server;

    const ledger = 12345;
    const projectId = '33'.repeat(32);

    const buildSim = {
      transactionData: { build: jest.fn().mockReturnValue('mock-soroban-data') },
      minResourceFee: '100',
      result: { retval: null },
    };
    const recordId = retirementRecordId(projectId, 2025, '100', ledger);
    const recordSim = {
      transactionData: { build: jest.fn().mockReturnValue('mock-soroban-data') },
      minResourceFee: '100',
      result: {
        retval: StellarSdk.nativeToScVal(
          {
            id: Buffer.from(recordId, 'hex'),
            project_id: Buffer.from(projectId, 'hex'),
            vintage_year: 2025,
            amount: 100n,
            retired_at: 12345n,
            retiree: { Public: 'GABC...' },
          },
          { type: 'contract' },
        ),
      },
    };
    server.simulateTransaction
      .mockResolvedValueOnce(buildSim)
      .mockResolvedValueOnce(recordSim);
    server.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger,
      createdAt: 1700000000,
      envelopeXdr: { toXDR: jest.fn().mockReturnValue('env-base64') },
      resultXdr: { toXDR: jest.fn().mockReturnValue('result-base64') },
    });

    const result = await client.retirement.retireAndSubmit({
      from: 'GABC...',
      projectId,
      vintageYear: 2025,
      amount: '100',
    });

    expect(result.signedXdr).toBe('signed-xdr');
    expect(result.record.id).toBe(recordId);
    expect(result.record.projectId).toBe(projectId);
    expect(result.record.amount).toBe('100');
    expect(result.record.retiredAt).toBe(12345);
  });

  test('retireAndSubmit throws TxFailureError when the tx fails on-chain', async () => {
    const mockSigner = {
      getPublicKey: jest.fn().mockResolvedValue('GABC...'),
      signTransaction: jest.fn().mockResolvedValue('signed-xdr'),
    };

    const client = new CambiumClient({ ...validConfig, signer: mockSigner });
    const server = (
      client as unknown as { server: { simulateTransaction: jest.Mock; getTransaction: jest.Mock } }
    ).server;

    server.simulateTransaction.mockResolvedValueOnce({
      transactionData: { build: jest.fn().mockReturnValue('mock-soroban-data') },
      minResourceFee: '100',
      result: { retval: null },
    });
    server.getTransaction.mockResolvedValue({
      status: 'FAILED',
      ledger: 12345,
      createdAt: 1700000000,
      envelopeXdr: { toXDR: jest.fn().mockReturnValue('env-base64') },
      resultXdr: { toXDR: jest.fn().mockReturnValue('result-base64') },
    });

    await expect(
      client.retirement.retireAndSubmit({
        from: 'GABC...',
        projectId: '33'.repeat(32),
        vintageYear: 2025,
        amount: '100',
      }),
    ).rejects.toThrow(TxFailureError);
  });

  test('retire rejects a non-integer amount before simulation', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.retire({
        from: 'GABC...',
        projectId: '33'.repeat(32),
        vintageYear: 2025,
        amount: '100.5',
      }),
    ).rejects.toThrow(ConfigError);
  });

  test('retire rejects an ill-formed project id before simulation', async () => {
    const client = new CambiumClient(validConfig);
    await expect(
      client.retirement.retire({
        from: 'GABC...',
        projectId: 'not-a-hex-id',
        vintageYear: 2025,
        amount: '100',
      }),
    ).rejects.toThrow(ConfigError);
  });
});

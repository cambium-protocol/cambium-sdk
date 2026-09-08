/**
 * Shared jest module-factory for `@stellar/stellar-sdk`.
 *
 * Single source of truth for the SDK stub used across module unit tests: it
 * wraps the real SDK (`jest.requireActual`) in mocked server,
 * transaction-builder, and address primitives so contract calls can be
 * exercised without a network.
 *
 * The export MUST be prefixed with `mock` — babel-plugin-jest-hoist only
 * allows `jest.mock()` factories to reference identifiers starting with
 * `mock`. Custom retvals are passed as an inline `retvalBuilder` so the real
 * module is only touched via `jest.requireActual` at runtime.
 */
export function mockStellarSdk(
  options: {
    retvalBuilder?: (
      real: typeof import('@stellar/stellar-sdk'),
    ) => unknown;
  } = {},
) {
  const real = jest.requireActual(
    '@stellar/stellar-sdk',
  ) as typeof import('@stellar/stellar-sdk');

  const retval =
    options.retvalBuilder !== undefined
      ? options.retvalBuilder(real)
      : real.nativeToScVal(1000n, { type: 'i128' });

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
      result: { retval },
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
        cloneFrom: jest
          .fn()
          .mockImplementation((_tx: unknown, opts: unknown) => ({
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
}
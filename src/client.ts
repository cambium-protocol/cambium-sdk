/**
 * CambiumClient — the main entry point for the Cambium Protocol SDK.
 *
 * Holds network config and deployed contract addresses, and exposes
 * namespaced modules: registry, credits, marketplace, retirement.
 *
 * Design: unsigned by default. Write methods build and simulate a transaction
 * and return it unsigned, keeping key custody entirely out of the SDK.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { ContractAddresses, Network } from './types';
import { RegistryModule } from './registry';
import { CreditsModule } from './credits';
import { MarketplaceModule } from './marketplace';
import { RetirementModule } from './retirement';
import {
  ConfigError,
  TxTimeoutError,
  fromSimulationError,
} from './errors';
import { Signer } from './signers/types';

export interface CambiumClientConfig {
  network: Network;
  rpcUrl: string;
  contracts: ContractAddresses;
  signer?: Signer;
}

/** Options for polling a transaction's final status. */
export interface TxPollOptions {
  /** Poll interval in milliseconds (default 1000). */
  intervalMs?: number;
  /** Maximum time to wait in milliseconds (default 30000). */
  timeoutMs?: number;
}

const NETWORK_PASSPHRASES: Record<Network, string> = {
  testnet: 'Test SDF Network ; September 2015',
  mainnet: 'Public Global Stellar Network ; September 2015',
  futurenet: 'Test SDF Future Network ; October 2022',
  local: 'Standalone Network ; February 2017',
};

export class CambiumClient {
  public readonly network: Network;
  public readonly rpcUrl: string;
  public readonly contracts: ContractAddresses;
  public readonly signer?: Signer;

  public readonly registry: RegistryModule;
  public readonly credits: CreditsModule;
  public readonly marketplace: MarketplaceModule;
  public readonly retirement: RetirementModule;

  private _server: StellarSdk.SorobanRpc.Server;

  constructor(config: CambiumClientConfig) {
    if (!config.rpcUrl) {
      throw new ConfigError('rpcUrl is required');
    }
    if (!config.contracts?.registry) {
      throw new ConfigError('registry contract address is required');
    }
    if (!config.contracts?.creditToken) {
      throw new ConfigError('creditToken contract address is required');
    }
    if (!config.contracts?.marketplace) {
      throw new ConfigError('marketplace contract address is required');
    }
    if (!config.contracts?.retirement) {
      throw new ConfigError('retirement contract address is required');
    }

    this.network = config.network;
    this.rpcUrl = config.rpcUrl;
    this.contracts = config.contracts;
    this.signer = config.signer;

    this._server = new StellarSdk.SorobanRpc.Server(config.rpcUrl);

    // Initialize modules
    this.registry = new RegistryModule(this);
    this.credits = new CreditsModule(this);
    this.marketplace = new MarketplaceModule(this);
    this.retirement = new RetirementModule(this);
  }

  /** Get the Stellar network passphrase for this client's network. */
  get networkPassphrase(): string {
    return NETWORK_PASSPHRASES[this.network];
  }

  /** Get the underlying Soroban RPC server instance. */
  get server(): StellarSdk.SorobanRpc.Server {
    return this._server;
  }

  /** Get the current ledger sequence from the network. */
  async getLedgerSequence(): Promise<number> {
    const response = await this._server.getLatestLedger();
    return response.sequence;
  }

  /**
   * Invoke a Soroban contract method (read-only simulation).
   * Returns the parsed result of the contract call.
   */
  async invokeContract(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[],
  ): Promise<unknown> {
    const contract = new StellarSdk.Contract(contractId);
    const operation = contract.call(method, ...args);

    // Build a dummy transaction for simulation
    const dummyKeypair = StellarSdk.Keypair.random();
    const dummyAccount = new StellarSdk.Account(
      dummyKeypair.publicKey(),
      '0',
    );

    const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
      networkPassphrase: this.networkPassphrase,
      fee: '0',
    })
      .addOperation(operation)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    const simulation = await this._server.simulateTransaction(transaction);

    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      throw fromSimulationError(simulation.error);
    }

    return simulation.result?.retval;
  }

  /**
   * Build, simulate, and return an unsigned transaction for a contract call.
   * The transaction is ready for signing and submission.
   *
   * On success the transaction is rebuilt with the simulated Soroban resource
   * footprint (read/write ledger entries, resource fees) attached, so the
   * signed transaction is accepted by the network when submitted.
   *
   * @throws {ContractError} if the contract call is rejected during simulation
   * @throws {SimulationError} if the simulation fails for another reason
   */
  async buildTransaction(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[],
    sourceAccount: string,
  ): Promise<StellarSdk.Transaction> {
    const contract = new StellarSdk.Contract(contractId);
    const account = await this._server.getAccount(sourceAccount);

    const transaction = new StellarSdk.TransactionBuilder(account, {
      networkPassphrase: this.networkPassphrase,
      fee: '100000',
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    // Simulate to get the resource footprint and fee estimates
    const simulation = await this._server.simulateTransaction(transaction);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      throw fromSimulationError(simulation.error);
    }

    // Rebuild the transaction with the simulated footprint and fees attached.
    // Without this the built transaction is rejected on submission because it
    // is missing the required Soroban data (ledger entries + resource fee).
    return StellarSdk.TransactionBuilder.cloneFrom(transaction, {
      fee: simulation.minResourceFee || StellarSdk.BASE_FEE,
      sorobanData: simulation.transactionData.build(),
    }).build();
  }

  /**
   * Submit a signed transaction to the network.
   */
  async submit(signedXdr: string): Promise<StellarSdk.SorobanRpc.Api.SendTransactionResponse> {
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      this.networkPassphrase,
    );

    return this._server.sendTransaction(transaction);
  }

  /**
   * Submit a signed transaction and wait for it to settle on-chain.
   *
   * Combines `submit` + `waitForTransaction` into one call and returns the
   * settlement details (ledger sequence, close time, and result XDR) once the
   * transaction reaches a final status. This is the recommended way to drive
   * write flows when you need to know the outcome before continuing.
   *
   * @param signedXdr - The signed transaction XDR
   * @param opts - Poll interval and timeout options for `waitForTransaction`
   * @returns Settlement details keyed by transaction hash
   * @throws {TxTimeoutError} if the transaction does not finalize in time
   */
  async submitAndWait(
    signedXdr: string,
    opts: TxPollOptions = {},
  ): Promise<{
    hash: string;
    status: string;
    ledger?: number;
    createdAt?: number;
    envelopeXdr?: string;
    resultXdr?: string;
  }> {
    const sent = await this.submit(signedXdr);
    const status = await this.waitForTransaction(sent.hash, opts);

    const details = await this._server.getTransaction(sent.hash);
    const settled =
      details.status === 'SUCCESS' || details.status === 'FAILED';

    return {
      hash: sent.hash,
      status,
      ledger: settled ? details.ledger : undefined,
      createdAt: settled ? details.createdAt : undefined,
      envelopeXdr: settled ? details.envelopeXdr.toXDR('base64') : undefined,
      resultXdr: settled ? details.resultXdr.toXDR('base64') : undefined,
    };
  }

  /**
   * Poll for a submitted transaction's final status.
   *
   * Soroban RPC initially reports a transaction as `PENDING` (or `NOT_FOUND`
   * until it is processed). This polls `getTransaction` until the status
   * settles on `SUCCESS`/`FAILED` or the timeout elapses.
   *
   * @param hash - Transaction hash (hex string, as returned by `submit`)
   * @param opts - Poll interval and timeout options
   * @returns The final status: `'SUCCESS'` | `'FAILED'` | `'NOT_FOUND'`
   * @throws {TxTimeoutError} if the transaction does not finalize in time
   */
  async waitForTransaction(
    hash: string,
    opts: TxPollOptions = {},
  ): Promise<string> {
    const intervalMs = opts.intervalMs ?? 1000;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;

    let status = 'PENDING';
    while (Date.now() < deadline) {
      const response = await this._server.getTransaction(hash);
      status = response.status;
      if (status !== 'PENDING' && status !== 'NOT_FOUND') {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new TxTimeoutError(hash, timeoutMs);
  }

  /**
   * Sign a transaction with the configured signer and submit it.
   *
   * The `tx` is typically produced by a module write method (e.g.
   * `client.registry.registerProject(...)`), which returns an unsigned
   * transaction. Requires `signer` in the client config.
   *
   * @param tx - An unsigned transaction to sign and submit
   * @returns The immediate send result from the RPC server
   * @throws {ConfigError} if no signer is configured
   */
  async signAndSend(
    tx: StellarSdk.Transaction,
  ): Promise<StellarSdk.SorobanRpc.Api.SendTransactionResponse> {
    if (!this.signer) {
      throw new ConfigError(
        'signAndSend requires a signer in the client config',
      );
    }

    const signedXdr = await this.signer.signTransaction(tx.toXDR());
    return this.submit(signedXdr);
  }

  /**
   * Fetch raw contract events matching a topic prefix from the RPC server.
   *
   * Events are matched by the first topic element (the event name symbol),
   * scoped to `contractId`.
   *
   * Soroban RPC caps a single `getEvents` request at 200 results, so this
   * method pages through the whole ledger window cursor-by-cursor until every
   * matching event has been collected (or `limit` events are reached). This is
   * what powers the on-chain event indexer (`listRetirements`,
   * `getRetirementEvents`): without pagination only the first 200 events in
   * the window would ever be visible.
   *
   * @param contractId - Contract that emitted the events
   * @param topicPrefix - Event name (e.g. `'retire'`)
   * @param opts - Ledger range and pagination options
   * @returns The matching raw `ContractEvent`s, in ledger order
   */
  async getContractEvents(
    contractId: string,
    topicPrefix: string,
    opts: { startLedger?: number; limit?: number } = {},
  ): Promise<StellarSdk.SorobanRpc.Api.EventResponse[]> {
    const latest = await this.getLedgerSequence();
    const startLedger = Math.max(1, opts.startLedger ?? latest - 50_000);
    const topic = StellarSdk.nativeToScVal(topicPrefix, { type: 'symbol' });

    const filters = [
      {
        contractIds: [contractId],
        topics: [[topic.toXDR('base64')]],
      },
    ];

    // Soroban RPC refuses limits above 200 events per request.
    const pageSize = 200;
    const maxEvents = opts.limit ?? Infinity;

    const collected: StellarSdk.SorobanRpc.Api.EventResponse[] = [];
    let cursor: string | undefined;

    for (;;) {
      const response = await this._server.getEvents({
        startLedger,
        cursor,
        filters,
        limit: pageSize,
      });

      const page = response.events ?? [];
      const nextCursor =
        page.length > 0 ? page[page.length - 1].pagingToken : undefined;

      // A repeated cursor means the RPC endpoint is not advancing (misbehaving
      // or exhausted) — stop before collecting the same page twice so we can
      // never loop forever.
      if (cursor !== undefined && nextCursor === cursor) break;

      collected.push(...page);

      const wantMore =
        collected.length < maxEvents && page.length >= pageSize;
      if (!wantMore) break;

      cursor = nextCursor;
    }

    return maxEvents === Infinity
      ? collected
      : collected.slice(0, maxEvents);
  }
}

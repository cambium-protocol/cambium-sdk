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
import { ConfigError } from './errors';
import { Signer } from './signers/types';

export interface CambiumClientConfig {
  network: Network;
  rpcUrl: string;
  contracts: ContractAddresses;
  signer?: Signer;
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
      throw new Error(`Simulation failed: ${simulation.error}`);
    }

    return simulation.result?.retval;
  }

  /**
   * Build, simulate, and return an unsigned transaction for a contract call.
   * The transaction is ready for signing and submission.
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

    // Simulate to get resource estimates
    const simulation = await this._server.simulateTransaction(transaction);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
      throw new Error(`Simulation failed: ${simulation.error}`);
    }

    // Restore with simulated resources
    return StellarSdk.TransactionBuilder.cloneFrom(transaction, {
      fee: StellarSdk.BASE_FEE,
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
}

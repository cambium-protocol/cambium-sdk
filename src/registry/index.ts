/**
 * Registry module — read and write operations for carbon projects, vintages,
 * and registry governance.
 *
 * Maps to the `registry` Soroban contract:
 * - getProject(projectId) / getVintage(projectId, year) -> reads
 * - registerProject / requestMint -> Transactions (unsigned)
 * - getGovernance / getVkey -> reads
 * - proposeVkeyUpdate / approveVkeyUpdate / executeVkeyUpdate -> Transactions
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import { GovernanceConfig, Project, Vintage, ProjectFilter, VkeyState } from '../types';
import {
  asAmount,
  asBytes,
  asNumber,
  asOption,
  asRecord,
  asString,
  asVec,
  idFromScVal,
  idToScVal,
} from '../scval';

export class RegistryModule {
  private client: CambiumClient;

  constructor(client: CambiumClient) {
    this.client = client;
  }

  /** Get the registry contract address. */
  private get contractId(): string {
    return this.client.contracts.registry;
  }

  /**
   * Look up a registered project by ID.
   * @param projectId - The 32-byte hex project ID
   */
  async getProject(projectId: string): Promise<Project> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_project',
      [idToScVal(projectId)],
    );

    return this.parseProject(result);
  }

  /**
   * Look up a vintage record by project ID and year.
   * @param projectId - The 32-byte hex project ID
   * @param year - The vintage year (e.g. 2025)
   */
  async getVintage(projectId: string, year: number): Promise<Vintage> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_vintage',
      [
        idToScVal(projectId),
        StellarSdk.nativeToScVal(year, { type: 'u32' }),
      ],
    );

    return this.parseVintage(result);
  }

  /**
   * List projects (read-only).
   *
   * Note: Soroban storage does not support iteration, and the registry
   * contract does not emit a project-registration event, so an authoritative
   * list cannot currently be reconstructed on-chain. In production this would
   * be served by an off-chain indexer that observes `register_project` calls
   * (or a future contract event).
   */
  async listProjects(_filter?: ProjectFilter): Promise<Project[]> {
    return [];
  }

  /**
   * Build an unsigned transaction to register a new project.
   * @param project - The project to register
   * @param sourceAccount - The account that will sign the transaction
   */
  async registerProject(
    project: Project,
    sourceAccount: string,
  ): Promise<StellarSdk.Transaction> {
    const args = [
      StellarSdk.nativeToScVal(
        {
          id: idToScVal(project.id),
          methodology: StellarSdk.nativeToScVal(project.methodology, {
            type: 'symbol',
          }),
          geography: StellarSdk.nativeToScVal(project.geography, {
            type: 'symbol',
          }),
          external_registry_ref: project.externalRegistryRef
            ? StellarSdk.nativeToScVal(
                Buffer.from(project.externalRegistryRef),
                { type: 'bytes' },
              )
            : StellarSdk.nativeToScVal(null),
          verifying_key_version: StellarSdk.nativeToScVal(
            project.verifyingKeyVersion,
            { type: 'u32' },
          ),
        },
        { type: 'contract' },
      ),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'register_project',
      args,
      sourceAccount,
    );
  }

  /**
   * Build an unsigned transaction to request a mint.
   * @param projectId - The project ID (32-byte hex)
   * @param vintageYear - The vintage year
   * @param amount - Amount to mint (as string to avoid precision loss)
   * @param proof - The ZK proof data
   * @param sourceAccount - The account that will sign the transaction
   */
  async requestMint(
    projectId: string,
    vintageYear: number,
    amount: string,
    proof: { proofData: string; publicInputs: string[] },
    sourceAccount: string,
  ): Promise<StellarSdk.Transaction> {
    const args = [
      idToScVal(projectId),
      StellarSdk.nativeToScVal(vintageYear, { type: 'u32' }),
      StellarSdk.nativeToScVal(amount, { type: 'i128' }),
      StellarSdk.nativeToScVal(
        {
          proof_data: StellarSdk.nativeToScVal(
            Buffer.from(proof.proofData, 'hex'),
            { type: 'bytes' },
          ),
          public_inputs: StellarSdk.nativeToScVal(
            proof.publicInputs.map((pi) => idToScVal(pi)),
            { type: 'vec' },
          ),
        },
        { type: 'contract' },
      ),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'request_mint',
      args,
      sourceAccount,
    );
  }

  // -- Parsers --

  /**
   * Get the current multi-sig + timelock governance configuration.
   */
  async getGovernance(): Promise<GovernanceConfig> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_governance',
      [],
    );
    return this.parseGovernance(result);
  }

  /**
   * Get the canonical verifying key state for a methodology.
   * @param methodology - Methodology code, e.g. "VM0007"
   */
  async getVkey(methodology: string): Promise<VkeyState> {
    const result = await this.client.invokeContract(
      this.contractId,
      'get_vkey',
      [StellarSdk.nativeToScVal(methodology, { type: 'symbol' })],
    );
    return this.parseVkey(result);
  }

  /**
   * Build an unsigned transaction to propose a verifying-key update.
   *
   * The proposer must be a member of the governance signer set; their
   * signature counts as the first approval.
   *
   * @param params - signer (authorizes the call), methodology, newKey (32-byte hex)
   * @returns An unsigned transaction that resolves to the proposal id.
   */
  async proposeVkeyUpdate(params: {
    signer: string;
    methodology: string;
    newKey: string;
  }): Promise<StellarSdk.Transaction> {
    const args = [
      new StellarSdk.Address(params.signer).toScVal(),
      StellarSdk.nativeToScVal(params.methodology, { type: 'symbol' }),
      idToScVal(params.newKey),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'propose_vkey_update',
      args,
      params.signer,
    );
  }

  /**
   * Build an unsigned transaction to approve a pending verifying-key update.
   *
   * The approver must be a governance signer who has not already approved the
   * proposal.
   *
   * @param params - signer (authorizes the call), proposalId (32-byte hex)
   * @returns An unsigned transaction that resolves to the total approval count.
   */
  async approveVkeyUpdate(params: {
    signer: string;
    proposalId: string;
  }): Promise<StellarSdk.Transaction> {
    const args = [
      new StellarSdk.Address(params.signer).toScVal(),
      idToScVal(params.proposalId),
    ];

    return this.client.buildTransaction(
      this.contractId,
      'approve_vkey_update',
      args,
      params.signer,
    );
  }

  /**
   * Build an unsigned transaction to execute a fully-approved, timelock-elapsed
   * verifying-key update. Execution is permissionless — any account may
   * submit it once threshold is reached and the timelock has passed.
   *
   * @param proposalId - The proposal's id (32-byte hex)
   * @param sourceAccount - Any account paying for and submitting the tx
   * @returns An unsigned transaction that resolves to the new VkeyState.
   */
  async executeVkeyUpdate(
    proposalId: string,
    sourceAccount: string,
  ): Promise<StellarSdk.Transaction> {
    const args = [idToScVal(proposalId)];

    return this.client.buildTransaction(
      this.contractId,
      'execute_vkey_update',
      args,
      sourceAccount,
    );
  }

  // -- Parsers --

  private parseGovernance(value: unknown): GovernanceConfig {
    const obj = asRecord(value);
    return {
      threshold: asNumber(obj.threshold),
      signers: asVec(obj.signers).map((s) => asString(s)),
      timelockSecs: asNumber(obj.timelock_secs),
    };
  }

  private parseVkey(value: unknown): VkeyState {
    const obj = asRecord(value);
    return {
      version: asNumber(obj.version),
      key: idFromScVal(obj.key),
    };
  }

  private parseProject(value: unknown): Project {
    const obj = asRecord(value);
    return {
      id: idFromScVal(obj.id),
      methodology: asString(obj.methodology),
      geography: asString(obj.geography),
      externalRegistryRef: asOption(obj.external_registry_ref, (v) =>
        asBytes(v).toString('utf8'),
      ),
      verifyingKeyVersion: asNumber(obj.verifying_key_version),
    };
  }

  private parseVintage(value: unknown): Vintage {
    const obj = asRecord(value);
    return {
      projectId: idFromScVal(obj.project_id),
      year: asNumber(obj.year),
      totalIssued: asAmount(obj.total_issued),
      totalRetired: asAmount(obj.total_retired),
    };
  }
}

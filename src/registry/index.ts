/**
 * Registry module — read and write operations for carbon projects and vintages.
 *
 * Maps to the `registry` Soroban contract:
 * - getProject(projectId) -> Project
 * - getVintage(projectId, year) -> Vintage
 * - registerProject(project) -> Transaction (unsigned)
 * - requestMint(projectId, vintageYear, amount, proof) -> Transaction (unsigned)
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { CambiumClient } from '../client';
import { Project, Vintage, ProjectFilter } from '../types';
import {
  asAmount,
  asBytes,
  asNumber,
  asOption,
  asRecord,
  asString,
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

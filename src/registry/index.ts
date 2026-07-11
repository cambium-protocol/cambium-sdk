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
import { NotFoundError } from '../errors';

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
      [new StellarSdk.Address(projectId).toScVal()],
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
        new StellarSdk.Address(projectId).toScVal(),
        StellarSdk.nativeToScVal(year, { type: 'u32' }),
      ],
    );

    return this.parseVintage(result);
  }

  /**
   * List projects (read-only).
   * Note: Soroban contracts don't have native list support — this is a
   * convenience method that may need off-chain indexing in production.
   * For now, returns a single project if found.
   */
  async listProjects(_filter?: ProjectFilter): Promise<Project[]> {
    // Soroban storage doesn't support iteration — in production this would
    // use an event index or off-chain indexer. For now, return empty.
    // TODO: implement via event indexing or off-chain indexer
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
          id: StellarSdk.Address(project.id),
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
            : StellarSdk.nativeToScVal(null, { type: 'option' }),
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
   * @param projectId - The project ID
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
      new StellarSdk.Address(projectId).toScVal(),
      StellarSdk.nativeToScVal(vintageYear, { type: 'u32' }),
      StellarSdk.nativeToScVal(amount, { type: 'i128' }),
      StellarSdk.nativeToScVal(
        {
          proof_data: StellarSdk.nativeToScVal(
            Buffer.from(proof.proofData, 'hex'),
            { type: 'bytes' },
          ),
          public_inputs: StellarSdk.nativeToScVal(
            proof.publicInputs.map((pi) =>
              StellarSdk.Address(pi).toScVal(),
            ),
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
    // Placeholder parser — will be refined against actual XDR response shape
    const obj = value as Record<string, unknown>;
    return {
      id: String(obj.id || ''),
      methodology: String(obj.methodology || ''),
      geography: String(obj.geography || ''),
      externalRegistryRef: obj.external_registry_ref
        ? String(obj.external_registry_ref)
        : undefined,
      verifyingKeyVersion: Number(obj.verifying_key_version || 0),
    };
  }

  private parseVintage(value: unknown): Vintage {
    const obj = value as Record<string, unknown>;
    return {
      projectId: String(obj.project_id || ''),
      year: Number(obj.year || 0),
      totalIssued: String(obj.total_issued || '0'),
      totalRetired: String(obj.total_retired || '0'),
    };
  }
}

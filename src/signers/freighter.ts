/**
 * Freighter wallet signer implementation.
 *
 * Wraps the Freighter browser extension API to provide signing capabilities
 * for the Cambium SDK. Requires the @freighter/freighter-api package at runtime.
 *
 * Usage:
 *   import { FreighterSigner } from '@cambium-protocol/sdk/signers/freighter';
 *   const signer = new FreighterSigner();
 *   const client = new CambiumClient({ ...config, signer });
 */

import { Signer } from './types';

export class FreighterSigner implements Signer {
  private freighterApi: typeof import('@freighter/freighter-api') | null = null;

  constructor() {
    // Lazy-load freighter-api to avoid hard dependency at import time
  }

  private async getApi() {
    if (!this.freighterApi) {
      try {
        this.freighterApi = await import('@freighter/freighter-api');
      } catch {
        throw new Error(
          'Freighter API not available. Install @freighter/freighter-api: ' +
          'npm install @freighter/freighter-api',
        );
      }
    }
    return this.freighterApi;
  }

  /**
   * Get the public key of the connected Freighter wallet.
   */
  async getPublicKey(): Promise<string> {
    const api = await this.getApi();
    const { getAddress } = api;
    const { address } = await getAddress();
    return address;
  }

  /**
   * Sign a transaction XDR using the Freighter wallet.
   * @param xdr - The unsigned transaction XDR string
   * @returns The signed transaction XDR string
   */
  async signTransaction(xdr: string): Promise<string> {
    const api = await this.getApi();
    const { signTransaction: freighterSign } = api;
    const signedXdr = await freighterSign(xdr, {
      networkPassphrase: undefined,
    });
    return signedXdr;
  }
}

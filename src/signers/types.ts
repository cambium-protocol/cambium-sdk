/**
 * Minimal signer interface for wallet integration.
 *
 * The SDK builds and simulates transactions but returns them unsigned
 * by default. Pass a Signer to enable auto-sign-and-submit convenience methods.
 */
export interface Signer {
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string): Promise<string>;
}

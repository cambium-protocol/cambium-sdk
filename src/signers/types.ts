/**
 * Minimal signer interface for wallet integration.
 *
 * The SDK builds and simulates transactions but returns them unsigned
 * by default. Pass a Signer to enable auto-sign-and-submit convenience methods.
 */
export interface Signer {
  getPublicKey(): Promise<string>;
  /**
   * Sign a transaction XDR.
   *
   * @param xdr - The unsigned transaction XDR string
   * @param networkPassphrase - The Stellar network passphrase to sign for
   * (e.g. the CambiumClient's `networkPassphrase`). Wallets embed the
   * passphrase hash in the signature to prevent replay across networks, so
   * omitting it can produce signatures that are rejected on submission.
   */
  signTransaction(xdr: string, networkPassphrase?: string): Promise<string>;
}

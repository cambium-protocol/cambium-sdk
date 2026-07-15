# Wallet Integration

The Cambium SDK is designed to keep key custody entirely out of the SDK. By default, all write methods build and simulate transactions but return them unsigned. You can integrate a wallet by implementing the `Signer` interface or using the built-in `FreighterSigner`.

## Signer Interface

```ts
export interface Signer {
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string): Promise<string>;
}
```

Any object implementing this interface can be passed as a signer to `CambiumClient`.

## Using FreighterSigner

The SDK ships with a Freighter wallet integration:

```ts
import { CambiumClient, FreighterSigner } from '@cambium-protocol/sdk';

const signer = new FreighterSigner();
const client = new CambiumClient({
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contracts: { /* ... */ },
  signer,
});

// Now write methods can sign and submit
const result = await client.credits.transferAndSubmit({
  from: await signer.getPublicKey(),
  to: 'GDEF...',
  amount: '100',
});
```

### Prerequisites

Install the Freighter API package:

```bash
npm install @freighter/freighter-api
```

The `FreighterSigner` lazy-loads `@freighter/freighter-api` at runtime, so the SDK itself does not have a hard dependency on it.

## Custom Signer

To integrate a different wallet (e.g., Stellar Wallet by Hana, Lobstr, etc.), implement the `Signer` interface:

```ts
import { Signer } from '@cambium-protocol/sdk';

class MyWalletSigner implements Signer {
  async getPublicKey(): Promise<string> {
    // Call your wallet's API to get the public key
    return wallet.getAddress();
  }

  async signTransaction(xdr: string): Promise<string> {
    // Call your wallet's API to sign the XDR
    return wallet.sign(xdr);
  }
}

const client = new CambiumClient({
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contracts: { /* ... */ },
  signer: new MyWalletSigner(),
});
```

## Unsigned Transactions (Default)

If no signer is provided, write methods return an unsigned `StellarSdk.Transaction` object. You can serialize it to XDR, pass it to your own signing infrastructure, and submit it manually:

```ts
const client = new CambiumClient({
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contracts: { /* ... */ },
});

const tx = await client.retirement.retire({
  from: 'GABC...',
  projectId: 'project-1',
  vintageYear: 2025,
  amount: '500',
});

// Serialize to XDR for your signing service
const xdr = tx.toXDR();

// Later, submit the signed XDR
const result = await client.submit(signedXdr);
```

## Browser vs Node.js

- **Browser**: Use `FreighterSigner` or a custom signer that calls browser wallet APIs.
- **Node.js**: Implement a `Signer` that calls a remote signing service or uses stored keys (e.g., via `stellar-sdk`'s `Keypair`).

Never store secret keys in source code or environment variables in production. Use a remote signing service or HSM.

# Compatibility

## Stellar SDK Version

The Cambium SDK requires `@stellar/stellar-sdk` version **12.0.0 or later** as a peer dependency.

```json
{
  "peerDependencies": {
    "@stellar/stellar-sdk": ">=12.0.0"
  }
}
```

### Known Breaking Changes

- **v12.0.0**: `TransactionBuilder.fromXdr` was renamed to `TransactionBuilder.fromXDR` (capitalization change). The Cambium SDK uses the v12+ API.

## Node.js

- **Minimum version**: Node.js 18.0.0 or later (ES2020 target)
- **Module system**: CommonJS (compiled from TypeScript)

## TypeScript

- **Minimum version**: TypeScript 5.0.0 or later
- **Strict mode**: The SDK is compiled with `strict: true`. If you consume it with a less strict config, you may see type errors from the SDK's declaration files.

## Browser

The SDK is designed for Node.js use. Browser environments are supported through bundlers (webpack, vite, esbuild) but require:

- A polyfill for Node.js `Buffer` (if not already provided by your bundler)
- A compatible wallet signer (e.g., `FreighterSigner`) since `Keypair` and file-based signing are not available in browsers

## Soroban RPC

The SDK connects to a Soroban RPC node. Compatible endpoints:

| Network  | RPC URL                                      |
|----------|----------------------------------------------|
| Testnet  | `https://soroban-testnet.stellar.org`        |
| Futurenet| `https://soroban-futurenet.stellar.org`      |
| Mainnet  | `https://soroban-mainnet.stellar.org` (TBD)  |

Ensure your RPC node supports the Soroban `simulateTransaction` and `sendTransaction` endpoints.

## Contract Compatibility

The SDK is built against the Cambium Protocol smart contracts. Contract ABI changes may require SDK updates. Check the [CHANGELOG](../CHANGELOG.md) for contract-SDK version mappings.

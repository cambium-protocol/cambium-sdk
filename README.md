# cambium-sdk

TypeScript SDK for integrating with Cambium Protocol — a carbon credit registry, marketplace, and retirement system on Stellar/Soroban.

> Part of the [Cambium Protocol](https://github.com/cambium-protocol) organization.

[![npm version](https://img.shields.io/npm/v/@cambium-protocol/sdk.svg)](https://www.npmjs.com/package/@cambium-protocol/sdk)

---

## Table of contents

- [Overview](#overview)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [Core concepts](#core-concepts)
- [API reference](#api-reference)
  - [Client setup](#client-setup)
  - [Registry](#registry)
  - [Credits](#credits)
  - [Marketplace](#marketplace)
  - [Retirement](#retirement)
- [Wallet integration](#wallet-integration)
- [Error handling](#error-handling)
- [Repository structure](#repository-structure)
- [Development](#development)
- [Testing](#testing)
- [Versioning & compatibility](#versioning--compatibility)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

`@cambium-protocol/sdk` wraps the Soroban contract calls in [`contracts`](https://github.com/cambium-protocol/contracts) behind a friendly, typed TypeScript API, so you don't need to hand-build XDR or manage contract ABIs yourself. It's used by the [`web-app`](https://github.com/cambium-protocol/web-app) frontend, and is designed to be equally usable by any third-party integrator — wallets, portfolio trackers, ESG reporting tools, etc.

Design goals:
- **Typed end-to-end.** Every contract call has a corresponding typed method with typed return values.
- **No silent magic.** The SDK builds and simulates transactions for you but always returns them for inspection/signing rather than silently submitting without confirmation, unless you explicitly opt into an auto-submit mode.
- **Framework-agnostic.** Works in Node.js, browser bundlers, and React Native; no hard dependency on any UI framework.

---

## Installation

```bash
npm install @cambium-protocol/sdk
# or
pnpm add @cambium-protocol/sdk
# or
yarn add @cambium-protocol/sdk
```

Peer dependencies:

```bash
npm install @stellar/stellar-sdk
```

---

## Quickstart

```typescript
import { CambiumClient } from '@cambium-protocol/sdk';

const client = new CambiumClient({
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contracts: {
    registry: 'CBSLLVCIZBXKPHY73PN5DVHQKNGK4FAZBXMQLKZCJABABUX5OQGPHC43',
    creditToken: 'CBRBMYB6UTJEMMSBQQPYHAIO5QWJAT4EBPIFTEEB6MRY6ZZD5NS5KY36',
    marketplace: 'CAKXZQTCVDSGVF2BU5FY636O4TDCAX5UJCWYGQKDKMOA5QNBDKPXZ5S7',
    retirement: 'CDIHLUARSMSYU27QRKXBWVK5HXIJRUAQ3SYQYCK3MZ2UKMCRB275H3G5',
    zkVerifier: 'CDHHVK26VAEP4APPELQLJQLZUKMCDSXGBWT7K6V7L7T6CHHRDY2MUAD7',
  },
});

// Read: get a project's issuance summary
const project = await client.registry.getProject('project-id-hash');
console.log(project.totalIssued, project.totalRetired);

// Read: check a wallet's credit balance for a given vintage
const balance = await client.credits.balanceOf({
  address: 'GABC...',
  projectId: 'project-id-hash',
  vintageYear: 2025,
});

// Write: buy credits via the AMM pool (returns an unsigned transaction)
const tx = await client.marketplace.swap({
  poolId: 'pool-id',
  amountIn: '100',
  minAmountOut: '95',
  trader: 'GABC...',
});

// Sign with your preferred wallet integration, then submit
const signedTx = await myWallet.sign(tx);
const result = await client.submit(signedTx);
console.log(result.status);
```

---

## Core concepts

- **Client** — a `CambiumClient` instance holds network config and deployed contract addresses, and exposes namespaced modules (`registry`, `credits`, `marketplace`, `retirement`).
- **Unsigned by default** — write methods build and simulate a transaction and return it unsigned. This keeps key custody entirely out of the SDK's hands. Use `client.submit()` after signing, or pass a `signer` in the client config to enable one-line signed calls (see [Wallet integration](#wallet-integration)).
- **Amounts as strings** — all token amounts are passed/returned as decimal strings (not JS numbers) to avoid floating-point precision issues with on-chain integer math. The SDK handles the conversion to/from the contract's fixed-point representation internally.

---

## API reference

### Client setup

```typescript
new CambiumClient(config: CambiumClientConfig)
```

```typescript
interface CambiumClientConfig {
  network: 'testnet' | 'mainnet' | 'futurenet' | 'local';
  rpcUrl: string;
  contracts: {
    registry: string;
    creditToken: string;
    marketplace: string;
    retirement: string;
    zkVerifier?: string; // optional, only needed for advanced/shielded flows
  };
  signer?: Signer; // optional; enables auto-sign-and-submit convenience methods
}
```

### Registry

```typescript
client.registry.getProject(projectId: string): Promise<Project>
client.registry.getVintage(projectId: string, year: number): Promise<Vintage>
client.registry.listProjects(filter?: ProjectFilter): Promise<Project[]>
```

### Credits

```typescript
client.credits.balanceOf(params: { address: string; projectId: string; vintageYear: number }): Promise<string>
client.credits.transfer(params: TransferParams): Promise<Transaction>       // unsigned
client.credits.transferAndSubmit(params: TransferParams): Promise<TxResult> // requires signer in config
```

### Marketplace

```typescript
client.marketplace.getPool(poolId: string): Promise<PoolState>
client.marketplace.quote(params: QuoteParams): Promise<Quote>              // read-only price estimate, no tx
client.marketplace.swap(params: SwapParams): Promise<Transaction>          // unsigned
client.marketplace.placeLimitOrder(params: OrderParams): Promise<Transaction>
client.marketplace.cancelOrder(orderId: string): Promise<Transaction>
client.marketplace.getOrderBook(poolId: string): Promise<OrderBookSnapshot>
```

### Retirement

```typescript
client.retirement.retire(params: RetireParams): Promise<Transaction>       // unsigned
client.retirement.getRetirement(id: string): Promise<RetirementRecord>
client.retirement.listRetirements(filter?: RetirementFilter): Promise<RetirementRecord[]>
```

`RetireParams` accepts an optional `shield: boolean` flag corresponding to the shielded-retirement path described in the `contracts` and `zk-circuits` READMEs. When `shield: true`, the SDK handles constructing the required membership proof input via a pluggable `proofProvider` (defaults to calling a local `zk-circuits` build; can be pointed at a remote proving service).

---

## Wallet integration

The SDK doesn't assume a specific wallet. It works with anything implementing the minimal `Signer` interface:

```typescript
interface Signer {
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string): Promise<string>;
}
```

Reference adapters are provided for common Stellar wallets:

```typescript
import { FreighterSigner } from '@cambium-protocol/sdk/signers/freighter';

const client = new CambiumClient({
  // ...
  signer: new FreighterSigner(),
});
```

See [`docs/wallet-integration.md`](./docs/wallet-integration.md) for the full list of reference adapters and how to write a custom one.

---

## Error handling

All SDK methods throw a typed `CambiumError` subclass on failure:

```typescript
try {
  await client.marketplace.swap({ /* ... */ });
} catch (err) {
  if (err instanceof InsufficientLiquidityError) {
    // handle specifically
  } else if (err instanceof ContractError) {
    console.error(err.code, err.message); // maps to on-chain error codes
  }
}
```

Full error taxonomy in [`src/errors.ts`](./src/errors.ts).

---

## Repository structure

```
sdk-js/
├── src/
│   ├── client.ts
│   ├── registry/
│   ├── credits/
│   ├── marketplace/
│   ├── retirement/
│   ├── signers/
│   │   ├── freighter.ts
│   │   └── types.ts
│   ├── errors.ts
│   └── index.ts
├── test/
│   ├── unit/
│   └── integration/          # runs against testnet deployment
├── examples/
│   └── node-script/          # runnable Node.js example against testnet
├── docs/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development

```bash
git clone https://github.com/cambium-protocol/sdk-js.git
cd sdk-js
npm install
npm run build
```

Point the SDK at a local `contracts` deployment for development:

```bash
npm run link:local-contracts -- ../contracts/deployed-addresses.local.json
```

---

## Testing

```bash
npm run test:unit          # mocked contract responses
npm run test:integration   # requires deployed addresses (see below)
```

Integration tests connect to Stellar testnet and verify the SDK against the live deployed contracts. They read contract addresses from `DEPLOYED_ADDRESSES_PATH` (defaulting to `../contracts/deployed-addresses.testnet.json`):

```bash
npm run test:integration
# or explicitly:
DEPLOYED_ADDRESSES_PATH=../contracts/deployed-addresses.testnet.json npm run test:integration
```

---

## Versioning & compatibility

This SDK follows semver, but note that **major version bumps track `contracts` interface changes** — an SDK major version is only guaranteed compatible with the corresponding `contracts` major version. See the [compatibility matrix](./docs/compatibility.md).

---

## Status

**Version 0.1.0 — testnet**

| Module | Status |
|---|---|
| Registry (read) | Working — `getProject`, `getVintage` verified against testnet |
| Registry (write) | Stub — `registerProject`, `requestMint` build unsigned txs, not yet tested end-to-end |
| Credits | Working — `balanceOf`, `transfer` verified against testnet |
| Marketplace | Partial — `getPool`, `quote`, `swap` build and simulate; `placeLimitOrder`, `cancelOrder` throw `NotYetImplementedError` |
| Retirement | Working — `retire` (public path) verified against testnet; `shield: true` path throws `NotYetImplementedError` (shielded retirement deferred) |
| Wallet integration | Working — `FreighterSigner` adapter shipped; `Signer` interface ready for other wallets |

---

## Roadmap

- [ ] Limit order book in marketplace (place, cancel, fill)
- [ ] Shielded retirement flow (requires `group_membership` ZK circuit + multi-contributor ceremony)
- [ ] Off-chain event indexer for `listProjects` / `listRetirements` (Soroban storage doesn't support iteration)
- [ ] React Native compatibility pass
- [ ] Mainnet audit before mainnet deployment

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Any new SDK method must include both a unit test (mocked) and an integration test (against testnet deployment).

## License

[Apache License 2.0](./LICENSE)

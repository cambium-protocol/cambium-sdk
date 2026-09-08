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

// Read: get a project vintage's issuance summary
const vintage = await client.registry.getVintage('project-id-hash', 2025);
console.log(vintage.totalIssued, vintage.totalRetired);

// Read: check a wallet's credit balance
const balance = await client.credits.balanceOf('GABC...');

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

// Wait for the transaction to settle on-chain (SUCCESS | FAILED | NOT_FOUND)
const finalStatus = await client.waitForTransaction(result.hash);
console.log(result.status, finalStatus);
```

If a `signer` is configured on the client, signing and submission collapse
into one call:

```typescript
const result = await client.signAndSend(tx); // requires signer in config
```

`submitAndWait` combines submit + polling and returns the settlement details
(ledger sequence, close time, result XDR) once the transaction finalizes:

```typescript
const { hash, status, ledger } = await client.submitAndWait(signedTx);
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
client.registry.listProjects(filter?: ProjectFilter): Promise<Project[]>   // requires off-chain indexer
client.registry.registerProject(project: Project, sourceAccount: string): Promise<Transaction>
client.registry.requestMint(projectId, vintageYear, amount, proof, sourceAccount): Promise<Transaction>
client.registry.getGovernance(): Promise<GovernanceConfig>                 // read
client.registry.getVkey(methodology: string): Promise<VkeyState>           // read
client.registry.proposeVkeyUpdate(params): Promise<Transaction>            // unsigned (governance signer)
client.registry.approveVkeyUpdate(params): Promise<Transaction>            // unsigned (governance signer)
client.registry.executeVkeyUpdate(proposalId: string, sourceAccount: string): Promise<Transaction>
```

### Credits

```typescript
client.credits.balanceOf(address: string): Promise<string>                // read
client.credits.allowance(params: AllowanceParams): Promise<string>        // read
client.credits.name(): Promise<string>                                    // read (SEP-41)
client.credits.symbol(): Promise<string>                                  // read (SEP-41)
client.credits.decimals(): Promise<number>                                // read (SEP-41)
client.credits.admin(): Promise<string>                                   // read
client.credits.getBurner(): Promise<string | undefined>                   // read
client.credits.isAllowlisted(address: string): Promise<boolean>           // read
client.credits.transfer(params: TransferParams): Promise<Transaction>       // unsigned
client.credits.transferFrom(params: TransferFromParams): Promise<Transaction> // unsigned
client.credits.approve(params: ApproveParams): Promise<Transaction>         // unsigned
client.credits.transferAndSubmit(params: TransferParams): Promise<TxResult> // requires signer in config
```

### Marketplace

```typescript
client.marketplace.getPool(poolId: string): Promise<PoolState>
client.marketplace.createPool(params: CreatePoolParams): Promise<Transaction>            // unsigned
client.marketplace.quote(params: { poolId: string; amountIn: string }): Promise<Quote>  // read-only price estimate, no tx
client.marketplace.swap(params: SwapParams): Promise<Transaction>                       // unsigned
client.marketplace.placeLimitOrder(params: PlaceLimitOrderParams): Promise<Transaction> // unsigned
client.marketplace.cancelOrder(params: CancelOrderParams): Promise<Transaction>         // unsigned
client.marketplace.getOrder(orderId: string): Promise<Order>
client.marketplace.getOrderBook(poolId: string): Promise<Order[]>
```

Limit orders rest on the marketplace order book. The sold asset is escrowed
immediately: sell orders escrow `amount` credit tokens, buy orders escrow
`amount * price` units of the paired asset — the caller must approve the
marketplace to transfer the escrow token (e.g. via
`client.credits.approve` / the paired token's approve) before submitting a
`placeLimitOrder` transaction.

### Retirement

```typescript
client.retirement.retire(params: RetireParams): Promise<Transaction>       // unsigned
client.retirement.retireAndSubmit(params: RetireParams): Promise<RetireResult> // requires signer; settles + returns the on-chain record
client.retirement.getRetirement(id: string): Promise<RetirementRecord>
client.retirement.listRetirements(filter?: RetirementFilter): Promise<RetirementRecord[]>
client.retirement.getRetirementEvents(opts?): Promise<RetireEvent[]>       // typed events API
```

`listRetirements` reconstructs the records from `retire` contract events.
Each record id is derived exactly as the contract derives it
(`keccak256(project_id, vintage_year, amount, ledger)`), so event-listed
records round-trip with `getRetirement(id)`. Events are fetched across the
latest 50,000 ledgers and the RPC call is paginated internally, so *all*
matching events are returned — pass `startLedger` to `getRetirementEvents`
for older history and `limit` to cap the number of events fetched.

`RetireParams` accepts an optional `shield: boolean` flag corresponding to the shielded-retirement path described in the `contracts` and `zk-circuits` READMEs. When `shield: true`, a `nullifier` (32-byte hex commitment) is **required** and is the only identifying data recorded on-chain; the retiring address is never written. When `shield` is omitted or false, the retirement is public and `nullifier` is ignored.

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
  if (err instanceof ContractError) {
    console.error(err.code, err.message); // maps to on-chain error codes
  } else if (err instanceof TxFailureError) {
    console.error(err.hash, err.status); // tx finalized as FAILED
  } else if (err instanceof ConfigError) {
    // malformed input rejected before any network round-trip
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
| Registry (write) | Working — `registerProject`, `requestMint`, governance `propose/approve/execute` build unsigned txs with correct ABI args; inputs validated locally |
| Credits | Working — SEP-41 `balance`, `transfer`, `transfer_from`, `approve`, `allowance`, `name`, `symbol`, `decimals` plus `admin`, `get_burner`, `is_allowlisted` reads |
| Marketplace | Working — `getPool`, `quote`, `swap`, `createPool`, `placeLimitOrder`, `cancelOrder`, `getOrder`, `getOrderBook` build correct ABI args and parse ScVal results; inputs validated locally |
| Retirement | Working — `retire` public and shielded paths build correct ABI args; `listRetirements`/`getRetirementEvents` reconstruct records from on-chain events (fully paginated); `retireAndSubmit` settles and returns the on-chain record |
| Wallet integration | Working — `FreighterSigner` adapter shipped; `Signer` interface ready for other wallets |

---

## Roadmap

- [x] Complete event listing — `listRetirements` / `getRetirementEvents` now
      page through the full ledger window (RPC calls are paginated internally)
- [ ] Off-chain event indexer for `listProjects` (Soroban storage doesn't
      support iteration and the registry contract does not yet emit a
      registration event)
- [ ] Shielded retirement flow (requires `group_membership` ZK circuit + multi-contributor ceremony)
- [ ] React Native compatibility pass
- [ ] Mainnet audit before mainnet deployment

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Any new SDK method must include both a unit test (mocked) and an integration test (against testnet deployment).

## License

[Apache License 2.0](./LICENSE)

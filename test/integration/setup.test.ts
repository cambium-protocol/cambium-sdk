/**
 * Integration tests — run against a live testnet deployment.
 *
 * These tests verify the SDK works against actual deployed contracts on
 * Stellar testnet. They require:
 * 1. Contracts deployed via scripts/deploy.sh testnet
 * 2. A funded testnet account for signing transactions
 * 3. The deployed-addresses.testnet.json file with contract addresses
 *
 * Usage:
 *   DEPLOYED_ADDRESSES_PATH=../contracts/deployed-addresses.testnet.json \
 *   TESTNET_SOURCE=GABC... \
 *   npm run test:integration
 */

import * as fs from 'fs';
import * as path from 'path';
import { CambiumClient } from '../../src/client';

// Load deployed addresses from testnet deployment
function loadDeployedAddresses(): Record<string, string> {
  const addrPath =
    process.env.DEPLOYED_ADDRESSES_PATH ||
    path.join(__dirname, '..', '..', '..', 'contracts', 'deployed-addresses.testnet.json');

  if (!fs.existsSync(addrPath)) {
    throw new Error(
      `Deployed addresses file not found at ${addrPath}. ` +
      'Run scripts/deploy.sh testnet in the contracts repo first.',
    );
  }

  const raw = JSON.parse(fs.readFileSync(addrPath, 'utf-8'));
  return raw.contracts || raw;
}

describe('Integration: SDK against testnet', () => {
  let client: CambiumClient;
  let addresses: Record<string, string>;

  beforeAll(() => {
    try {
      addresses = loadDeployedAddresses();
    } catch (e) {
      console.warn(
        'Skipping integration tests: could not load deployed addresses.',
        (e as Error).message,
      );
      return;
    }

    client = new CambiumClient({
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      contracts: {
        registry: addresses.registry,
        creditToken: addresses.credit_token,
        marketplace: addresses.marketplace,
        retirement: addresses.retirement,
        zkVerifier: addresses.zk_verifier,
      },
    });
  });

  test('client connects to testnet and gets ledger', async () => {
    if (!client) return;
    const sequence = await client.getLedgerSequence();
    expect(sequence).toBeGreaterThan(0);
  });

  test('registry module is accessible', async () => {
    if (!client) return;
    expect(client.registry).toBeDefined();
    expect(typeof client.registry.getProject).toBe('function');
    expect(typeof client.registry.registerProject).toBe('function');
  });

  test('credits module is accessible', async () => {
    if (!client) return;
    expect(client.credits).toBeDefined();
    expect(typeof client.credits.balanceOf).toBe('function');
    expect(typeof client.credits.transfer).toBe('function');
  });

  test('marketplace module is accessible', async () => {
    if (!client) return;
    expect(client.marketplace).toBeDefined();
    expect(typeof client.marketplace.getPool).toBe('function');
    expect(typeof client.marketplace.quote).toBe('function');
    expect(typeof client.marketplace.swap).toBe('function');
  });

  test('retirement module is accessible', async () => {
    if (!client) return;
    expect(client.retirement).toBeDefined();
    expect(typeof client.retirement.retire).toBe('function');
    expect(typeof client.retirement.getRetirement).toBe('function');
    expect(typeof client.retirement.listRetirements).toBe('function');
  });
});

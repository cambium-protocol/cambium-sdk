/**
 * Example: query the Cambium Protocol registry from Node.js
 *
 * Usage:
 *   npx ts-node examples/node-script/index.ts
 */

import { CambiumClient } from '@cambium-protocol/sdk';

const TESTNET_CONTRACTS = {
  registry: 'CBSLLVCIZBXKPHY73PN5DVHQKNGK4FAZBXMQLKZCJABABUX5OQGPHC43',
  creditToken: 'CBRBMYB6UTJEMMSBQQPYHAIO5QWJAT4EBPIFTEEB6MRY6ZZD5NS5KY36',
  marketplace: 'CAKXZQTCVDSGVF2BU5FY636O4TDCAX5UJCWYGQKDKMOA5QNBDKPXZ5S7',
  retirement: 'CDIHLUARSMSYU27QRKXBWVK5HXIJRUAQ3SYQYCK3MZ2UKMCRB275H3G5',
  zkVerifier: 'CDHHVK26VAEP4APPELQLJQLZUKMCDSXGBWT7K6V7L7T6CHHRDY2MUAD7',
};

async function main() {
  const client = new CambiumClient({
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    contracts: TESTNET_CONTRACTS,
  });

  const sequence = await client.getLedgerSequence();
  console.log('Current ledger sequence:', sequence);

  console.log('Registry module:', typeof client.registry.getProject);
  console.log('Credits module:', typeof client.credits.balanceOf);
  console.log('Marketplace module:', typeof client.marketplace.getPool);
  console.log('Retirement module:', typeof client.retirement.retire);

  console.log('SDK initialized successfully against testnet.');
}

main().catch(console.error);

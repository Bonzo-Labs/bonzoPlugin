# Bonzo Plugin for Hedera Agent Kit

Bonzo is an Aave v2–compatible lending protocol on Hedera. This plugin integrates Bonzo operations into Hedera Agent Kit, enabling agents to read market data and perform core actions like approve, deposit (supply), withdraw, borrow, and repay using the Hashgraph SDK.

Status

- Implemented: Market data, Approve, Deposit, Withdraw, Borrow, Repay

## Features

- Market data from Bonzo public API (tokens, APYs, liquidity, utilization)
- Aave v2–style actions via Bonzo LendingPool (Hashgraph transactions)
- AgentMode-aware execution: autonomous on-chain execution or return frozen tx bytes
- Address resolution from a single source of truth JSON

## Installation

```bash
cd bonzoPlugin
bun install
```

## Quick Start (CLI)

```bash
# Testnet by default
bun run src/index.ts

# Or specify network and operator
HEDERA_NETWORK=mainnet ACCOUNT_ID=0.0.x PRIVATE_KEY=0x... bun run src/index.ts
```

## Quick Start (with Hedera Agent Kit)

```ts
import { HederaLangchainToolkit, AgentMode } from "hedera-agent-kit";
import { bonzoPlugin } from "./src/plugin.ts";

const toolkit = new HederaLangchainToolkit({
  configuration: {
    context: { mode: AgentMode.AUTONOMOUS },
    plugins: [bonzoPlugin],
    tools: [],
  },
});

const tools = toolkit.getTools();
```

## Tools

1. Market Data Tool

- Method: `bonzo_market_data_tool`
- Description: Fetches supported tokens, supply/borrow APYs, liquidity, and utilization
- Parameters: none
- Returns: human-readable summary

2. Approve ERC20 Tool

- Method: `approve_erc20_tool`
- Description: Approves the Bonzo LendingPool to spend a given ERC20 underlying asset
- Params:
  - required.tokenSymbol: string (e.g. "USDC")
  - required.amount: number|string (human-readable)
  - optional.spender: string (defaults to LendingPool)
  - optional.useMax: boolean (approve max)

3. Deposit Tool

- Method: `bonzo_deposit_tool`
- Description: Supplies tokens to Bonzo
- Params:
  - required.tokenSymbol: string
  - required.amount: number|string (human-readable)
  - optional.onBehalfOf: Hedera account ID
  - optional.referralCode: number (default 0)

4. Withdraw Tool

- Method: `bonzo_withdraw_tool`
- Description: Withdraws supplied tokens from Bonzo
- Params:
  - required.tokenSymbol: string
  - required.amount: number|string (human-readable)
  - optional.to: Hedera account ID
  - optional.withdrawAll: boolean

5. Borrow Tool

- Method: `bonzo_borrow_tool`
- Description: Borrows tokens from Bonzo
- Params:
  - required.tokenSymbol: string
  - required.amount: number|string (human-readable)
  - required.rateMode: "stable" | "variable"
  - optional.onBehalfOf: Hedera account ID
  - optional.referralCode: number (default 0)

6. Repay Tool

- Method: `bonzo_repay_tool`
- Description: Repays borrowed tokens
- Params:
  - required.tokenSymbol: string
  - required.amount: number|string (human-readable)
  - required.rateMode: "stable" | "variable"
  - optional.onBehalfOf: Hedera account ID
  - optional.repayAll: boolean

## Address Resolution

- All contract addresses are sourced from `bonzo-contracts.json` at the plugin root.
- Networks: `hedera_mainnet` and `hedera_testnet` sections.
- Per-token addresses: `token` (underlying ERC20), `aToken`, `stableDebt`, `variableDebt`.
- Core contracts: `LendingPool`, `LendingPoolAddressesProvider`, oracles, helpers.
- The plugin resolves the current network via the Hedera client and selects the corresponding address. Both Testnet and Mainnet are supported.

## Network Selection

- Use `HEDERA_NETWORK` env var to select network: `mainnet` or `testnet` (default: `testnet`).

```bash
HEDERA_NETWORK=mainnet ACCOUNT_ID=0.0.x PRIVATE_KEY=0x... bun run src/index.ts
```

## Transaction Execution

- ABI encoding via `@ethersproject/abi` Interfaces (Aave v2 signatures)
- Transactions executed/frozen via Hashgraph SDK `ContractExecuteTransaction`
- AgentMode handling:
  - `AUTONOMOUS`: submit and return receipt/transactionId
  - `RETURN_BYTES`: freeze, return hex bytes for external signing

## Usage Examples

Approve + Deposit

```ts
await approveErc20.execute(client, context, {
  required: { tokenSymbol: "USDC", amount: "1000" },
});

await deposit.execute(client, context, {
  required: { tokenSymbol: "USDC", amount: "1000" },
  optional: { referralCode: 0 },
});
```

Borrow + Repay (variable)

```ts
await borrow.execute(client, context, {
  required: { tokenSymbol: "USDC", amount: "50", rateMode: "variable" },
});

await repay.execute(client, context, {
  required: { tokenSymbol: "USDC", amount: "50", rateMode: "variable" },
});
```

Withdraw

```ts
await withdraw.execute(client, context, {
  required: { tokenSymbol: "USDC", amount: "100" },
});
```

## Development

Repo Structure

- `src/plugin.ts` – plugin definition and tool export
- `src/index.ts` – example CLI wiring with Hedera Agent Kit
- `src/client.ts` – helper to construct a LangChain agent using this plugin
- `src/bonzo/bonzo-market-service.ts` – market API service
- `src/bonzo/utils.ts` – shared helpers (amount conversion, address resolution, response helpers)
- `src/bonzo/bonzo.zod.ts` – Zod schemas for tools
- `src/tools/*.ts` – individual tool implementations (approve, deposit, withdraw, borrow, repay)
- `bonzo-contracts.json` – master contract addresses by network

Commands

```bash
bun run src/index.ts        # run local example agent
bun --watch src/index.ts    # dev watch mode
bun test                    # once tests are added
```

Environment

- `OPENAI_API_KEY` (required for the CLI agent)
- `ACCOUNT_ID`, `PRIVATE_KEY` (or `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`) for autonomous mode
- `HEDERA_NETWORK` = `testnet` | `mainnet` (default `testnet`)
- Optional per-tool overrides: `BONZO_GAS_*`, `BONZO_MAX_FEE_HBAR_*`

Security & Configuration

- Do not commit secrets or `.env` files. Bun loads `.env` locally.
- Choose client network via `Client.forTestnet()`/`Client.forMainnet()` (see `src/index.ts`).

## Notes & Caveats

- Some assets may require token association on Hedera prior to actions
- Repay and deposit require underlying token approvals
- For HBAR-native flows, wrapping/unwrapping may be needed via gateway contracts
- Testnet has fewer markets than mainnet; tools will error with available symbols if a token isn’t configured on the selected network

## Related Docs

- Aave v2 Developer Docs (ABIs and function signatures)
- Hedera Agent Kit – Plugins & Tools documentation
- Bonzo public market API

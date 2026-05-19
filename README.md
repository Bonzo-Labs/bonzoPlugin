# Hedera Agent Kit - Bonzo Plugin

A plugin for [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit) (v4) that provides seamless integration with [Bonzo Finance](https://bonzo.finance), an Aave v2–compatible lending protocol on the Hedera network.

---

## ⚠️ **IMPORTANT DISCLAIMER**

**Bonzo Finance Labs is NOT responsible for any loss incurred by using this SDK plugin. This software is provided "as is" without warranty of any kind.**

**⚠️ USE AT YOUR OWN RISK ⚠️**

- **Do Your Own Research (DYOR)** before using this plugin
- **Always test on testnet first** before using on mainnet
- This plugin interacts with smart contracts and financial protocols
- Cryptocurrency transactions are irreversible
- Always verify contract addresses and parameters before executing transactions
- The authors and maintainers assume no liability for any losses, damages, or consequences arising from the use of this software

By using this plugin, you acknowledge that you understand the risks and agree to use it at your own discretion.

---

## Overview

The Bonzo plugin enables AI agents to interact with the Bonzo lending protocol, providing functionality for:

- **Market Data**: Fetch real-time market information (tokens, APYs, liquidity, utilization)
- **Approve**: Approve ERC20 tokens for Bonzo operations
- **Deposit**: Supply tokens to the lending pool
- **Withdraw**: Withdraw supplied tokens from the lending pool
- **Borrow**: Borrow tokens from the lending pool (stable or variable rate)
- **Repay**: Repay borrowed tokens

All transactional tools (approve, deposit, withdraw, borrow, repay) extend `BaseTool`, so they fully support v4 hooks and policies (e.g. `HcsAuditTrailHook`, `MaxRecipientsPolicy`, `RejectToolPolicy`). The market data tool is a read-only query and uses the simpler functional `Tool` interface.

## Installation

```bash
bun add @bonzofinancelabs/hak-bonzo-plugin \
  @hashgraph/hedera-agent-kit \
  @hashgraph/hedera-agent-kit-langchain \
  @hiero-ledger/sdk \
  @langchain/openai langchain
```

The agent kit core, the LangChain toolkit, and the Hiero SDK are declared as peer dependencies and must be installed alongside the plugin. Pick whichever LLM provider you prefer (`@langchain/openai`, `@langchain/anthropic`, etc.).

## Quick Start

```typescript
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit-langchain";
import { Client, PrivateKey } from "@hiero-ledger/sdk";
import { bonzoPlugin } from "@bonzofinancelabs/hak-bonzo-plugin";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

const client = Client.forTestnet().setOperator(
  process.env.ACCOUNT_ID!,
  PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY!),
);

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: {
    plugins: [bonzoPlugin],
    context: { mode: AgentMode.AUTONOMOUS },
  },
});

const agent = createAgent({
  model: new ChatOpenAI({ model: "gpt-4.1" }),
  tools: toolkit.getTools(),
  systemPrompt: "You are a helpful assistant with access to Bonzo lending tools.",
});

const response = await agent.invoke({
  messages: [{ role: "user", content: "What are the current APYs on Bonzo?" }],
});
```

> 💡 To combine Bonzo tools with the built-in Hedera tools, also pass `allCorePlugins` from `@hashgraph/hedera-agent-kit/plugins`:
> ```typescript
> import { allCorePlugins } from "@hashgraph/hedera-agent-kit/plugins";
> // plugins: [bonzoPlugin, ...allCorePlugins]
> ```

## CLI Example

A reference CLI is included in this repository:

```bash
git clone https://github.com/Bonzo-Labs/bonzoPlugin
cd bonzoPlugin
bun install

# Testnet (default)
bun run src/index.ts

# Mainnet with operator
HEDERA_NETWORK=mainnet ACCOUNT_ID=0.0.x PRIVATE_KEY=0x... bun run src/index.ts
```

## Tools

> **Parameter shape**: each transactional tool exposes its inputs as two nested objects, `required` and `optional`. Example payload for `bonzo_deposit_tool`:
> ```json
> {
>   "required": { "tokenSymbol": "USDC", "amount": 1000 },
>   "optional": { "onBehalfOf": "0.0.12345", "referralCode": 0 }
> }
> ```
> The agent picks this up automatically from the Zod schemas; the parameter lists below are grouped to match that shape.

### 1. Market Data Tool

Fetches real-time market data including supported tokens, supply/borrow APYs, liquidity, and utilization rates.

- **Method**: `bonzo_market_data_tool`
- **Parameters**: None
- **Returns**: Human-readable summary of all Bonzo markets

**Example usage**: "What are the current APYs for tokens on Bonzo?"

---

### 2. Approve ERC20 Tool

Approves the Bonzo LendingPool (or a custom spender) to spend a given ERC20 token.

- **Method**: `approve_erc20_tool`

**Required Parameters:**

- `tokenSymbol`: Token symbol (e.g., `USDC`, `WHBAR`, `HBARX`, `SAUCE`)
- `amount`: Amount to approve (human-readable number or string)

**Optional Parameters:**

- `spender`: EVM address of spender (defaults to LendingPool address)
- `useMax`: If `true`, approves maximum amount (`type(uint256).max`)

**Example usage**: "Approve 1000 USDC for Bonzo"

> 📋 **Available token symbols** (per `bonzo-contracts.json`): `USDC`, `WHBAR`, `WHBARE`, `HBARX`, `SAUCE`, `XSAUCE`, `KARATE`, `GRELF`, `KBL`, `BONZO`, `DOVU`, `HST`, `PACK`, `STEAM`. Not every symbol is configured on both networks — call `bonzo_market_data_tool` to see what is currently active.

---

### 3. Deposit Tool

Supplies tokens to the Bonzo lending pool. Users earn supply APY on deposited tokens.

- **Method**: `bonzo_deposit_tool`

**Required Parameters:**

- `tokenSymbol`: Token symbol to deposit
- `amount`: Amount to deposit (human-readable number or string)

**Optional Parameters:**

- `onBehalfOf`: Hedera account ID to deposit on behalf of (defaults to caller's account)
- `referralCode`: Referral code (default: 0)

> 💡 **Note**: You must approve the token before depositing. Use `approve_erc20_tool` first.

**Example usage**: "Deposit 1000 USDC to Bonzo"

---

### 4. Withdraw Tool

Withdraws previously supplied tokens from the Bonzo lending pool.

- **Method**: `bonzo_withdraw_tool`

**Required Parameters:**

- `tokenSymbol`: Token symbol to withdraw
- `amount`: Amount to withdraw (human-readable number or string)

**Optional Parameters:**

- `to`: Hedera account ID to withdraw to (defaults to caller's account)
- `withdrawAll`: If `true`, withdraws all available balance

**Example usage**: "Withdraw 500 USDC from Bonzo"

---

### 5. Borrow Tool

Borrows tokens from the Bonzo lending pool at either stable or variable interest rates.

- **Method**: `bonzo_borrow_tool`

**Required Parameters:**

- `tokenSymbol`: Token symbol to borrow
- `amount`: Amount to borrow (human-readable number or string)
- `rateMode`: Interest rate mode - `"stable"` or `"variable"`

**Optional Parameters:**

- `onBehalfOf`: Hedera account ID to borrow on behalf of (defaults to caller's account)
- `referralCode`: Referral code (default: 0)

> 💡 **Note**: You must have sufficient collateral deposited before borrowing.

**Example usage**: "Borrow 100 USDC at variable rate from Bonzo"

---

### 6. Repay Tool

Repays borrowed tokens to the Bonzo lending pool.

- **Method**: `bonzo_repay_tool`

**Required Parameters:**

- `tokenSymbol`: Token symbol to repay
- `amount`: Amount to repay (human-readable number or string)
- `rateMode`: Interest rate mode - `"stable"` or `"variable"` (must match the original borrow)

**Optional Parameters:**

- `onBehalfOf`: Hedera account ID to repay on behalf of (defaults to caller's account)
- `repayAll`: If `true`, repays the entire borrowed amount

> 💡 **Note**: You must approve the underlying token before repaying. Use `approve_erc20_tool` first.

**Example usage**: "Repay 50 USDC variable rate debt on Bonzo"

## Tool Names Reference

For programmatic access to tool names:

```typescript
import { bonzoPluginToolNames } from "@bonzofinancelabs/hak-bonzo-plugin";

bonzoPluginToolNames.BONZO_MARKET_DATA_TOOL;
bonzoPluginToolNames.APPROVE_ERC20_TOOL;
bonzoPluginToolNames.BONZO_DEPOSIT_TOOL;
bonzoPluginToolNames.BONZO_WITHDRAW_TOOL;
bonzoPluginToolNames.BONZO_BORROW_TOOL;
bonzoPluginToolNames.BONZO_REPAY_TOOL;
```

## Network & Address Resolution

The plugin works on both Hedera Testnet and Mainnet. Network selection is driven by the Hashgraph SDK client:

```typescript
const client = Client.forTestnet();   // testnet
const client = Client.forMainnet();   // mainnet
```

All contract addresses are sourced from `bonzo-contracts.json` shipped with the plugin (`hedera_mainnet` / `hedera_testnet` sections), and are resolved automatically based on `client.ledgerId`. Tools return clear errors with the available symbols if a token is not configured on the selected network.

## AgentMode Support

Both execution modes are supported:

- **`AUTONOMOUS`**: transactions are executed on-chain and return receipt / transactionId
- **`RETURN_BYTES`**: transactions are frozen and returned as bytes for external signing

Mode is controlled via `configuration.context.mode`.

## Environment Variables (CLI)

**Required for CLI:**

- `OPENAI_API_KEY`: OpenAI API key for the agent LLM

**Required for Autonomous Mode:**

- `ACCOUNT_ID` or `HEDERA_ACCOUNT_ID`: Hedera account ID
- `PRIVATE_KEY` or `HEDERA_PRIVATE_KEY`: ECDSA private key (`0x...` format)

**Optional:**

- `HEDERA_NETWORK`: `testnet` | `mainnet` (default: `testnet`)
- `HAK_MODE` or `AGENT_MODE`: `autonomous` | `return_bytes` (default: `return_bytes`)
- `BONZO_GAS_LIGHT`: gas override for light operations (default: `6_000_000`)
- `BONZO_GAS_HEAVY`: gas override for heavy operations (default: `10_000_000`)
- `BONZO_MAX_FEE_HBAR`: max transaction fee in HBAR (default: `2`)

## Important Notes

### Token Association

Some assets may require token association on Hedera before executing actions. Ensure your account has associated the token or has auto-association enabled.

### Approvals

- **Deposit** and **Repay** require approval of the underlying ERC20 token first via `approve_erc20_tool`.

### HBAR Handling

For HBAR-native flows, wrapping/unwrapping may be required via gateway contracts depending on Bonzo's implementation.

### Transaction Execution

ABI encoding uses `@ethersproject/abi` against Aave v2 function signatures. Transactions are built with `ContractExecuteTransaction` from the Hiero SDK.

## Repository Structure

```
bonzoPlugin/
├── src/
│   ├── plugin.ts                    # Plugin definition and exports
│   ├── index.ts                     # CLI entry point
│   ├── client.ts                    # LangChain agent factory
│   ├── tools.ts                     # Market data tool
│   ├── bonzo/
│   │   ├── bonzo-market-service.ts  # Market API service
│   │   ├── bonzo.zod.ts             # Zod parameter schemas
│   │   └── utils.ts                 # Shared utilities
│   └── tools/
│       ├── approve-erc20.ts         # Approve tool
│       ├── deposit.ts               # Deposit tool
│       ├── withdraw.ts              # Withdraw tool
│       ├── borrow.ts                # Borrow tool
│       └── repay.ts                 # Repay tool
├── bonzo-contracts.json             # Contract addresses by network
└── package.json
```

## Related Documentation

- [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit) — plugin and tool development guide (v4)
- [Aave v2 Developer Docs](https://docs.aave.com/developers/) — ABI references and function signatures
- [Bonzo Finance](https://bonzo.finance) — protocol website and documentation

## License

MIT

---

Made with ❤️ by [Bonzo Finance Labs](https://bonzo.finance/)

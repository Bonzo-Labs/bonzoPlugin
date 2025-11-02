# Hedera Agent Kit - Bonzo Plugin

A plugin for [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit) that provides seamless integration with [Bonzo Finance](https://bonzo.finance), an Aave v2–compatible lending protocol on the Hedera network.

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

The Bonzo plugin enables AI agents to interact with the Bonzo lending protocol, providing comprehensive functionality for:

- **Market Data**: Fetch real-time market information (tokens, APYs, liquidity, utilization)
- **Approve**: Approve ERC20 tokens for Bonzo operations
- **Deposit**: Supply tokens to the lending pool
- **Withdraw**: Withdraw supplied tokens from the lending pool
- **Borrow**: Borrow tokens from the lending pool (stable or variable rate)
- **Repay**: Repay borrowed tokens

## Installation

```bash
npm install @bonzofinancelabs/hak-bonzo-plugin
```

## Quick Start

```typescript
import { HederaLangchainToolkit, AgentMode } from "hedera-agent-kit";
import { bonzoPlugin } from "@bonzofinancelabs/hak-bonzo-plugin";
import { Client } from "@hashgraph/sdk";

const client = Client.forTestnet(); // or Client.forMainnet()

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: {
    context: { mode: AgentMode.AUTONOMOUS },
    plugins: [bonzoPlugin],
    tools: [],
  },
});

const tools = toolkit.getTools();
```

### CLI Usage

If you want to run the CLI example included in this repository:

```bash
# Clone the repository
git clone https://github.com/Bonzo-Labs/bonzoPlugin
cd bonzoPlugin

# Install dependencies
bun install

# Run CLI (testnet by default)
bun run src/index.ts

# Or specify network and operator
HEDERA_NETWORK=mainnet ACCOUNT_ID=0.0.x PRIVATE_KEY=0x... bun run src/index.ts

# Or use npm scripts (if npm is installed)
npm run start
```

## Tools

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

- `tokenSymbol`: Token symbol (e.g., "USDC", "HBAR")
- `amount`: Amount to approve (human-readable number or string)

**Optional Parameters:**

- `spender`: EVM address of spender (defaults to LendingPool address)
- `useMax`: If `true`, approves maximum amount (`type(uint256).max`)

**Example usage**: "Approve 1000 USDC for Bonzo"

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

## Address Resolution

All contract addresses are sourced from `bonzo-contracts.json` included with the plugin. The plugin automatically resolves addresses based on the network:

- **Networks**: `hedera_mainnet` and `hedera_testnet` sections
- **Per-token addresses**: `token` (underlying ERC20), `aToken`, `stableDebt`, `variableDebt`
- **Core contracts**: `LendingPool`, `LendingPoolAddressesProvider`, oracles, helpers
- **Network detection**: Automatically determined via the Hedera client (`client.ledgerId`)

## Network Selection

The plugin supports both Hedera Testnet and Mainnet. The network is determined by the Hashgraph SDK client configuration:

```typescript
// For testnet
const client = Client.forTestnet();

// For mainnet
const client = Client.forMainnet();
```

When using the CLI, set the `HEDERA_NETWORK` environment variable:

```bash
HEDERA_NETWORK=mainnet ACCOUNT_ID=0.0.x PRIVATE_KEY=0x... npm run start
```

## AgentMode Support

The plugin supports both agent execution modes:

- **`AUTONOMOUS`**: Transactions are executed on-chain and return receipt/transactionId
- **`RETURN_BYTES`**: Transactions are frozen and return hex-encoded bytes for external signing

Configure via the Hedera Agent Kit context:

```typescript
import { AgentMode } from "hedera-agent-kit";

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: {
    context: { mode: AgentMode.AUTONOMOUS }, // or AgentMode.RETURN_BYTES
    plugins: [bonzoPlugin],
  },
});
```

## Transaction Execution

- **ABI Encoding**: Uses `@ethersproject/abi` Interfaces (Aave v2 function signatures)
- **Transaction Building**: Hashgraph SDK `ContractExecuteTransaction`
- **Gas & Fees**: Configured with sensible defaults (customizable per tool)

## Usage Examples

### Approve and Deposit

```typescript
import { bonzoPlugin, bonzoPluginToolNames } from "@bonzofinancelabs/hak-bonzo-plugin";

// In your agent context, the tools are automatically available
// The agent can call:
// 1. "Approve 1000 USDC for Bonzo"
// 2. "Deposit 1000 USDC to Bonzo"
```

### Borrow and Repay

```typescript
// Agent can execute:
// 1. "Borrow 100 USDC at variable rate from Bonzo"
// 2. "Repay 50 USDC variable rate debt on Bonzo"
```

### Withdraw

```typescript
// Agent can execute:
// "Withdraw 500 USDC from Bonzo"
```

### Complete Workflow Example

```typescript
import { HederaLangchainToolkit, AgentMode } from "hedera-agent-kit";
import { bonzoPlugin } from "@bonzofinancelabs/hak-bonzo-plugin";
import { Client, PrivateKey } from "@hashgraph/sdk";

const client = Client.forTestnet();
client.setOperator("0.0.xxxxx", PrivateKey.fromStringECDSA("0x..."));

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: {
    context: { mode: AgentMode.AUTONOMOUS },
    plugins: [bonzoPlugin],
  },
});

const tools = toolkit.getTools();
// Tools are now available for the agent to use
```

## Development

### Repository Structure

```
bonzoPlugin/
├── src/
│   ├── plugin.ts                    # Plugin definition and exports
│   ├── index.ts                     # CLI entry point
│   ├── client.ts                    # LangChain agent factory
│   ├── tools.ts                     # Market data tool
│   ├── bonzo/
│   │   ├── bonzo-market-service.ts  # Market API service
│   │   ├── bonzo.zod.ts            # Zod parameter schemas
│   │   └── utils.ts                # Shared utilities
│   └── tools/
│       ├── approve-erc20.ts        # Approve tool
│       ├── deposit.ts              # Deposit tool
│       ├── withdraw.ts             # Withdraw tool
│       ├── borrow.ts               # Borrow tool
│       └── repay.ts                # Repay tool
├── bonzo-contracts.json            # Contract addresses by network
└── package.json
```

### Environment Variables

**Required for CLI:**

- `OPENAI_API_KEY`: OpenAI API key for the agent LLM

**Required for Autonomous Mode:**

- `ACCOUNT_ID` or `HEDERA_ACCOUNT_ID`: Hedera account ID
- `PRIVATE_KEY` or `HEDERA_PRIVATE_KEY`: ECDSA private key (0x... format)

**Optional:**

- `HEDERA_NETWORK`: Network selection (`testnet` | `mainnet`, default: `testnet`)
- `HAK_MODE` or `AGENT_MODE`: Agent mode (`autonomous` | `return_bytes`, default: `return_bytes`)

### Security Notes

- Never commit secrets or `.env` files
- Use environment variables or secure credential management
- Testnet is recommended for development and testing

## Important Notes

### Token Association

Some assets may require token association on Hedera before executing actions. Ensure your Hedera account has associated the token or has auto-association enabled.

### Approvals Required

- **Deposit**: Requires approval of the underlying token before depositing
- **Repay**: Requires approval of the underlying token before repaying

### Network Differences

- Testnet has fewer markets than mainnet
- Tools will provide clear error messages with available symbols if a token isn't configured on the selected network

### HBAR Handling

For HBAR-native flows, wrapping/unwrapping may be needed via gateway contracts depending on Bonzo's implementation.

## Tool Names Reference

For programmatic access to tool names:

```typescript
import { bonzoPluginToolNames } from "@bonzofinancelabs/hak-bonzo-plugin";

console.log(bonzoPluginToolNames.BONZO_MARKET_DATA_TOOL);
console.log(bonzoPluginToolNames.APPROVE_ERC20_TOOL);
console.log(bonzoPluginToolNames.BONZO_DEPOSIT_TOOL);
console.log(bonzoPluginToolNames.BONZO_WITHDRAW_TOOL);
console.log(bonzoPluginToolNames.BONZO_BORROW_TOOL);
console.log(bonzoPluginToolNames.BONZO_REPAY_TOOL);
```

## Related Documentation

- [Aave v2 Developer Docs](https://docs.aave.com/developers/) - ABI references and function signatures
- [Hedera Agent Kit Documentation](https://github.com/hashgraph/hedera-agent-kit) - Plugin and tool development guide
- [Bonzo Finance](https://bonzo.finance) - Protocol website and documentation

## License

MIT

---

Made with ❤️ by [Bonzo Finance Labs](https://bonzo.finance/)

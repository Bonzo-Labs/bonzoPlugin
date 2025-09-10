## Relevant Files

- `src/bonzo/bonzo-market-service.ts` - Fetches and normalises market data from Bonzo Finance API.
- `src/bonzo/bonzo-market-service.test.ts` - Unit tests for the market service.
- `src/plugin.ts` - Plugin wrapper that registers the Bonzo Strategy Tool.
- `src/tools.ts` - Implements the Tool interface, orchestrates services, and returns chat-friendly output.

## Tasks

- [x] 2.0 Implement Bonzo market data service
  - [x] 2.1 Design TypeScript interface for Bonzo reserve/market data
  - [x] 2.2 Implement `fetchReserves()` that calls `https://mainnet-data.bonzo.finance/market` using Bun's global `fetch`
  - [x] 2.3 Parse and normalise response to internal model
  - [x] 2.4 Filter out inactive, frozen, or borrowing-disabled reserves
  - [x] 2.5 Sort reserves by supply APY (descending) before returning

- [x] 5.0 Create Hedera Agent Kit Tool & Plugin integration
  - [x] 5.1 Define Zod parameter schema `{ accountId: string }`
  - [x] 5.2 Build `createStrategyPrompt(context)` that describes tool usage & parameters
  - [x] 5.3 Implement strategy engine function: fetch reserves, fetch balances, rank pools, simulate 30-day returns, generate plain-text summary
  - [x] 5.4 Add Tool implementation in `src/tools.ts` (export constant `BONZO_STRATEGY_TOOL`)
  - [x] 5.5 Register tool inside plugin in `src/plugin.ts` and export `{ bonzoStrategyPlugin, BONZO_STRATEGY_TOOL }`
  - [x] 5.6 Provide basic error handling (API failure, invalid account, zero balances)
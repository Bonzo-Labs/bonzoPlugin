# Bonzo Strategy Recommendation Tool & Hedera Agent Kit Plugin

## Introduction / Overview
The CLI chatbot needs **a Hedera Agent Kit Tool** (exposing the `Tool` interface) **bundled inside a Plugin** (exposing the `Plugin` interface) that fetches live market data from **Bonzo Finance** (an Aave-fork on Hedera) and produces a personalised supply/borrow strategy for a semi-experienced DeFi user. The tool should surface high-yield pools, analyse the user’s on-chain token balances (via **Hedera Agent Kit**), simulate projected net APY and risk, and output a concise plain-text strategy summary.

## Goals
1. Enumerate all active Bonzo pools with their current supply and variable borrow APYs.
2. Retrieve the user’s HBAR and HTS token balances for a given `accountId` using Hedera Agent Kit.
3. Generate an optimal supply/borrow strategy tailored to the user’s balances and a default medium risk appetite.
4. Simulate projected returns and health factor over a 30-day horizon.
5. Deliver the strategy summary in plain text suitable for the CLI within ≤ 3 seconds.

## User Stories
1. **As a semi-experienced DeFi user,** I want to view a ranked list of Bonzo pools so that I can quickly choose the highest-yield assets.
2. **As a user,** I want the tool to suggest supply/borrow actions based on my existing wallet balances so that I can maximise yield without extensive research.
3. **As a user,** I want to understand projected APY and liquidation risk before acting so that I can make an informed decision.

## Functional Requirements
1. The tool **must** call `https://mainnet-data.bonzo.finance/market` and parse the JSON, extracting for each reserve: symbol, supply APY, variable borrow APY, LTV, utilisation, and liquidity.
2. The tool **must** query Hedera Agent Kit for the user’s token balances given an `accountId`.
3. The tool **must** rank pools by supply APY (descending) and filter out reserves that are inactive, frozen, or have borrowing disabled (if recommending borrow positions).
4. The tool **must** propose a strategy consisting of:
   a. Asset(s) to supply  
   b. Asset(s) to borrow (optional)  
   c. Expected net APY  
   d. Estimated health factor
5. The tool **must** simulate projected returns over 30 days using current APYs (simple-interest approximation).
6. The tool **must** return a plain-text summary (≤ 500 chars) including: "Data as of <TIMESTAMP>", "Top Pools", "Recommended Strategy", "Projected APY", and "Risk".
7. The tool **must** gracefully handle errors and return clear messages when:
   a. Bonzo API is unreachable or returns 5xx.  
   b. The provided account has zero balance in supported tokens.  
   c. The `accountId` is invalid.
8. The tool **must** expose TypeScript types for input (`{ accountId: string }`) and output (`{ summary: string, diagnostics?: object }`).

## Non-Goals (Out of Scope)
1. Executing any on-chain transactions (supplying or borrowing).
2. Persisting user data or strategies.
3. Supporting networks other than Hedera mainnet.

## Design Considerations
- Output format is plain text; avoid JSON unless used internally.
- Include an ISO timestamp in the summary to indicate data freshness.
- If execution time exceeds 3 seconds, include a note suggesting the user retry later.

## Technical Considerations
- Implement as a **`Tool`** in TypeScript following Hedera Agent Kit’s schema, and wrap it in a **`Plugin`** that registers the tool via its `tools(context)` function.
- Export the tool name as a constant string so other plugins/actions can reference it (see `CREATE_FUNGIBLE_TOKEN_TOOL` in the example below).
- Include example usage patterns:

```ts
import type { Context } from '@/shared/configuration';
import type { Tool } from '@/shared/tools';
import { Client } from '@hashgraph/sdk';

const examplePrompt = (context: Context = {}) => `This tool does X…`;

const EXAMPLE_TOOL = 'example_tool';

const exampleTool = (context: Context): Tool => ({
  method: EXAMPLE_TOOL,
  name: 'Example Tool',
  description: examplePrompt(context),
  parameters: z.object({ /* … */ }),
  execute: async (client: Client, ctx: Context, params) => { /* … */ },
});

export default exampleTool;
```

- Provide a **`BonzoStrategyPlugin`** similar to `coreHTSPlugin` that returns the tool in its `tools` array.
- Use Bun’s global `fetch` for the Bonzo API request.
- Use **Hedera Agent Kit** (or `@hashgraph/sdk`) to fetch balances.
- Handle numeric precision with `BigInt` or a decimal library to avoid rounding errors.
- Provide unit tests with **Bun test** using mocked API responses.

## Success Metrics
1. ≥ 95 % of strategy generations complete in ≤ 3 seconds on a consumer laptop.
2. Unit-test coverage ≥ 80 % with all tests passing.
3. For at least three test accounts, the recommended strategy’s net APY ranks in the top 25 % of all supply-only options.

## Open Questions
1. Should the tool allow users to specify a custom risk appetite (low/medium/high)?
2. Should stable borrow APY be considered once Bonzo enables stable borrowing for additional assets?
3. What minimum available liquidity threshold should be enforced to avoid slippage?
4. How should "dust" balances (very small amounts) be handled in simulations? 
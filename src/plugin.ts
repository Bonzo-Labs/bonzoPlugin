import type { Plugin, Context } from "hedera-agent-kit";
import { bonzoMarketDataTool, BONZO_MARKET_DATA_TOOL } from "./tools.ts";
import approveErc20, { APPROVE_ERC20_TOOL } from "./tools/approve-erc20.ts";
import deposit, { BONZO_DEPOSIT_TOOL } from "./tools/deposit.ts";
import withdraw, { BONZO_WITHDRAW_TOOL } from "./tools/withdraw.ts";
import borrow, { BONZO_BORROW_TOOL } from "./tools/borrow.ts";
import repay, { BONZO_REPAY_TOOL } from "./tools/repay.ts";

// Export the plugin
export const bonzoPlugin: Plugin = {
  name: "bonzo-plugin",
  version: "1.0.0",
  description: "Bonzo Finance plugin: market data, approve, deposit, withdraw, borrow, repay",
  tools: (context: Context) => [
    bonzoMarketDataTool(context),
    approveErc20(context),
    deposit(context),
    withdraw(context),
    borrow(context),
    repay(context),
  ],
};

// Export tool names for external reference
export const bonzoPluginToolNames = {
  BONZO_MARKET_DATA_TOOL,
  APPROVE_ERC20_TOOL,
  BONZO_DEPOSIT_TOOL,
  BONZO_WITHDRAW_TOOL,
  BONZO_BORROW_TOOL,
  BONZO_REPAY_TOOL,
} as const;

export default { bonzoPlugin, bonzoPluginToolNames };

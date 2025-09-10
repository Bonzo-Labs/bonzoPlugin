import type { Plugin, Context } from "hedera-agent-kit";
import { bonzoMarketDataTool, BONZO_MARKET_DATA_TOOL } from "./tools.ts";

// Export the plugin
export const bonzoPlugin: Plugin = {
  name: "bonzo-plugin",
  version: "1.0.0",
  description: "A plugin for the Bonzo Finance protocol that provides market data and rates",
  tools: (context: Context) => [bonzoMarketDataTool(context)],
};

// Export tool names for external reference
export const bonzoPluginToolNames = {
  BONZO_MARKET_DATA_TOOL,
} as const;

export default { bonzoPlugin, bonzoPluginToolNames };

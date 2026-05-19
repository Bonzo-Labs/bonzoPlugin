import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { allCorePlugins } from "@hashgraph/hedera-agent-kit/plugins";
import {
  HederaLangchainToolkit,
  ResponseParserService,
} from "@hashgraph/hedera-agent-kit-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import type { Client } from "@hiero-ledger/sdk";
import { bonzoPlugin } from "./plugin.ts";

type CreateClientArgs = {
  client: Client;
  mode?: AgentMode;
  pluginsOverride?: any[];
  toolsAllowlist?: string[];
};

export const createBonzoAgentClient = async ({
  client,
  mode = AgentMode.RETURN_BYTES,
  pluginsOverride,
  toolsAllowlist = [],
}: CreateClientArgs) => {
  const llm = new ChatOpenAI({ model: "gpt-4.1" });

  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: pluginsOverride || [bonzoPlugin, ...allCorePlugins],
      tools: toolsAllowlist,
      context: {
        mode,
        accountId: process.env.ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID,
      },
    },
  });

  const tools = toolkit.getTools();

  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt: "You are a helpful assistant",
    checkpointer: new MemorySaver(),
  });

  const responseParser = new ResponseParserService(tools);

  return { toolkit, tools, agent, responseParser };
};

export default { createBonzoAgentClient };

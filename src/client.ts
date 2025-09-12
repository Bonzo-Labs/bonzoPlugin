import { HederaLangchainToolkit, AgentMode, coreAccountPlugin, coreQueriesPlugin } from "hedera-agent-kit";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { BufferMemory } from "langchain/memory";
import type { Client } from "@hashgraph/sdk";
import { bonzoPlugin } from "./plugin.ts";
// core plugins are imported above

type CreateClientArgs = {
  client: Client;
  mode?: AgentMode;
  pluginsOverride?: any[];
  toolsAllowlist?: string[];
};

export const createBonzoAgentClient = async ({ client, mode = AgentMode.RETURN_BYTES, pluginsOverride, toolsAllowlist = [] }: CreateClientArgs) => {
  const llm = new ChatOpenAI({ model: "gpt-4.1" });

  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: pluginsOverride || [bonzoPlugin, coreQueriesPlugin, coreAccountPlugin],
      tools: toolsAllowlist,
      context: {
        mode,
        // Accept both ACCOUNT_ID and HEDERA_ACCOUNT_ID
        accountId: process.env.ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID,
      },
    },
  });

  const tools = toolkit.getTools();

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant"],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = createToolCallingAgent({ llm, tools, prompt });

  const memory = new BufferMemory({
    memoryKey: "chat_history",
    inputKey: "input",
    outputKey: "output",
    returnMessages: true,
  });

  const agentExecutor = new AgentExecutor({ agent, tools, memory, returnIntermediateSteps: false });

  return { toolkit, tools, agent, agentExecutor };
};

export default { createBonzoAgentClient };

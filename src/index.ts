import "dotenv/config";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { Client, PrivateKey } from "@hiero-ledger/sdk";
import prompts from "prompts";
import { createBonzoAgentClient } from "./client.ts";

async function bootstrap(): Promise<void> {
  // Hedera client setup — choose network via env HEDERA_NETWORK ("mainnet"|"testnet")
  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  // Support both ACCOUNT_ID/PRIVATE_KEY and HEDERA_ACCOUNT_ID/HEDERA_PRIVATE_KEY
  const accountId = process.env.ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY;
  if (accountId && privateKey) {
    try {
      client.setOperator(accountId, PrivateKey.fromStringECDSA(privateKey));
    } catch (e) {
      console.warn(
        "Failed to set operator from env. Ensure ECDSA private key format (0x...) and valid account id.",
        e,
      );
    }
  } else {
    console.warn(
      "No operator configured. Set ACCOUNT_ID/PRIVATE_KEY or HEDERA_ACCOUNT_ID/HEDERA_PRIVATE_KEY in your .env",
    );
  }
  // Mode selection via env (HAK_MODE or AGENT_MODE): "autonomous" or "return_bytes"
  const modeEnv = (process.env.HAK_MODE || process.env.AGENT_MODE || "return_bytes").toLowerCase();
  const mode = ["autonomous", "auto"].includes(modeEnv)
    ? AgentMode.AUTONOMOUS
    : AgentMode.RETURN_BYTES;

  const { agent, responseParser } = await createBonzoAgentClient({
    client,
    mode,
  });

  console.log('Hedera Agent CLI Chatbot — type "exit" to quit');
  console.log(`Mode: ${mode === AgentMode.AUTONOMOUS ? "AUTONOMOUS" : "RETURN_BYTES"}`);

  while (true) {
    const { userInput } = await prompts({
      type: "text",
      name: "userInput",
      message: "You",
    });

    // Handle early termination
    if (!userInput || ["exit", "quit"].includes(userInput.trim().toLowerCase())) {
      console.log("Goodbye!");
      break;
    }

    try {
      const response = await agent.invoke(
        { messages: [{ role: "user", content: userInput }] },
        { configurable: { thread_id: "1" } },
      );

      const lastMessage = response.messages[response.messages.length - 1];
      const aiText = lastMessage?.content ?? JSON.stringify(response);

      const parsedToolData = responseParser.parseNewToolMessages(response);
      const toolCall = parsedToolData[0];

      if (!toolCall) {
        console.log(`AI: ${aiText}`);
      } else {
        console.log(`\nAI: ${aiText}`);
        console.log("\n--- Tool Data ---");
        console.log("Direct tool response:", toolCall.parsedData.humanMessage);
        console.log(
          "Full tool response object:",
          JSON.stringify(toolCall.parsedData, null, 2),
        );
      }
    } catch (err) {
      console.error("Error:", err);
    }
  }
}

bootstrap()
  .catch((err) => {
    console.error("Fatal error during CLI bootstrap:", err);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });

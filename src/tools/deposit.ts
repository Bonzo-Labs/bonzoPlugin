import type { Client } from "@hashgraph/sdk";
import { ContractExecuteTransaction, Hbar } from "@hashgraph/sdk";
import { Interface } from "@ethersproject/abi";
import { AgentMode, type Context, PromptGenerator, type Tool } from "hedera-agent-kit";
import type { z } from "zod";
import {
  buildTxBytes,
  contractIdFromEvm,
  defaultGasAndFee,
  getLendingPoolAddress,
  getNetworkKey,
  getTokenAddresses,
  handleResponse,
  getEvmAliasAddress,
  toWei,
  fetchErc20Decimals,
  getAvailableSymbols,
  validateNetworkMismatch,
} from "../bonzo/utils.js";
import { BonzoMarketService } from "../bonzo/bonzo-market-service.js";
import { depositParameters } from "../bonzo/bonzo.zod.js";

const depositPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();
  return `
${contextSnippet}

This tool supplies a token to Bonzo (Aave v2) via the LendingPool contract.

Parameters:
- required.tokenSymbol (string)
- required.amount (number|string)
- optional.onBehalfOf (Account ID)
- optional.referralCode (number, default 0)
${usageInstructions}
`;
};

const depositExecute = async (client: Client, context: Context, params: z.infer<ReturnType<typeof depositParameters>>) => {
  try {
    const { required, optional } = params;
    const { tokenSymbol, amount } = required;
    const referralCode = optional?.referralCode ?? 0;
    const network = getNetworkKey(client);
    const { token } = getTokenAddresses(tokenSymbol.toUpperCase(), network);

    let decimals: number | undefined;
    try {
      const reserves = await BonzoMarketService.fetchReserves();
      const reserve = reserves.find((r) => r.symbol.toUpperCase() === tokenSymbol.toUpperCase());
      decimals = reserve?.decimals;
    } catch {}
    if (decimals === undefined) {
      decimals = await fetchErc20Decimals(client, token);
    }

    const amountWei = toWei(amount, decimals);
    const onBehalfOfId = optional?.onBehalfOf || client.operatorAccountId?.toString();
    if (!onBehalfOfId) return "Operator account is not set; provide optional.onBehalfOf";
    const onBehalfOf = await getEvmAliasAddress(client, onBehalfOfId);

    const lendingPool = getLendingPoolAddress(network);

    // Validate network mismatch
    const networkMismatch = validateNetworkMismatch(client, lendingPool);
    if (networkMismatch) {
      return networkMismatch;
    }
    const iface = new Interface(["function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)"]);
    const data = iface.encodeFunctionData("deposit", [token, amountWei, onBehalfOf, referralCode]);

    // Gas/fee configuration with per-tool env overrides
    const base = defaultGasAndFee("heavy");
    const gasOverride = 1_000_000;
    const feeOverride = 3_000_000;
    const gas = Number.isFinite(gasOverride) && gasOverride > 0 ? Math.trunc(gasOverride) : base.gas;
    const fee = Number.isFinite(feeOverride) && feeOverride > 0 ? new Hbar(feeOverride) : base.fee;

    const tx = new ContractExecuteTransaction()
      .setContractId(contractIdFromEvm(lendingPool))
      .setGas(gas)
      .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
      .setMaxTransactionFee(fee);

    if (context.mode === AgentMode.AUTONOMOUS) {
      const resp = await tx.execute(client);
      const receipt = await resp.getReceipt(client);
      return handleResponse(
        { transactionId: resp.transactionId.toString(), status: receipt.status.toString() },
        `Deposit submitted. Status: ${receipt.status.toString()} TxId: ${resp.transactionId.toString()}`
      );
    }

    const bytes = await buildTxBytes(tx, client);
    return handleResponse({ bytes }, `Transaction prepared. Hex: ${bytes.toString("hex")}`);
  } catch (error) {
    console.error("[BonzoDeposit] Error:", error);
    if (error instanceof Error) {
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      return `Deposit failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`;
    }
    return "Deposit failed";
  }
};

export const BONZO_DEPOSIT_TOOL = "bonzo_deposit_tool";

const tool = (context: Context): Tool => ({
  method: BONZO_DEPOSIT_TOOL,
  name: "Bonzo Deposit",
  description: depositPrompt(context),
  parameters: depositParameters(context),
  execute: depositExecute,
});

export default tool;

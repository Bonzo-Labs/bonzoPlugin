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
  maxUint256,
  toWei,
  fetchErc20Decimals,
  getAvailableSymbols,
  validateNetworkMismatch,
} from "../bonzo/utils.js";
import { BonzoMarketService } from "../bonzo/bonzo-market-service.js";
import { approveErc20Parameters } from "../bonzo/bonzo.zod.js";

const approveErc20Prompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();
  return `
${contextSnippet}

This tool approves the Bonzo LendingPool to spend the specified ERC20 underlying asset.

Parameters:
- required.tokenSymbol (string): Token symbol (e.g. USDC)
- required.amount (number|string): Amount in human units (ignored if optional.useMax=true)
- optional.spender (address): Override spender (defaults to LendingPool)
- optional.useMax (boolean): If true, approves max uint256
${usageInstructions}
`;
};

const approveErc20Execute = async (client: Client, context: Context, params: z.infer<ReturnType<typeof approveErc20Parameters>>) => {
  try {
    const { required, optional } = params;
    const { tokenSymbol, amount } = required;
    const network = getNetworkKey(client);
    const { token } = getTokenAddresses(tokenSymbol.toUpperCase(), network);
    const spender = (optional?.spender as `0x${string}`) || getLendingPoolAddress(network);

    // Validate network mismatch (only check if spender is the lending pool)
    if (!optional?.spender) {
      const networkMismatch = validateNetworkMismatch(client, spender);
      if (networkMismatch) {
        return networkMismatch;
      }
    }

    // Get decimals from market API for conversion
    let decimals: number | undefined;
    try {
      const reserves = await BonzoMarketService.fetchReserves();
      const reserve = reserves.find((r) => r.symbol.toUpperCase() === tokenSymbol.toUpperCase());
      decimals = reserve?.decimals;
    } catch {}
    if (decimals === undefined) {
      // fallback to on-chain decimals for the selected network
      decimals = await fetchErc20Decimals(client, token);
    }

    const value = optional?.useMax ? maxUint256 : toWei(amount, decimals);

    const erc20Iface = new Interface(["function approve(address spender, uint256 amount)"]);
    const data = erc20Iface.encodeFunctionData("approve", [spender, value]);

    // Gas/fee configuration with per-tool env overrides
    const base = defaultGasAndFee("light");
    const gasOverride = 1_000_000;
    const feeOverrideEnv = Number(process.env.BONZO_MAX_FEE_HBAR_APPROVE || "");
    const gas = Number.isFinite(gasOverride) && gasOverride > 0 ? Math.trunc(gasOverride) : base.gas;
    const fee = Number.isFinite(feeOverrideEnv) && feeOverrideEnv > 0 ? new Hbar(feeOverrideEnv) : base.fee;

    const tx = new ContractExecuteTransaction()
      .setContractId(contractIdFromEvm(token))
      .setGas(gas)
      .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
      .setMaxTransactionFee(fee);

    if (context.mode === AgentMode.AUTONOMOUS) {
      const resp = await tx.execute(client);
      const receipt = await resp.getReceipt(client);
      return handleResponse(
        { transactionId: resp.transactionId.toString(), status: receipt.status.toString() },
        `Approve submitted. Status: ${receipt.status.toString()} TxId: ${resp.transactionId.toString()}`
      );
    }

    const bytes = await buildTxBytes(tx, client);
    return handleResponse({ bytes }, `Transaction prepared. Hex: ${bytes.toString("hex")}`);
  } catch (error) {
    console.error("[ApproveERC20] Error:", error);
    if (error instanceof Error) {
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      return `Approve failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`;
    }
    return "Approve failed";
  }
};

export const APPROVE_ERC20_TOOL = "approve_erc20_tool";

const tool = (context: Context): Tool => ({
  method: APPROVE_ERC20_TOOL,
  name: "Approve ERC20 for Bonzo",
  description: approveErc20Prompt(context),
  parameters: approveErc20Parameters(context),
  execute: approveErc20Execute,
});

export default tool;

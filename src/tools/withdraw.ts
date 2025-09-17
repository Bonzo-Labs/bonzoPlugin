import type { Client } from "@hashgraph/sdk";
import { ContractExecuteTransaction, Hbar } from "@hashgraph/sdk";
import { Interface } from "@ethersproject/abi";
import {
  AgentMode,
  type Context,
  PromptGenerator,
  type Tool,
} from "hedera-agent-kit";
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
  toEvmAddressFromAccount,
  toWei,
  fetchErc20Decimals,
  getAvailableSymbols,
} from "../bonzo/utils.js";
import { BonzoMarketService } from "../bonzo/bonzo-market-service.js";
import { withdrawParameters } from "../bonzo/bonzo.zod.js";

const withdrawPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();
  return `
${contextSnippet}

This tool withdraws supplied tokens from Bonzo (Aave v2) via the LendingPool contract.

Parameters:
- required.tokenSymbol (string)
- required.amount (number|string)
- optional.to (Account ID)
- optional.withdrawAll (boolean)
${usageInstructions}
`; };

const withdrawExecute = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof withdrawParameters>>,
) => {
  try {
    const { required, optional } = params;
    const { tokenSymbol, amount } = required;
    const network = getNetworkKey(client);
    const { token } = getTokenAddresses(tokenSymbol.toUpperCase(), network);

    let decimals: number | undefined;
    try {
      const reserves = await BonzoMarketService.fetchReserves();
      const reserve = reserves.find(r => r.symbol.toUpperCase() === tokenSymbol.toUpperCase());
      decimals = reserve?.decimals;
    } catch {}
    if (decimals === undefined) {
      decimals = await fetchErc20Decimals(client, token);
    }

    const targetId = optional?.to || client.operatorAccountId?.toString();
    if (!targetId) return "Operator account is not set; provide optional.to";
    const to = toEvmAddressFromAccount(targetId);

    const amountWei = optional?.withdrawAll ? maxUint256 : toWei(amount, decimals);

    const lendingPool = getLendingPoolAddress(network);
    const iface = new Interface(["function withdraw(address asset, uint256 amount, address to)"]);
    const data = iface.encodeFunctionData("withdraw", [token, amountWei, to]);

    // Gas/fee configuration with per-tool env overrides
    const base = defaultGasAndFee("light");
    const gasOverride = Number(process.env.BONZO_GAS_WITHDRAW || "");
    const feeOverride = Number(process.env.BONZO_MAX_FEE_HBAR_WITHDRAW || "");
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
        `Withdraw submitted. Status: ${receipt.status.toString()} TxId: ${resp.transactionId.toString()}`,
      );
    }

    const bytes = await buildTxBytes(tx, client);
    return handleResponse(
      { bytes },
      `Transaction prepared. Hex: ${bytes.toString("hex")}`,
    );
  } catch (error) {
    console.error("[BonzoWithdraw] Error:", error);
    if (error instanceof Error) {
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      return `Withdraw failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`;
    }
    return "Withdraw failed";
  }
};

export const BONZO_WITHDRAW_TOOL = "bonzo_withdraw_tool";

const tool = (context: Context): Tool => ({
  method: BONZO_WITHDRAW_TOOL,
  name: "Bonzo Withdraw",
  description: withdrawPrompt(context),
  parameters: withdrawParameters(context),
  execute: withdrawExecute,
});

export default tool;

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
  RATE_MODE_MAP,
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
import { repayParameters } from "../bonzo/bonzo.zod.js";

const repayPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();
  return `
${contextSnippet}

This tool repays borrowed tokens on Bonzo (Aave v2) via the LendingPool contract.

Parameters:
- required.tokenSymbol (string)
- required.amount (number|string)
- required.rateMode ("stable"|"variable")
- optional.onBehalfOf (Account ID)
- optional.repayAll (boolean)
${usageInstructions}
`; };

const repayExecute = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof repayParameters>>,
) => {
  try {
    const { required, optional } = params;
    const { tokenSymbol, amount, rateMode } = required;
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

    const onBehalfOfId = optional?.onBehalfOf || client.operatorAccountId?.toString();
    if (!onBehalfOfId) return "Operator account is not set; provide optional.onBehalfOf";
    const onBehalfOf = toEvmAddressFromAccount(onBehalfOfId);

    const amountWei = optional?.repayAll ? maxUint256 : toWei(amount, decimals);
    const lendingPool = getLendingPoolAddress(network);
    const iface = new Interface([
      "function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf)",
    ]);
    const rate = RATE_MODE_MAP[rateMode];
    const data = iface.encodeFunctionData("repay", [token, amountWei, rate, onBehalfOf]);

    // Gas/fee configuration with per-tool env overrides
    const base = defaultGasAndFee("heavy");
    const gasOverride = Number(process.env.BONZO_GAS_REPAY || "");
    const feeOverride = Number(process.env.BONZO_MAX_FEE_HBAR_REPAY || "");
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
        `Repay submitted. Status: ${receipt.status.toString()} TxId: ${resp.transactionId.toString()}`,
      );
    }

    const bytes = await buildTxBytes(tx, client);
    return handleResponse(
      { bytes },
      `Transaction prepared. Hex: ${bytes.toString("hex")}`,
    );
  } catch (error) {
    console.error("[BonzoRepay] Error:", error);
    if (error instanceof Error) {
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      return `Repay failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`;
    }
    return "Repay failed";
  }
};

export const BONZO_REPAY_TOOL = "bonzo_repay_tool";

const tool = (context: Context): Tool => ({
  method: BONZO_REPAY_TOOL,
  name: "Bonzo Repay",
  description: repayPrompt(context),
  parameters: repayParameters(context),
  execute: repayExecute,
});

export default tool;

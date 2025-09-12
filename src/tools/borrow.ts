import type { Client } from "@hashgraph/sdk";
import { ContractExecuteTransaction } from "@hashgraph/sdk";
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
  toEvmAddressFromAccount,
  toWei,
  fetchErc20Decimals,
  getAvailableSymbols,
} from "../bonzo/utils.js";
import { BonzoMarketService } from "../bonzo/bonzo-market-service.js";
import { borrowParameters } from "../bonzo/bonzo.zod.js";

const borrowPrompt = (context: Context = {}) => {
  const contextSnippet = PromptGenerator.getContextSnippet(context);
  const usageInstructions = PromptGenerator.getParameterUsageInstructions();
  return `
${contextSnippet}

This tool borrows tokens from Bonzo (Aave v2) via the LendingPool contract.

Parameters:
- required.tokenSymbol (string)
- required.amount (number|string)
- required.rateMode ("stable"|"variable")
- optional.onBehalfOf (Account ID)
- optional.referralCode (number)
${usageInstructions}
`; };

const borrowExecute = async (
  client: Client,
  context: Context,
  params: z.infer<ReturnType<typeof borrowParameters>>,
) => {
  try {
    const { required, optional } = params;
    const { tokenSymbol, amount, rateMode } = required;
    const referralCode = optional?.referralCode ?? 0;
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

    const amountWei = toWei(amount, decimals);
    const onBehalfOfId = optional?.onBehalfOf || client.operatorAccountId?.toString();
    if (!onBehalfOfId) return "Operator account is not set; provide optional.onBehalfOf";
    const onBehalfOf = toEvmAddressFromAccount(onBehalfOfId);

    const lendingPool = getLendingPoolAddress(network);
    const iface = new Interface([
      "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
    ]);
    const rate = RATE_MODE_MAP[rateMode];
    const data = iface.encodeFunctionData("borrow", [token, amountWei, rate, referralCode, onBehalfOf]);

    const { gas, fee } = defaultGasAndFee("heavy");
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
        `Borrow submitted. Status: ${receipt.status.toString()} TxId: ${resp.transactionId.toString()}`,
      );
    }

    const bytes = await buildTxBytes(tx, client);
    return handleResponse(
      { bytes },
      `Transaction prepared. Hex: ${bytes.toString("hex")}`,
    );
  } catch (error) {
    console.error("[BonzoBorrow] Error:", error);
    if (error instanceof Error) {
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      return `Borrow failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`;
    }
    return "Borrow failed";
  }
};

export const BONZO_BORROW_TOOL = "bonzo_borrow_tool";

const tool = (context: Context): Tool => ({
  method: BONZO_BORROW_TOOL,
  name: "Bonzo Borrow",
  description: borrowPrompt(context),
  parameters: borrowParameters(context),
  execute: borrowExecute,
});

export default tool;

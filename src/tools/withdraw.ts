import {
  BaseTool,
  type Context,
  handleTransaction,
  PromptGenerator,
  type RawTransactionResponse,
  transactionToolOutputParser,
} from "@hashgraph/hedera-agent-kit";
import {
  type Client,
  ContractExecuteTransaction,
  Hbar,
  Transaction,
} from "@hiero-ledger/sdk";
import { Interface } from "@ethersproject/abi";
import type { z } from "zod";
import {
  contractIdFromEvm,
  defaultGasAndFee,
  getAvailableSymbols,
  getEvmAliasAddress,
  getLendingPoolAddress,
  getNetworkKey,
  getTokenAddresses,
  handleResponse,
  maxUint256,
  toWei,
  fetchErc20Decimals,
  validateNetworkMismatch,
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
`;
};

const withdrawPostProcess = (response: RawTransactionResponse) =>
  `Withdraw submitted. Status: ${response.status} TxId: ${response.transactionId}`;

type WithdrawParams = z.infer<ReturnType<typeof withdrawParameters>>;

export const BONZO_WITHDRAW_TOOL = "bonzo_withdraw_tool";

export class BonzoWithdrawTool extends BaseTool<WithdrawParams, WithdrawParams> {
  method = BONZO_WITHDRAW_TOOL;
  name = "Bonzo Withdraw";
  description: string;
  parameters: ReturnType<typeof withdrawParameters>;
  override outputParser = transactionToolOutputParser;

  constructor(context: Context) {
    super();
    this.description = withdrawPrompt(context);
    this.parameters = withdrawParameters(context);
  }

  async normalizeParams(
    params: WithdrawParams,
    _context: Context,
    _client: Client,
  ): Promise<WithdrawParams> {
    return params;
  }

  async coreAction(params: WithdrawParams, _context: Context, client: Client) {
    try {
      const { required, optional } = params;
      const { tokenSymbol, amount } = required;
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

      const targetId = optional?.to || client.operatorAccountId?.toString();
      if (!targetId) {
        const message = "Operator account is not set; provide optional.to";
        return handleResponse({ error: message }, message);
      }
      const to = await getEvmAliasAddress(client, targetId);

      const amountWei = optional?.withdrawAll ? maxUint256 : toWei(amount, decimals);

      const lendingPool = getLendingPoolAddress(network);

      const networkMismatch = validateNetworkMismatch(client, lendingPool);
      if (networkMismatch) {
        return handleResponse({ error: networkMismatch }, networkMismatch);
      }
      const iface = new Interface(["function withdraw(address asset, uint256 amount, address to)"]);
      const data = iface.encodeFunctionData("withdraw", [token, amountWei, to]);

      const base = defaultGasAndFee("light");
      const gasOverride = 1_000_000;
      const feeOverride = 3_000_000;
      const gas = Number.isFinite(gasOverride) && gasOverride > 0 ? Math.trunc(gasOverride) : base.gas;
      const fee = Number.isFinite(feeOverride) && feeOverride > 0 ? new Hbar(feeOverride) : base.fee;

      return new ContractExecuteTransaction()
        .setContractId(contractIdFromEvm(lendingPool))
        .setGas(gas)
        .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
        .setMaxTransactionFee(fee);
    } catch (error) {
      console.error("[BonzoWithdraw] Error:", error);
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      const message =
        error instanceof Error
          ? `Withdraw failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`
          : "Withdraw failed";
      return handleResponse({ error: message }, message);
    }
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return coreActionResult instanceof Transaction;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, withdrawPostProcess);
  }
}

const tool = (context: Context) => new BonzoWithdrawTool(context);

export default tool;

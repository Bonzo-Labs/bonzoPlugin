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
  RATE_MODE_MAP,
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
`;
};

const repayPostProcess = (response: RawTransactionResponse) =>
  `Repay submitted. Status: ${response.status} TxId: ${response.transactionId}`;

type RepayParams = z.infer<ReturnType<typeof repayParameters>>;

export const BONZO_REPAY_TOOL = "bonzo_repay_tool";

export class BonzoRepayTool extends BaseTool<RepayParams, RepayParams> {
  method = BONZO_REPAY_TOOL;
  name = "Bonzo Repay";
  description: string;
  parameters: ReturnType<typeof repayParameters>;
  override outputParser = transactionToolOutputParser;

  constructor(context: Context) {
    super();
    this.description = repayPrompt(context);
    this.parameters = repayParameters(context);
  }

  async normalizeParams(
    params: RepayParams,
    _context: Context,
    _client: Client,
  ): Promise<RepayParams> {
    return params;
  }

  async coreAction(params: RepayParams, _context: Context, client: Client) {
    try {
      const { required, optional } = params;
      const { tokenSymbol, amount, rateMode } = required;
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

      const onBehalfOfId = optional?.onBehalfOf || client.operatorAccountId?.toString();
      if (!onBehalfOfId) {
        const message = "Operator account is not set; provide optional.onBehalfOf";
        return handleResponse({ error: message }, message);
      }
      const onBehalfOf = await getEvmAliasAddress(client, onBehalfOfId);

      const amountWei = optional?.repayAll ? maxUint256 : toWei(amount, decimals);
      const lendingPool = getLendingPoolAddress(network);

      const networkMismatch = validateNetworkMismatch(client, lendingPool);
      if (networkMismatch) {
        return handleResponse({ error: networkMismatch }, networkMismatch);
      }
      const iface = new Interface(["function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf)"]);
      const rate = RATE_MODE_MAP[rateMode];
      const data = iface.encodeFunctionData("repay", [token, amountWei, rate, onBehalfOf]);

      const base = defaultGasAndFee("heavy");
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
      console.error("[BonzoRepay] Error:", error);
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      const message =
        error instanceof Error
          ? `Repay failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`
          : "Repay failed";
      return handleResponse({ error: message }, message);
    }
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return coreActionResult instanceof Transaction;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, repayPostProcess);
  }
}

const tool = (context: Context) => new BonzoRepayTool(context);

export default tool;

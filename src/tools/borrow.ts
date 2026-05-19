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
  toWei,
  fetchErc20Decimals,
  validateNetworkMismatch,
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
`;
};

const borrowPostProcess = (response: RawTransactionResponse) =>
  `Borrow submitted. Status: ${response.status} TxId: ${response.transactionId}`;

type BorrowParams = z.infer<ReturnType<typeof borrowParameters>>;

export const BONZO_BORROW_TOOL = "bonzo_borrow_tool";

export class BonzoBorrowTool extends BaseTool<BorrowParams, BorrowParams> {
  method = BONZO_BORROW_TOOL;
  name = "Bonzo Borrow";
  description: string;
  parameters: ReturnType<typeof borrowParameters>;
  override outputParser = transactionToolOutputParser;

  constructor(context: Context) {
    super();
    this.description = borrowPrompt(context);
    this.parameters = borrowParameters(context);
  }

  async normalizeParams(
    params: BorrowParams,
    _context: Context,
    _client: Client,
  ): Promise<BorrowParams> {
    return params;
  }

  async coreAction(params: BorrowParams, _context: Context, client: Client) {
    try {
      const { required, optional } = params;
      const { tokenSymbol, amount, rateMode } = required;
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
      if (!onBehalfOfId) {
        const message = "Operator account is not set; provide optional.onBehalfOf";
        return handleResponse({ error: message }, message);
      }
      // Use alias-aware resolver so msg.sender and onBehalfOf align for Bonzo checks
      const onBehalfOf = await getEvmAliasAddress(client, onBehalfOfId);

      const lendingPool = getLendingPoolAddress(network);

      const networkMismatch = validateNetworkMismatch(client, lendingPool);
      if (networkMismatch) {
        return handleResponse({ error: networkMismatch }, networkMismatch);
      }
      const iface = new Interface(["function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)"]);
      const rate = RATE_MODE_MAP[rateMode];
      const data = iface.encodeFunctionData("borrow", [token, amountWei, rate, referralCode, onBehalfOf]);

      const base = defaultGasAndFee("heavy");
      const gasOverride = 2_000_000;
      const feeOverride = 5_000_000;
      const gas = Number.isFinite(gasOverride) && gasOverride > 0 ? Math.trunc(gasOverride) : base.gas;
      const fee = Number.isFinite(feeOverride) && feeOverride > 0 ? new Hbar(feeOverride) : base.fee;

      return new ContractExecuteTransaction()
        .setContractId(contractIdFromEvm(lendingPool))
        .setGas(gas)
        .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
        .setMaxTransactionFee(fee);
    } catch (error) {
      console.error("[BonzoBorrow] Error:", error);
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      const message =
        error instanceof Error
          ? `Borrow failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`
          : "Borrow failed";
      return handleResponse({ error: message }, message);
    }
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return coreActionResult instanceof Transaction;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, borrowPostProcess);
  }
}

const tool = (context: Context) => new BonzoBorrowTool(context);

export default tool;

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
  toWei,
  fetchErc20Decimals,
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

const depositPostProcess = (response: RawTransactionResponse) =>
  `Deposit submitted. Status: ${response.status} TxId: ${response.transactionId}`;

type DepositParams = z.infer<ReturnType<typeof depositParameters>>;

export const BONZO_DEPOSIT_TOOL = "bonzo_deposit_tool";

export class BonzoDepositTool extends BaseTool<DepositParams, DepositParams> {
  method = BONZO_DEPOSIT_TOOL;
  name = "Bonzo Deposit";
  description: string;
  parameters: ReturnType<typeof depositParameters>;
  override outputParser = transactionToolOutputParser;

  constructor(context: Context) {
    super();
    this.description = depositPrompt(context);
    this.parameters = depositParameters(context);
  }

  async normalizeParams(
    params: DepositParams,
    _context: Context,
    _client: Client,
  ): Promise<DepositParams> {
    return params;
  }

  async coreAction(params: DepositParams, _context: Context, client: Client) {
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
      if (!onBehalfOfId) {
        const message = "Operator account is not set; provide optional.onBehalfOf";
        return handleResponse({ error: message }, message);
      }
      const onBehalfOf = await getEvmAliasAddress(client, onBehalfOfId);

      const lendingPool = getLendingPoolAddress(network);

      const networkMismatch = validateNetworkMismatch(client, lendingPool);
      if (networkMismatch) {
        return handleResponse({ error: networkMismatch }, networkMismatch);
      }
      const iface = new Interface(["function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)"]);
      const data = iface.encodeFunctionData("deposit", [token, amountWei, onBehalfOf, referralCode]);

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
      console.error("[BonzoDeposit] Error:", error);
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      const message =
        error instanceof Error
          ? `Deposit failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`
          : "Deposit failed";
      return handleResponse({ error: message }, message);
    }
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return coreActionResult instanceof Transaction;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, depositPostProcess);
  }
}

const tool = (context: Context) => new BonzoDepositTool(context);

export default tool;

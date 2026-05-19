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

const approveErc20PostProcess = (response: RawTransactionResponse) =>
  `Approve submitted. Status: ${response.status} TxId: ${response.transactionId}`;

type ApproveErc20Params = z.infer<ReturnType<typeof approveErc20Parameters>>;

export const APPROVE_ERC20_TOOL = "approve_erc20_tool";

export class ApproveErc20Tool extends BaseTool<ApproveErc20Params, ApproveErc20Params> {
  method = APPROVE_ERC20_TOOL;
  name = "Approve ERC20 for Bonzo";
  description: string;
  parameters: ReturnType<typeof approveErc20Parameters>;
  override outputParser = transactionToolOutputParser;

  constructor(context: Context) {
    super();
    this.description = approveErc20Prompt(context);
    this.parameters = approveErc20Parameters(context);
  }

  async normalizeParams(
    params: ApproveErc20Params,
    _context: Context,
    _client: Client,
  ): Promise<ApproveErc20Params> {
    return params;
  }

  async coreAction(params: ApproveErc20Params, _context: Context, client: Client) {
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
          return handleResponse({ error: networkMismatch }, networkMismatch);
        }
      }

      let decimals: number | undefined;
      try {
        const reserves = await BonzoMarketService.fetchReserves();
        const reserve = reserves.find((r) => r.symbol.toUpperCase() === tokenSymbol.toUpperCase());
        decimals = reserve?.decimals;
      } catch {}
      if (decimals === undefined) {
        decimals = await fetchErc20Decimals(client, token);
      }

      const value = optional?.useMax ? maxUint256 : toWei(amount, decimals);

      const erc20Iface = new Interface(["function approve(address spender, uint256 amount)"]);
      const data = erc20Iface.encodeFunctionData("approve", [spender, value]);

      const base = defaultGasAndFee("light");
      const gasOverride = 1_000_000;
      const feeOverrideEnv = Number(process.env.BONZO_MAX_FEE_HBAR_APPROVE || "");
      const gas = Number.isFinite(gasOverride) && gasOverride > 0 ? Math.trunc(gasOverride) : base.gas;
      const fee = Number.isFinite(feeOverrideEnv) && feeOverrideEnv > 0 ? new Hbar(feeOverrideEnv) : base.fee;

      return new ContractExecuteTransaction()
        .setContractId(contractIdFromEvm(token))
        .setGas(gas)
        .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
        .setMaxTransactionFee(fee);
    } catch (error) {
      console.error("[ApproveERC20] Error:", error);
      const network = getNetworkKey(client);
      const available = getAvailableSymbols(network).join(", ");
      const message =
        error instanceof Error
          ? `Approve failed: ${error.message}. Network: ${network}. Available tokens: ${available || "<none>"}`
          : "Approve failed";
      return handleResponse({ error: message }, message);
    }
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return coreActionResult instanceof Transaction;
  }

  async secondaryAction(transaction: Transaction, client: Client, context: Context) {
    return await handleTransaction(transaction, client, context, approveErc20PostProcess);
  }
}

const tool = (context: Context) => new ApproveErc20Tool(context);

export default tool;

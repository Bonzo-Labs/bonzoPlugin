import type { Tool, Context } from "hedera-agent-kit";
import { z } from "zod";
import { BonzoMarketService } from "./bonzo/bonzo-market-service.js";
import { Interface } from '@ethersproject/abi';
import { ContractExecuteTransaction, Hbar, ContractId } from '@hashgraph/sdk';
import BigNumber from 'bignumber.js';

/**
 * Zod schema for Bonzo Market Data Tool parameters
 */
export const bonzoMarketDataParameters = z.object({}) as any;

export type BonzoMarketDataParams = z.infer<typeof bonzoMarketDataParameters>;

/**
 * Tool name constant for external reference
 */
export const BONZO_MARKET_DATA_TOOL = 'bonzo_market_data_tool';

/**
 * Creates the prompt description for the Bonzo market data tool
 */
const createBonzoMarketDataPrompt = (context: Context = {}) => {
    return `
This tool fetches current market data from Bonzo Finance (Aave fork on Hedera) and returns information about supported tokens and their supply/borrow APYs.

The tool provides:
- List of all active tokens supported by Bonzo Finance
- Current supply APY (Annual Percentage Yield) for each token
- Current variable borrow APY for each token  
- Token liquidity information
- Market utilization rates

No parameters required - simply call this tool to get the latest Bonzo market data.

Example usage: "Tell me the current tokens supported by Bonzo and the supply/borrow APYs"
`;
};

/**
 * Formats market data into a readable summary
 */
const formatMarketData = (reserves: any[]): string => {
    if (!reserves || reserves.length === 0) {
        return "No market data available from Bonzo Finance.";
    }

    const timestamp = new Date().toISOString();
    let summary = `Bonzo Finance Market Data (as of ${timestamp})\n\n`;

    // Sort by supply APY descending for better readability
    const sortedReserves = [...reserves].sort((a, b) => b.supplyAPY - a.supplyAPY);

    summary += "📊 SUPPORTED TOKENS & RATES:\n";
    summary += "================================\n\n";

    sortedReserves.forEach((reserve, index) => {
        const supplyAPY = (reserve.supplyAPY).toFixed(2);
        const borrowAPY = (reserve.variableBorrowAPY).toFixed(2);
        const utilization = reserve.utilizationRate.toFixed(1);
        const liquidityUSD = reserve.availableLiquidityUSD.toLocaleString();

        summary += `${index + 1}. ${reserve.symbol} (${reserve.name})\n`;
        summary += `   💰 Supply APY: ${supplyAPY}%\n`;
        summary += `   📈 Borrow APY: ${borrowAPY}%\n`;
        summary += `   💧 Available Liquidity: $${liquidityUSD}\n`;
        summary += `   📊 Utilization: ${utilization}%\n`;
        summary += `   🏷️  HTS Address: ${reserve.htsAddress}\n\n`;
    });

    summary += `Total Markets: ${reserves.length}\n`;
    summary += `Highest Supply APY: ${(Math.max(...reserves.map(r => r.supplyAPY))).toFixed(2)}%\n`;
    summary += `Lowest Borrow APY: ${(Math.min(...reserves.map(r => r.variableBorrowAPY))).toFixed(2)}%`;

    return summary;
};

/**
 * Executes the Bonzo market data fetch
 */
const executeBonzoMarketData = async (
    client: any,
    context: Context,
    params: BonzoMarketDataParams
): Promise<string> => {
    try {
        const reserves = await BonzoMarketService.fetchSupplyReserves();
        return formatMarketData(reserves);
    } catch (error) {
        console.error('[BonzoMarketDataTool] Error fetching market data:', error);

        if (error instanceof Error) {
            return `❌ Error fetching Bonzo market data: ${error.message}\n\nPlease try again later or check if the Bonzo Finance API is accessible.`;
        }

        return '❌ Unknown error occurred while fetching Bonzo market data. Please try again later.';
    }
};

/**
 * Bonzo Market Data Tool implementation
 */
const bonzoMarketDataTool = (context: Context): Tool => ({
    method: BONZO_MARKET_DATA_TOOL,
    name: 'Bonzo Market Data',
    description: createBonzoMarketDataPrompt(context),
    parameters: bonzoMarketDataParameters,
    execute: executeBonzoMarketData,
});

/**
 * Tool name constant for Bonzo Supply Token tool
 */
export const BONZO_SUPPLY_TOKEN_TOOL = 'bonzo_supply_token_tool';

/**
 * Zod schema for Bonzo Supply Token parameters
 */
export const bonzoSupplyTokenParameters = z.object({
  tokenSymbol: z.string()
    .min(1, "Token symbol is required")
    .describe("Symbol of the token to supply (e.g., 'USDC')"),
  amount: z.string()
    .min(1, "Amount is required")
    .describe("Amount of token to supply (human-readable, e.g., '100.5')"),
  onBehalfOf: z.string().optional()
    .describe("Account to supply on behalf of (Hedera account ID, defaults to caller's account)"),
  referralCode: z.number().optional().default(0)
    .describe("Referral code (defaults to 0)")
});

export type BonzoSupplyTokenParams = z.infer<typeof bonzoSupplyTokenParameters>;

/**
 * Creates the prompt description for the Bonzo Supply Token tool
 */
const createBonzoSupplyTokenPrompt = (context: Context = {}) => {
  return `
This tool allows supplying a token to Bonzo Finance (Aave v2 fork on Hedera) using the LendingPool contract.

Parameters:
- tokenSymbol (string, required): Symbol of the token to supply (e.g., 'USDC', 'HBAR')
- amount (string, required): Amount to supply in human-readable format (e.g., '100.5')
- onBehalfOf (string, optional): Hedera account ID to supply on behalf of (defaults to your account)
- referralCode (number, optional): Referral code (defaults to 0)

Note: Ensure you have approved the LendingPool to spend your tokens before using this tool. The tool will execute the deposit transaction.

Example usage: "Supply 100 USDC to Bonzo"
`;
};

/**
 * Executes the Bonzo supply token transaction
 */
const executeBonzoSupplyToken = async (
  client: any, // Changed from 'client' to 'any' as Client type is not imported
  context: Context,
  params: BonzoSupplyTokenParams
): Promise<string> => {
  try {
    // Fetch reserves to get token details
    const reserves = await BonzoMarketService.fetchSupplyReserves();
    const reserve = reserves.find(r => r.symbol.toUpperCase() === params.tokenSymbol.toUpperCase());
    
    if (!reserve) {
      return `❌ Token ${params.tokenSymbol} not found in Bonzo reserves.`;
    }
    
    // Calculate amount in wei (smallest units)
    const amountBN = new BigNumber(params.amount);
    const amountWei = amountBN.multipliedBy(new BigNumber(10).pow(reserve.decimals)).toFixed(0);
    const amountBigInt = BigInt(amountWei);
    
    // Get onBehalfOf (default to caller's EVM address)
    const callerAccount = client.operatorAccountId!.toString();
    const onBehalfOf = params.onBehalfOf || callerAccount;
    const onBehalfOfEvm = ContractId.fromString(onBehalfOf).toSolidityAddress();
    
    // Encode function call
    const abi = new Interface(['function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)']);
    const functionData = abi.encodeFunctionData('deposit', [
      reserve.evmAddress,  // assuming evm_address is in reserve
      amountBigInt,
      onBehalfOfEvm,
      params.referralCode
    ]);
    
    // Build transaction
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString('0.0.7308459'))
      .setGas(300000) // Adjust gas as needed
      .setFunctionParameters(Buffer.from(functionData.slice(2), 'hex'))  // Remove 0x prefix
      .setMaxTransactionFee(new Hbar(10)); // Adjust fee as needed
    
    // Execute the transaction
    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    
    return `✅ Successfully supplied ${params.amount} ${params.tokenSymbol} to Bonzo Finance!\nTransaction ID: ${txResponse.transactionId.toString()}\nStatus: ${receipt.status.toString()}`;
  } catch (error) {
    console.error('[BonzoSupplyTokenTool] Error:', error);
    return error instanceof Error ? `❌ Error supplying token: ${error.message}` : '❌ Unknown error occurred';
  }
};

/**
 * Bonzo Supply Token Tool implementation
 */
const bonzoSupplyTokenTool = (context: Context): Tool => ({
  method: BONZO_SUPPLY_TOKEN_TOOL,
  name: 'Bonzo Supply Token',
  description: createBonzoSupplyTokenPrompt(context),
  parameters: bonzoSupplyTokenParameters,
  execute: executeBonzoSupplyToken,
});

export { bonzoMarketDataTool, bonzoSupplyTokenTool };
/**
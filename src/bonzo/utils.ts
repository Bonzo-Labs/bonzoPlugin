import { AccountId, Client, ContractExecuteTransaction, ContractId, Hbar, ContractCallQuery } from "@hashgraph/sdk";
import BigNumber from "bignumber.js";
import { readFileSync } from "fs";
import path from "path";

export type NetworkKey = "hedera_mainnet" | "hedera_testnet";

export const RATE_MODE_MAP = {
  stable: 1,
  variable: 2,
} as const;

export type RateMode = keyof typeof RATE_MODE_MAP;

export const toWei = (amount: string | number, decimals: number): bigint => {
  const bn = new BigNumber(amount);
  const wei = bn.multipliedBy(new BigNumber(10).pow(decimals));
  return BigInt(wei.integerValue(BigNumber.ROUND_DOWN).toFixed(0));
};

export const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

export const handleResponse = <T>(raw: T, humanMessage: string) => {
  return { raw, humanMessage };
};

export const getNetworkKey = (client: Client): NetworkKey => {
  const ledger = client.ledgerId?.toString().toLowerCase();
  if (ledger === "mainnet") return "hedera_mainnet";
  if (ledger === "testnet") return "hedera_testnet";
  throw new Error(`Unsupported Hedera network: ${ledger}`);
};

export const getOperatorAccountId = (client: Client): string | undefined => {
  // SDK v2 stores operator in client.operatorAccountId
  return client.operatorAccountId?.toString();
};

export const toEvmAddressFromAccount = (accountId: string): `0x${string}` => {
  const evmNoPrefix = AccountId.fromString(accountId).toSolidityAddress();
  return ("0x" + evmNoPrefix) as `0x${string}`;
};

export const contractIdFromEvm = (evmAddress: string): ContractId => {
  return ContractId.fromSolidityAddress(evmAddress);
};

export const buildTxBytes = async (tx: ContractExecuteTransaction, client: Client): Promise<Buffer> => {
  const frozen = await tx.freezeWith(client);
  const bytes = frozen.toBytes();
  return Buffer.from(bytes);
};

// Contracts JSON helpers
export type ContractsJson = Record<string, any>;

let cachedContracts: ContractsJson | undefined;

export const loadContracts = (): ContractsJson => {
  if (cachedContracts) return cachedContracts;
  const filePath = path.resolve(process.cwd(), "bonzo-contracts.json");
  const raw = readFileSync(filePath, "utf-8");
  cachedContracts = JSON.parse(raw);
  return cachedContracts!;
};

export const getTokenAddresses = (symbol: string, network: NetworkKey) => {
  const contracts = loadContracts();
  const entry = contracts[symbol];
  if (!entry) throw new Error(`Token symbol not found in contracts: ${symbol}`);
  const net = entry[network];
  if (!net) throw new Error(`Token ${symbol} is not configured for network ${network}.`);
  const tAddr = (net.token?.address || "") as string;
  if (!tAddr) {
    const available = getAvailableSymbols(network);
    throw new Error(`Token ${symbol} is not available on ${network}. Available: ${available.join(", ") || "<none>"}`);
  }
  return {
    token: tAddr as `0x${string}`,
    aToken: net.aToken?.address as `0x${string}`,
    stableDebt: net.stableDebt?.address as `0x${string}`,
    variableDebt: net.variableDebt?.address as `0x${string}`,
  };
};

export const getLendingPoolAddress = (network: NetworkKey): `0x${string}` => {
  const contracts = loadContracts();
  const addr = (contracts?.["LendingPool"]?.[network]?.address || "") as string;
  if (!addr) throw new Error(`LendingPool address not found for network ${network}`);
  return addr as `0x${string}`;
};

export const defaultGasAndFee = (kind: "light" | "heavy") => {
  const envLight = Number(process.env.BONZO_GAS_LIGHT || "");
  const envHeavy = Number(process.env.BONZO_GAS_HEAVY || "");
  const envFee = Number(process.env.BONZO_MAX_FEE_HBAR || "");

  const gas =
    Number.isFinite(envLight) && kind === "light"
      ? Math.max(0, Math.trunc(envLight))
      : Number.isFinite(envHeavy) && kind === "heavy"
      ? Math.max(0, Math.trunc(envHeavy))
      : kind === "light"
      ? 1_000_000 // Increased to 6M for ERC20 operations on Hedera
      : 2_000_000; // Increased to 8M for complex operations

  const feeHbar = Number.isFinite(envFee) && envFee > 0 ? envFee : 2; // 2 HBAR max fee (reasonable for most operations)

  return {
    gas,
    fee: new Hbar(feeHbar),
  };
};

export const getAvailableSymbols = (network: NetworkKey): string[] => {
  const contracts = loadContracts();
  const entries = Object.entries(contracts).filter(([key]) => {
    // exclude non-token entries by checking for nested network object
    const val = contracts[key];
    const tokenAddr = val?.[network]?.token?.address as string | undefined;
    return typeof tokenAddr === "string" && tokenAddr.length > 0;
  });
  return entries.map(([sym]) => sym).sort();
};

export const fetchErc20Decimals = async (client: Client, tokenEvm: `0x${string}`): Promise<number> => {
  try {
    const iface = new (await import("@ethersproject/abi")).Interface(["function decimals() view returns (uint8)"]);
    const data = iface.encodeFunctionData("decimals", []);
    const query = new ContractCallQuery()
      .setContractId(contractIdFromEvm(tokenEvm))
      .setGas(50_000)
      .setFunctionParameters(Buffer.from(data.slice(2), "hex"));
    const res = await query.execute(client);
    const bytes = Buffer.from(res.bytes);
    const decoded = iface.decodeFunctionResult("decimals", bytes);
    const dec = Number(decoded[0]);
    if (!Number.isFinite(dec)) throw new Error("Invalid decimals result");
    return dec;
  } catch (e) {
    throw new Error(`Failed to read ERC20 decimals for ${tokenEvm}: ${e instanceof Error ? e.message : e}`);
  }
};

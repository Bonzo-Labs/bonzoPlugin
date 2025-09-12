import z from "zod";
import type { Context } from "hedera-agent-kit";

export const approveErc20Parameters = (_: Context = {}) =>
  z.object({
    required: z.object({
      tokenSymbol: z.string().min(1).describe("Symbol of the token to approve (e.g. USDC)"),
      amount: z.union([z.number(), z.string()]).describe("Amount to approve in human-readable units"),
    }),
    optional: z
      .object({
        spender: z.string().optional().describe("Override spender address; defaults to Bonzo LendingPool"),
        useMax: z.boolean().optional().default(false).describe("Approve max uint256 instead of amount"),
      })
      .optional(),
  });

export const depositParameters = (_: Context = {}) =>
  z.object({
    required: z.object({
      tokenSymbol: z.string().min(1).describe("Symbol of the token to deposit"),
      amount: z.union([z.number(), z.string()]).describe("Amount to deposit in human-readable units"),
    }),
    optional: z
      .object({
        onBehalfOf: z.string().optional().describe("Account ID to deposit on behalf of; defaults to operator"),
        referralCode: z.number().optional().default(0).describe("Referral code (default 0)"),
      })
      .optional(),
  });

export const withdrawParameters = (_: Context = {}) =>
  z.object({
    required: z.object({
      tokenSymbol: z.string().min(1).describe("Symbol of the token to withdraw"),
      amount: z.union([z.number(), z.string()]).describe("Amount to withdraw in human-readable units"),
    }),
    optional: z
      .object({
        to: z.string().optional().describe("Recipient account ID; defaults to operator"),
        withdrawAll: z.boolean().optional().default(false).describe("Withdraw max (all)"),
      })
      .optional(),
  });

export const borrowParameters = (_: Context = {}) =>
  z.object({
    required: z.object({
      tokenSymbol: z.string().min(1).describe("Symbol of the token to borrow"),
      amount: z.union([z.number(), z.string()]).describe("Amount to borrow in human-readable units"),
      rateMode: z.enum(["stable", "variable"]).describe("Borrow rate mode"),
    }),
    optional: z
      .object({
        onBehalfOf: z.string().optional().describe("Account ID to borrow on behalf of; defaults to operator"),
        referralCode: z.number().optional().default(0).describe("Referral code (default 0)"),
      })
      .optional(),
  });

export const repayParameters = (_: Context = {}) =>
  z.object({
    required: z.object({
      tokenSymbol: z.string().min(1).describe("Symbol of the token to repay"),
      amount: z.union([z.number(), z.string()]).describe("Amount to repay in human-readable units"),
      rateMode: z.enum(["stable", "variable"]).describe("Debt rate mode to repay"),
    }),
    optional: z
      .object({
        onBehalfOf: z.string().optional().describe("Account ID to repay on behalf of; defaults to operator"),
        repayAll: z.boolean().optional().default(false).describe("Repay max (all)"),
      })
      .optional(),
  });


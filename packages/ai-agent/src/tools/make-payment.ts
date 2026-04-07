import { tool } from "ai";
import { z } from "zod";
import type { IWallet } from "../wallet-interface.js";
import type { AgentConfig } from "../config.js";
import * as ui from "../ui.js";

/** Validate a Stellar public key (G... + 55 alphanumeric chars) */
function isValidStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr);
}

/** Validate an EVM address (0x + 40 hex chars) */
function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function createMakePaymentTool(
  wallet: IWallet,
  opts: { autoApprove?: boolean; config?: AgentConfig } = {}
) {
  const chainType = opts.config?.chainType || "evm";
  const network = opts.config?.network || "base-sepolia";
  const chainId = opts.config?.chainId || 0;
  const explorerBase = opts.config?.explorerUrl || "";

  return tool({
    description:
      `Execute an on-chain USDC payment on ${network}. Transfers real tokens from the agent's wallet to the merchant. Use after receiving payment requirements. Returns the transaction hash needed for submit_payment_proof.`,
    parameters: z.object({
      payTo: z
        .string()
        .describe("Recipient address (from paymentRequirements.recipient or payTo)"),
      amount: z
        .string()
        .describe("Amount in base units (from paymentRequirements.amount)"),
      expectedAmount: z
        .string()
        .optional()
        .describe(
          "Expected amount from paymentRequirements.amount — used to verify the payment matches the requirement"
        ),
    }),
    execute: async ({ payTo, amount, expectedAmount }) => {
      try {
        // Validate recipient address based on chain type
        if (chainType === "stellar") {
          if (!isValidStellarAddress(payTo)) {
            return { success: false, error: `Invalid Stellar address: ${payTo}` };
          }
        } else {
          if (!isValidEvmAddress(payTo)) {
            return { success: false, error: `Invalid Ethereum address: ${payTo}` };
          }
        }

        // Validate amount matches expected payment requirement
        if (expectedAmount && amount !== expectedAmount) {
          return {
            success: false,
            error: `Amount mismatch: sending ${amount} but payment requirement expects ${expectedAmount}`,
          };
        }

        const balance = await wallet.getUsdcBalance();
        const displayAmount = wallet.formatUsdc(amount);

        if (parseFloat(balance) < parseFloat(displayAmount)) {
          ui.paymentFailed(
            `Insufficient balance. Have: ${balance}, Need: ${displayAmount}`
          );
          return {
            success: false,
            error: `Insufficient USDC balance. Have: ${balance} USDC, Need: ${displayAmount} USDC`,
            walletAddress: wallet.address,
            balance,
          };
        }

        ui.paymentPending(displayAmount, payTo);
        ui.paymentSending();

        const txHash = await wallet.transferUsdc(payTo, amount);

        const confirmed = await wallet.waitForTx(txHash);
        const explorerUrl = chainType === "stellar"
          ? `${explorerBase}/tx/${txHash}`
          : `${explorerBase}/tx/${txHash}`;

        if (confirmed) {
          ui.paymentConfirmed(txHash, explorerUrl);
        } else {
          ui.paymentFailed("Transaction failed on-chain");
        }

        return {
          success: confirmed,
          transactionHash: txHash,
          amount: displayAmount,
          amountBaseUnits: amount,
          payTo,
          network,
          chainId,
          explorerUrl,
        };
      } catch (err: any) {
        ui.paymentFailed(err.message);
        return { success: false, error: `Payment failed: ${err.message}` };
      }
    },
  });
}

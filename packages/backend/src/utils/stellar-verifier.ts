/**
 * Stellar Payment Verifier
 *
 * Verifies Stellar payment transactions via the Horizon API.
 * Used by x402-gateway when the active network is a Stellar chain.
 */

import { Horizon } from "@stellar/stellar-sdk";

export interface StellarVerificationResult {
  verified: boolean;
  from: string;
  error?: string;
}

/**
 * Verify a Stellar payment transaction against expected requirements.
 *
 * @param txHash - Stellar transaction hash
 * @param expectedRecipient - Expected destination Stellar public key (G...)
 * @param expectedAmount - Expected amount as a decimal string (e.g. "1.0000000")
 * @param expectedAssetCode - Expected asset code (e.g. "USDC") or "native" for XLM
 * @param horizonUrl - Horizon server URL
 * @param expectedAssetIssuer - Expected asset issuer (for non-native assets)
 */
export async function verifyStellarPayment(
  txHash: string,
  expectedRecipient: string,
  expectedAmount: string,
  expectedAssetCode: string,
  horizonUrl: string,
  expectedAssetIssuer?: string
): Promise<StellarVerificationResult> {
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const server = new Horizon.Server(horizonUrl);

      // Fetch transaction
      const tx = await server.transactions().transaction(txHash).call();

      if (!tx.successful) {
        return { verified: false, from: "", error: "Transaction was not successful" };
      }

      // Fetch operations for this transaction
      const operationsPage = await server
        .operations()
        .forTransaction(txHash)
        .limit(50)
        .call();

      const operations = operationsPage.records;

      // Look for a matching payment operation
      for (const op of operations) {
        if (!isPaymentOp(op)) continue;

        const opTo = op.to;
        const opAmount = op.amount;

        // Check recipient
        if (opTo.toUpperCase() !== expectedRecipient.toUpperCase()) continue;

        // Check amount (>= expected)
        if (parseFloat(opAmount) < parseFloat(expectedAmount)) continue;

        // Check asset
        if (expectedAssetCode === "native" || expectedAssetCode === "XLM") {
          if (op.asset_type !== "native") continue;
        } else {
          if (op.asset_code !== expectedAssetCode) continue;
          if (expectedAssetIssuer && op.asset_issuer !== expectedAssetIssuer) continue;
        }

        // All checks passed
        return {
          verified: true,
          from: op.source_account || tx.source_account,
        };
      }

      // No matching operation found
      return {
        verified: false,
        from: tx.source_account,
        error: "No matching payment operation found in transaction",
      };
    } catch (err: any) {
      if (attempt < maxRetries) {
        console.log(
          `[stellar-verifier] Attempt ${attempt} failed: ${err.message}, retrying in ${retryDelay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      return {
        verified: false,
        from: "",
        error: `Verification failed after ${maxRetries} attempts: ${err.message}`,
      };
    }
  }

  return { verified: false, from: "", error: "Unexpected: exhausted retries" };
}

/**
 * Type guard for payment-like operations (payment + path_payment variants)
 */
function isPaymentOp(
  op: any
): op is {
  type: string;
  to: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  source_account?: string;
} {
  return (
    op.type === "payment" ||
    op.type === "path_payment_strict_receive" ||
    op.type === "path_payment_strict_send"
  );
}

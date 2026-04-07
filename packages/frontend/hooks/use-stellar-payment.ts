"use client";

import { useState, useCallback } from "react";
import { useStellarWallet } from "@/components/providers/stellar-wallet-provider";
import { getNetwork } from "@/lib/chain-config";
import type {
  PaymentStatus,
  ResourceResult,
  CheckoutRequest,
  CheckoutResult,
} from "./use-x402-payment";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const CURRENT_NETWORK = getNetwork();
const HORIZON_URL = CURRENT_NETWORK === "stellar"
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = CURRENT_NETWORK === "stellar"
  ? "Public Global Stellar Network ; September 2015"
  : "Test SDF Network ; September 2015";

function buildPaymentHeader(txHash: string) {
  return JSON.stringify({
    transactionHash: txHash,
    network: CURRENT_NETWORK,
    chainId: 0,
    timestamp: Date.now(),
  });
}

/** Read response body safely based on content-type */
async function readResponseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

/** Try to handle the response as a file download */
function tryFileDownload(res: Response): ResourceResult | null {
  const cd = res.headers.get("content-disposition");
  if (!cd || !cd.includes("attachment")) return null;
  const filename = cd.match(/filename="(.+?)"/)?.[1] || "download";
  return {
    content: { downloaded: true, filename },
    contentType: res.headers.get("content-type") || "application/octet-stream",
    downloaded: { filename, url: "" },
  };
}

async function prepareBlobUrl(res: Response): Promise<string> {
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Build and submit a Stellar USDC payment transaction.
 * Uses the Stellar SDK dynamically loaded to avoid SSR issues.
 */
async function sendStellarPayment(
  recipient: string,
  amount: string,
  senderPublicKey: string,
  signTransaction: (xdr: string, network?: string) => Promise<string>
): Promise<string> {
  // Dynamically import Stellar SDK
  const {
    Keypair: _Keypair,
    Networks: _Networks,
    Asset,
    TransactionBuilder,
    Operation,
    Horizon,
  } = await import("@stellar/stellar-sdk");

  const server = new Horizon.Server(HORIZON_URL);

  // Load sender account
  const sourceAccount = await server.loadAccount(senderPublicKey);

  // Get asset issuer from payment requirements or use default
  const assetIssuer = CURRENT_NETWORK === "stellar"
    ? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    : "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

  const usdcAsset = new Asset("USDC", assetIssuer);

  // Convert base units (7 decimals) to Stellar amount string
  const stellarAmount = (Number(amount) / 1e7).toFixed(7);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: recipient,
        asset: usdcAsset,
        amount: stellarAmount,
      })
    )
    .setTimeout(60)
    .build();

  // Sign with Freighter
  const signedXdr = await signTransaction(
    transaction.toXDR(),
    NETWORK_PASSPHRASE
  );

  // Reconstruct and submit the signed transaction
  const { TransactionBuilder: TB } = await import("@stellar/stellar-sdk");
  const signedTx = TB.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  const result = await server.submitTransaction(signedTx);
  return result.hash;
}

export function useStellarPayment() {
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { connected, publicKey, connect, signTransaction } = useStellarWallet();

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, []);

  const payForResource = useCallback(
    async (resourceIdOrSlug: string): Promise<ResourceResult> => {
      if (!connected || !publicKey) {
        await connect();
        throw new Error("Please connect your Stellar wallet first");
      }

      try {
        setStatus("fetching-requirements");
        setError(null);
        setTxHash(null);

        const walletQuery = `?wallet=${publicKey}`;
        const phase1 = await fetch(
          `${API_URL}/x402/resource/${resourceIdOrSlug}${walletQuery}`
        );

        if (phase1.status !== 402) {
          if (!phase1.ok) {
            const errBody = (await readResponseBody(phase1)) as any;
            throw new Error(errBody?.error || `Server error (${phase1.status})`);
          }
          const fileInfo = tryFileDownload(phase1);
          if (fileInfo) {
            const blobUrl = await prepareBlobUrl(phase1);
            setStatus("success");
            return { ...fileInfo, downloaded: { ...fileInfo.downloaded!, url: blobUrl } };
          }
          const content = await readResponseBody(phase1);
          setStatus("success");
          return { content, contentType: phase1.headers.get("content-type") || "application/json" };
        }

        const body = await phase1.json();
        const requirements = body.accepts?.[0] || body.paymentRequirements?.[0] || body;

        if (!requirements.recipient || !requirements.amount) {
          throw new Error("Invalid payment requirements from server");
        }

        // Send Stellar payment
        setStatus("awaiting-approval");
        const hash = await sendStellarPayment(
          requirements.recipient,
          requirements.amount,
          publicKey,
          signTransaction
        );

        setTxHash(hash);
        setStatus("confirming-tx");

        // Wait a moment for Stellar confirmation (~5s)
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Phase 2: Verify payment & get content
        setStatus("verifying-payment");
        const phase2 = await fetch(
          `${API_URL}/x402/resource/${resourceIdOrSlug}`,
          { headers: { "X-PAYMENT": buildPaymentHeader(hash) } }
        );

        if (!phase2.ok) {
          const errBody = (await readResponseBody(phase2)) as any;
          throw new Error(
            errBody?.details || errBody?.error || `Verification failed (${phase2.status})`
          );
        }

        const fileInfo = tryFileDownload(phase2);
        if (fileInfo) {
          const blobUrl = await prepareBlobUrl(phase2);
          setStatus("success");
          return { ...fileInfo, downloaded: { ...fileInfo.downloaded!, url: blobUrl } };
        }

        const content = await readResponseBody(phase2);
        setStatus("success");
        return {
          content,
          contentType: phase2.headers.get("content-type") || "application/json",
        };
      } catch (err: any) {
        const msg =
          err.message?.includes("User rejected") || err.message?.includes("denied")
            ? "You rejected the transaction."
            : err.message || "Something went wrong";
        setError(msg);
        setStatus("error");
        throw err;
      }
    },
    [connected, publicKey, connect, signTransaction]
  );

  const payForProduct = useCallback(
    async (checkoutData: CheckoutRequest): Promise<CheckoutResult> => {
      if (!connected || !publicKey) {
        await connect();
        throw new Error("Please connect your Stellar wallet first");
      }

      try {
        setStatus("fetching-requirements");
        setError(null);
        setTxHash(null);

        const phase1 = await fetch(`${API_URL}/x402/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(checkoutData),
        });

        if (phase1.status !== 402) {
          const errBody = (await readResponseBody(phase1)) as any;
          throw new Error(errBody?.error || `Unexpected response (${phase1.status})`);
        }

        const { orderIntentId, amounts, paymentRequirements } = await phase1.json();
        const requirements = paymentRequirements[0];

        if (!requirements?.recipient || !requirements?.amount) {
          throw new Error("Invalid payment requirements from server");
        }

        setStatus("awaiting-approval");
        const hash = await sendStellarPayment(
          requirements.recipient,
          requirements.amount,
          publicKey,
          signTransaction
        );

        setTxHash(hash);
        setStatus("confirming-tx");
        await new Promise((resolve) => setTimeout(resolve, 5000));

        setStatus("verifying-payment");
        const phase2 = await fetch(`${API_URL}/x402/checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": buildPaymentHeader(hash),
          },
          body: JSON.stringify({ ...checkoutData, orderIntentId }),
        });

        if (!phase2.ok) {
          const errBody = (await readResponseBody(phase2)) as any;
          throw new Error(
            errBody?.details || errBody?.error || `Verification failed (${phase2.status})`
          );
        }

        const result = await phase2.json();
        setStatus("success");
        return {
          orderId: result.orderId,
          orderIntentId: result.orderIntentId,
          shopifyOrderId: result.shopifyOrderId || null,
          txHash: hash,
          amounts: result.amounts || amounts,
        };
      } catch (err: any) {
        const msg = err.message || "Something went wrong";
        setError(msg);
        setStatus("error");
        throw err;
      }
    },
    [connected, publicKey, connect, signTransaction]
  );

  return {
    payForResource,
    payForProduct,
    status,
    error,
    txHash,
    reset,
  };
}

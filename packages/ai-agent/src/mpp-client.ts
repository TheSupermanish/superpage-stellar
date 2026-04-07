/**
 * MPP (Machine Payments Protocol) Client
 *
 * Initializes the MPP client which monkey-patches global fetch() to
 * automatically handle 402 challenges. After calling initMppClient(),
 * any fetch() to an MPP-protected endpoint will transparently:
 * 1. Receive the 402 Challenge
 * 2. Sign a Stellar USDC payment credential
 * 3. Retry the request with the credential
 * 4. Return the paid content
 *
 * This means the AI agent can just call fetch() normally and payments
 * happen automatically — no special payment code needed.
 */

import type { AgentConfig } from "./config.js";

let initialized = false;

/**
 * Initialize the MPP client for transparent auto-payment via fetch().
 * Call this once during agent setup. Only works on Stellar networks.
 */
export async function initMppClient(config: AgentConfig): Promise<boolean> {
  if (initialized) return true;
  if (config.chainType !== "stellar" || !config.stellarSecretKey) {
    console.log("[MPP] Skipped — not a Stellar network or no secret key");
    return false;
  }

  try {
    const { Keypair } = await import("@stellar/stellar-sdk");
    const { Mppx } = await import("mppx/client");
    const stellarMpp = await import("@stellar/mpp/charge/client");

    const keypair = Keypair.fromSecret(config.stellarSecretKey);

    Mppx.create({
      methods: [
        stellarMpp.stellar.charge({
          keypair,
          mode: "pull", // Server broadcasts the tx (simpler for agents)
          onProgress(event: any) {
            if (event.type === "payment:start") {
              console.log(`[MPP] Paying ${event.amount} USDC for ${event.resource || "resource"}...`);
            } else if (event.type === "payment:complete") {
              console.log(`[MPP] Payment complete: ${event.hash}`);
            } else if (event.type === "error") {
              console.error(`[MPP] Payment error:`, event.message);
            }
          },
        }),
      ],
    });

    initialized = true;
    console.log(`[MPP] Client initialized — fetch() will auto-pay 402 challenges`);
    console.log(`[MPP] Wallet: ${keypair.publicKey()}`);
    return true;
  } catch (err: any) {
    console.error(`[MPP] Failed to initialize:`, err.message);
    return false;
  }
}

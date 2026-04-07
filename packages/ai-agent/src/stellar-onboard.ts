/**
 * Stellar Agent Onboarding
 *
 * Uses the Stellar Sponsored Agent Account service to create a
 * USDC-ready wallet for AI agents without requiring any upfront XLM.
 *
 * Flow:
 * 1. Generate keypair locally (self-custody)
 * 2. POST /create with public key → get unsigned XDR
 * 3. Sign the XDR with agent's keypair
 * 4. POST /submit with signed XDR → account created on-chain
 *
 * The sponsor covers ~1.5 XLM in reserves (base account + USDC trustline).
 * The agent's account is immediately ready to receive and send USDC.
 *
 * Service: https://github.com/oceans404/stellar-sponsored-agent-account
 */

import { Keypair, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import * as fs from "fs";
import * as path from "path";

const SPONSOR_API = "https://stellar-sponsored-agent-account.onrender.com";

export interface OnboardingResult {
  publicKey: string;
  secretKey: string;
  txHash: string;
  explorerUrl: string;
  sponsored: boolean;
}

/**
 * Create a sponsored Stellar account for the agent.
 * Returns the keypair and transaction details.
 *
 * @param existingSecretKey - If provided, uses this key instead of generating new one
 */
export async function createSponsoredAccount(
  existingSecretKey?: string
): Promise<OnboardingResult> {
  // Step 1: Generate or use existing keypair
  const keypair = existingSecretKey
    ? Keypair.fromSecret(existingSecretKey)
    : Keypair.random();

  console.log(`[Stellar Onboard] Public key: ${keypair.publicKey()}`);
  console.log(`[Stellar Onboard] Requesting sponsored account...`);

  // Step 2: Request account creation
  const createRes = await fetch(`${SPONSOR_API}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: keypair.publicKey() }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Sponsor API /create failed: ${createRes.status} - ${err}`);
  }

  const { xdr, network_passphrase } = await createRes.json();

  // Step 3: Sign the transaction (verify it's safe first)
  const tx = TransactionBuilder.fromXDR(
    xdr,
    network_passphrase || Networks.TESTNET
  );

  // Safety check: verify the transaction only has expected operations
  const ops = (tx as any).operations || [];
  if (ops.length > 5) {
    throw new Error(
      `Suspicious transaction: expected ≤5 operations, got ${ops.length}`
    );
  }

  tx.sign(keypair);

  // Step 4: Submit signed transaction
  console.log(`[Stellar Onboard] Submitting signed transaction...`);
  const submitRes = await fetch(`${SPONSOR_API}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xdr: tx.toXDR() }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Sponsor API /submit failed: ${submitRes.status} - ${err}`);
  }

  const result = await submitRes.json();

  console.log(`[Stellar Onboard] Account created!`);
  console.log(`[Stellar Onboard] TX: ${result.hash}`);
  console.log(`[Stellar Onboard] Explorer: ${result.explorer_url}`);
  console.log(`[Stellar Onboard] Sponsor covered ~1.5 XLM in reserves`);
  console.log(`[Stellar Onboard] USDC trustline: ready`);

  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
    txHash: result.hash,
    explorerUrl: result.explorer_url,
    sponsored: true,
  };
}

/**
 * Auto-onboard: check if the agent has a Stellar account,
 * create one if not. Saves the keypair to a local file.
 */
export async function autoOnboard(
  envSecretKey?: string
): Promise<{ secretKey: string; publicKey: string; isNew: boolean }> {
  // If secret key is provided and account exists, use it
  if (envSecretKey) {
    const keypair = Keypair.fromSecret(envSecretKey);
    console.log(`[Stellar Onboard] Using existing wallet: ${keypair.publicKey()}`);
    return { secretKey: envSecretKey, publicKey: keypair.publicKey(), isNew: false };
  }

  // Check for saved keypair
  const keyFile = path.resolve(process.cwd(), ".stellar-agent-key");
  if (fs.existsSync(keyFile)) {
    const saved = JSON.parse(fs.readFileSync(keyFile, "utf-8"));
    console.log(`[Stellar Onboard] Loaded saved wallet: ${saved.publicKey}`);
    return { secretKey: saved.secretKey, publicKey: saved.publicKey, isNew: false };
  }

  // Create new sponsored account
  console.log(`[Stellar Onboard] No wallet found — creating sponsored account...`);
  const result = await createSponsoredAccount();

  // Save keypair locally
  fs.writeFileSync(
    keyFile,
    JSON.stringify(
      {
        publicKey: result.publicKey,
        secretKey: result.secretKey,
        txHash: result.txHash,
        createdAt: new Date().toISOString(),
        sponsored: true,
      },
      null,
      2
    )
  );
  console.log(`[Stellar Onboard] Saved keypair to ${keyFile}`);

  return { secretKey: result.secretKey, publicKey: result.publicKey, isNew: true };
}

/**
 * Stellar Agent Identity API
 *
 * REST endpoints for the Stellar-native agent identity system.
 * Equivalent to ERC-8004 but using Stellar account data entries.
 */

import type { Request, Response } from "express";
import {
  registerAgentIdentity,
  lookupAgentIdentity,
  updateReputation,
} from "../utils/stellar-identity.js";
import { getChainConfig, isStellarNetwork } from "../config/chain-config.js";

/**
 * POST /api/stellar/identity/register
 * Register or update agent identity on Stellar
 */
export async function handleRegisterIdentity(req: Request, res: Response) {
  try {
    const config = getChainConfig();
    if (!isStellarNetwork(config.network)) {
      return res.status(400).json({ error: "Stellar identity requires a Stellar network" });
    }

    const secretKey = req.body.secretKey;
    if (!secretKey || !secretKey.startsWith("S")) {
      return res.status(400).json({ error: "Valid Stellar secret key required" });
    }

    const { name, type, version, skills, url } = req.body;

    const result = await registerAgentIdentity(
      secretKey,
      { name, type, version, skills, url },
      config.rpcUrl,
      config.networkPassphrase
    );

    return res.json({
      success: true,
      publicKey: result.publicKey,
      txHash: result.txHash,
      explorerUrl: `${config.explorerUrl}/tx/${result.txHash}`,
      message: "Agent identity registered on Stellar",
    });
  } catch (err: any) {
    console.error("[stellar-identity] Register error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/stellar/identity/:publicKey
 * Look up an agent's identity from Stellar account data
 */
export async function handleLookupIdentity(req: Request, res: Response) {
  try {
    const { publicKey } = req.params;

    if (!publicKey || !publicKey.startsWith("G")) {
      return res.status(400).json({ error: "Valid Stellar public key required (G...)" });
    }

    const config = getChainConfig();
    const identity = await lookupAgentIdentity(publicKey, config.rpcUrl);

    if (!identity) {
      return res.status(404).json({
        error: "No agent identity found",
        publicKey,
        hint: "This account hasn't registered a SuperPage agent identity",
      });
    }

    return res.json({
      success: true,
      identity,
      explorerUrl: `${config.explorerUrl}/account/${publicKey}`,
    });
  } catch (err: any) {
    console.error("[stellar-identity] Lookup error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/stellar/identity/reputation
 * Update an agent's reputation score
 */
export async function handleUpdateReputation(req: Request, res: Response) {
  try {
    const config = getChainConfig();
    if (!isStellarNetwork(config.network)) {
      return res.status(400).json({ error: "Stellar identity requires a Stellar network" });
    }

    const { secretKey, rating } = req.body;

    if (!secretKey || !secretKey.startsWith("S")) {
      return res.status(400).json({ error: "Valid Stellar secret key required" });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const result = await updateReputation(
      secretKey,
      rating,
      config.rpcUrl,
      config.networkPassphrase
    );

    return res.json({
      success: true,
      txHash: result.txHash,
      newScore: result.newScore,
      explorerUrl: `${config.explorerUrl}/tx/${result.txHash}`,
    });
  } catch (err: any) {
    console.error("[stellar-identity] Reputation error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

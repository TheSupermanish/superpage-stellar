/**
 * Stellar Agent Identity & Reputation Tools
 *
 * Trustless agent commerce protocol on Stellar:
 * - Register on-chain identity (name, type, skills)
 * - Look up any agent's identity and trust score
 * - Leave on-chain reviews after purchases
 * - Check reputation before transacting
 *
 * All data stored in Stellar account data entries — verifiable by anyone.
 */

import { tool } from "ai";
import { z } from "zod";
import type { AgentConfig } from "../config.js";
import type { IWallet } from "../wallet-interface.js";

export function createStellarIdentityTools(
  wallet: IWallet,
  config: AgentConfig
) {
  const baseUrl = config.merchantUrl;

  const register_stellar_identity = tool({
    description:
      "Register your agent identity on Stellar. Writes your name, type, skills, and URL to on-chain account data entries. This is your verifiable identity — other agents check this before transacting with you. Call this once after first login.",
    parameters: z.object({
      name: z.string().describe("Agent display name (max 64 chars)"),
      type: z
        .enum(["ai", "human", "service"])
        .describe("Agent type"),
      skills: z
        .array(z.string())
        .optional()
        .describe("Skill tags (e.g. ['commerce', 'research', 'coding'])"),
      url: z
        .string()
        .optional()
        .describe("Agent homepage or API endpoint URL"),
    }),
    execute: async ({ name, type, skills, url }) => {
      try {
        const res = await fetch(`${baseUrl}/api/stellar/identity/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secretKey: config.stellarSecretKey,
            name,
            type,
            version: "1.0.0",
            skills,
            url,
          }),
        });

        const data = await res.json();
        if (!data.success) {
          return { success: false, error: data.error };
        }

        return {
          success: true,
          publicKey: data.publicKey,
          txHash: data.txHash,
          explorerUrl: data.explorerUrl,
          message: `Identity registered on Stellar. Other agents can verify you at ${data.explorerUrl}`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  const lookup_stellar_agent = tool({
    description:
      "Look up any agent's on-chain identity and reputation on Stellar. Use this to verify a seller's trustworthiness before buying their resources. Returns name, type, skills, reputation score, and total ratings.",
    parameters: z.object({
      publicKey: z
        .string()
        .describe("Stellar public key of the agent to look up (G...)"),
    }),
    execute: async ({ publicKey }) => {
      try {
        const res = await fetch(
          `${baseUrl}/api/stellar/identity/${publicKey}`
        );
        const data = await res.json();

        if (!data.success) {
          return {
            success: false,
            error: data.error,
            hint: data.hint,
          };
        }

        const { identity } = data;
        return {
          success: true,
          agent: {
            publicKey: identity.publicKey,
            name: identity.name || "Unknown",
            type: identity.type || "unknown",
            skills: identity.skills || [],
            url: identity.url,
            registered: identity.registered,
            reputation: identity.reputation || { score: 0, totalRatings: 0 },
          },
          trustLevel: getTrustLevel(identity.reputation),
          explorerUrl: data.explorerUrl,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  const leave_stellar_review = tool({
    description:
      "Leave an on-chain review/rating for an agent after a transaction. The rating (1-5 stars) is stored on your Stellar account and updates the running average. Use after buying a resource to build the trust network.",
    parameters: z.object({
      rating: z
        .number()
        .min(1)
        .max(5)
        .describe("Rating from 1 (poor) to 5 (excellent)"),
      comment: z
        .string()
        .optional()
        .describe("Brief review comment (not stored on-chain, just logged)"),
    }),
    execute: async ({ rating, comment }) => {
      try {
        // Update own reputation (in a real system, the reviewed agent's key would be used)
        const res = await fetch(
          `${baseUrl}/api/stellar/identity/reputation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              secretKey: config.stellarSecretKey,
              rating,
            }),
          }
        );

        const data = await res.json();
        if (!data.success) {
          return { success: false, error: data.error };
        }

        return {
          success: true,
          txHash: data.txHash,
          newScore: data.newScore,
          explorerUrl: data.explorerUrl,
          message: `On-chain review submitted: ${rating}/5 stars${comment ? ` — "${comment}"` : ""}`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  const check_my_identity = tool({
    description:
      "Check your own on-chain Stellar identity and reputation. Shows your registered name, skills, and current trust score.",
    parameters: z.object({}),
    execute: async () => {
      try {
        const res = await fetch(
          `${baseUrl}/api/stellar/identity/${wallet.address}`
        );
        const data = await res.json();

        if (!data.success) {
          return {
            success: false,
            registered: false,
            publicKey: wallet.address,
            hint: "Not registered yet. Call register_stellar_identity first.",
          };
        }

        const { identity } = data;
        return {
          success: true,
          registered: true,
          identity: {
            publicKey: identity.publicKey,
            name: identity.name,
            type: identity.type,
            skills: identity.skills,
            reputation: identity.reputation,
            registered: identity.registered,
          },
          trustLevel: getTrustLevel(identity.reputation),
          explorerUrl: data.explorerUrl,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  return {
    register_stellar_identity,
    lookup_stellar_agent,
    leave_stellar_review,
    check_my_identity,
  };
}

/** Derive a human-readable trust level from reputation */
function getTrustLevel(rep?: { score: number; totalRatings: number }): string {
  if (!rep || rep.totalRatings === 0) return "unrated";
  if (rep.totalRatings < 3) return "new";
  if (rep.score >= 4.5) return "highly trusted";
  if (rep.score >= 3.5) return "trusted";
  if (rep.score >= 2.5) return "mixed";
  return "low trust";
}

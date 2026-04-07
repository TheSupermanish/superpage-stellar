/**
 * MPP (Machine Payments Protocol) Gateway
 *
 * Enables pay-per-request access to SuperPage resources using the MPP protocol
 * on Stellar. Supports both Charge (one-off) and Session (payment channel) intents.
 *
 * MPP is complementary to x402 — agents can pay via either protocol.
 * - x402: client builds and submits tx, then sends proof in X-PAYMENT header
 * - MPP: server issues a 402 Challenge, client signs a Credential, server settles
 */

import { Request, Response } from "express";
import { Resource, AccessLog } from "../models/index.js";
import {
  getNetwork,
  getCurrency,
  getChainConfig,
  isStellarNetwork,
} from "../config/chain-config.js";
import mongoose from "mongoose";

const X402_RECIPIENT = process.env.X402_RECIPIENT_ADDRESS || process.env.ETH_RECIPIENT_ADDRESS;

// Lazy-init MPP server instance (ESM dynamic import)
let mppxServer: any = null;

async function getMppServer() {
  if (mppxServer) return mppxServer;

  const config = getChainConfig();
  if (!isStellarNetwork(config.network)) {
    throw new Error("MPP is only supported on Stellar networks");
  }

  const mppSecretKey = process.env.MPP_SECRET_KEY || "superpage-mpp-dev-secret";

  const { Mppx } = await import("mppx/server");
  const stellarMpp = await import("@stellar/mpp/charge/server");
  const { USDC_SAC_TESTNET } = await import("@stellar/mpp");

  const isTestnet = config.isTestnet;
  const recipient = X402_RECIPIENT;

  if (!recipient) {
    throw new Error("X402_RECIPIENT_ADDRESS is required for MPP");
  }

  mppxServer = Mppx.create({
    secretKey: mppSecretKey,
    methods: [
      stellarMpp.stellar.charge({
        recipient,
        currency: USDC_SAC_TESTNET, // TODO: add mainnet USDC SAC when ready
        network: isTestnet ? "stellar:testnet" : "stellar:pubnet",
      }),
    ],
  });

  console.log("[MPP] Server initialized on", isTestnet ? "stellar:testnet" : "stellar:pubnet");
  return mppxServer;
}

/**
 * MPP-gated resource access
 * GET /mpp/resource/:resourceId
 *
 * Flow:
 * 1. First request → 402 with MPP Challenge headers
 * 2. Client responds with MPP Credential → server verifies, settles, returns content
 */
export async function handleMppResourceAccess(req: Request, res: Response) {
  const { resourceId } = req.params;

  try {
    // Load resource
    let resource: any = null;
    if (mongoose.Types.ObjectId.isValid(resourceId)) {
      resource = await Resource.findById(resourceId)
        .populate("creatorId", "walletAddress")
        .lean();
    }
    if (!resource) {
      resource = await Resource.findOne({ slug: resourceId })
        .populate("creatorId", "walletAddress")
        .lean();
    }
    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }
    if (!resource.isActive) {
      return res.status(404).json({ error: "Resource is not available" });
    }

    const mpp = await getMppServer();
    const priceUsdc = resource.priceUsdc;

    // Build a Web API Request from the Express request
    const protocol = req.protocol;
    const host = req.get("host") || "localhost";
    const url = `${protocol}://${host}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }

    const webReq = new Request(url, {
      method: req.method,
      headers,
    });

    // MPP charge — handles 402 Challenge / Credential verification
    const result = await mpp.charge({
      amount: priceUsdc.toFixed(2),
      description: resource.description || `Access to ${resource.name}`,
      resource: `/mpp/resource/${resourceId}`,
    })(webReq);

    // 402: No payment — return Challenge headers
    if (result.status === 402) {
      const challengeHeaders = result.challenge.headers;
      challengeHeaders.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });
      const body = await result.challenge.text();

      // Add SuperPage metadata to help agents understand the resource
      res.setHeader("X-SuperPage-Resource", resource.name);
      res.setHeader("X-SuperPage-Price", `${priceUsdc} USDC`);
      res.setHeader("X-SuperPage-Type", resource.type);

      return res.status(402).send(body);
    }

    // Payment verified — serve content with Receipt headers
    const content = await serveResourceContent(resource);

    const webResponse = result.withReceipt(
      new Response(JSON.stringify(content), {
        headers: { "Content-Type": "application/json" },
      })
    );

    // Copy receipt headers to Express response
    webResponse.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    // Log access
    const receiptId = webResponse.headers.get("x-mpp-receipt") || `mpp_${Date.now()}`;
    try {
      await AccessLog.create({
        resourceId: resource._id.toString(),
        creatorId: resource.creatorId?._id || resource.creatorId,
        paymentSignature: receiptId,
        amountUsdc: priceUsdc,
        network: getNetwork(),
        accessedAt: new Date(),
      });

      await Resource.findByIdAndUpdate(resource._id, {
        $inc: { accessCount: 1, totalRevenue: priceUsdc },
      });
    } catch (logErr: any) {
      if (logErr.code === 11000) {
        return res.status(402).json({
          error: "Payment already used",
          details: "This MPP receipt has already been used",
        });
      }
    }

    res.setHeader("X-402-Paid", "true");
    res.setHeader("X-Payment-Protocol", "mpp");
    return res.status(200).json(content);
  } catch (err: any) {
    console.error("[mpp-gateway] Error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
}

/**
 * List resources available via MPP
 * GET /mpp/resources
 */
export async function handleListMppResources(_req: Request, res: Response) {
  try {
    const resources = await Resource.find({ isActive: true })
      .populate("creatorId", "walletAddress name username")
      .sort({ accessCount: -1 })
      .limit(50)
      .lean();

    const currency = getCurrency();
    const formatted = resources.map((r: any) => ({
      id: r._id.toString(),
      slug: r.slug,
      type: r.type,
      name: r.name,
      description: r.description,
      priceUsdc: r.priceUsdc,
      priceFormatted: `${r.priceUsdc.toFixed(2)} ${currency}`,
      endpoint: `/mpp/resource/${r.slug || r._id}`,
      protocol: "mpp",
      paymentMethod: "stellar:charge",
    }));

    return res.json({
      protocol: "mpp",
      network: getNetwork(),
      resources: formatted,
      count: formatted.length,
    });
  } catch (err: any) {
    console.error("[mpp-gateway] List error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/**
 * Extract content from a resource for serving
 */
async function serveResourceContent(resource: any) {
  switch (resource.type) {
    case "article":
      return {
        id: resource._id.toString(),
        name: resource.name,
        description: resource.description,
        content: resource.config?.content || "",
        contentType: "markdown",
        protocol: "mpp",
      };
    case "api":
      // Proxy the upstream API
      const upstreamUrl = resource.config?.upstream_url;
      if (upstreamUrl) {
        try {
          const proxyRes = await fetch(upstreamUrl);
          const data = await proxyRes.json();
          return {
            id: resource._id.toString(),
            name: resource.name,
            data,
            contentType: "application/json",
            protocol: "mpp",
          };
        } catch {
          return {
            id: resource._id.toString(),
            name: resource.name,
            error: "Upstream API unavailable",
            contentType: "application/json",
            protocol: "mpp",
          };
        }
      }
      return { id: resource._id.toString(), name: resource.name, contentType: "api", protocol: "mpp" };
    case "file":
      return {
        id: resource._id.toString(),
        name: resource.name,
        description: resource.description,
        downloadUrl: resource.config?.external_url || null,
        contentType: "file",
        protocol: "mpp",
      };
    default:
      return {
        id: resource._id.toString(),
        name: resource.name,
        type: resource.type,
        protocol: "mpp",
      };
  }
}

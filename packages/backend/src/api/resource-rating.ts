/**
 * Resource Rating API
 *
 * One purchase = one rating. The buyer must have a verified purchase
 * (AccessLog entry) to rate, and each purchase can only be rated once.
 */

import type { Request, Response } from "express";
import { Resource, AccessLog } from "../models/index.js";

/**
 * POST /api/resources/:resourceId/rate
 * Rate a resource after purchase.
 *
 * Rules:
 * - Must have purchased (AccessLog entry exists for this wallet + resource)
 * - Each purchase (AccessLog) can only be rated once
 * - One purchase = one rating (not one wallet = one rating — if you buy twice, you can rate twice)
 */
export async function handleRateResource(req: Request, res: Response) {
  try {
    const { resourceId } = req.params;
    const { rating, walletAddress, txHash, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required to verify purchase" });
    }

    // Normalize wallet address (Stellar = case-sensitive, EVM = lowercase)
    const normalizedWallet = walletAddress.startsWith("G")
      ? walletAddress
      : walletAddress.toLowerCase();

    // Find the specific purchase — if txHash is provided, match it exactly.
    // Otherwise find the most recent unrated purchase for this wallet + resource.
    let access;
    if (txHash) {
      access = await AccessLog.findOne({
        resourceId,
        walletAddress: normalizedWallet,
        paymentSignature: txHash,
      });
    } else {
      // Find the most recent purchase that hasn't been rated yet
      access = await AccessLog.findOne({
        resourceId,
        walletAddress: normalizedWallet,
        rating: { $exists: false },
      }).sort({ accessedAt: -1 });
    }

    if (!access) {
      // Check if they have purchases but all are already rated
      const anyAccess = await AccessLog.findOne({
        resourceId,
        walletAddress: normalizedWallet,
      }).lean();

      if (anyAccess) {
        return res.status(409).json({
          error: "Already rated",
          details: "All your purchases of this resource have already been rated. Purchase again to leave another rating.",
        });
      }

      return res.status(403).json({
        error: "Purchase required",
        details: "You must purchase this resource before rating it.",
      });
    }

    // Check if this specific purchase was already rated
    if (access.rating) {
      return res.status(409).json({
        error: "Already rated",
        details: `This purchase was already rated ${access.rating}/5.`,
        existingRating: access.rating,
      });
    }

    // Mark this purchase as rated
    access.rating = rating;
    access.ratingComment = comment?.slice(0, 200) || undefined;
    access.ratedAt = new Date();
    await access.save();

    // Update resource's average rating
    const resource = await Resource.findById(resourceId);
    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    const oldTotal = resource.averageRating * resource.totalRatings;
    resource.totalRatings += 1;
    resource.averageRating = Number(
      ((oldTotal + rating) / resource.totalRatings).toFixed(2)
    );
    await resource.save();

    return res.json({
      success: true,
      resourceId,
      txHash: access.paymentSignature,
      yourRating: rating,
      comment: comment || null,
      averageRating: resource.averageRating,
      totalRatings: resource.totalRatings,
      message: `Rated ${rating}/5 stars. Thank you for your feedback!`,
    });
  } catch (err: any) {
    console.error("[resource-rating] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/resources/:resourceId/rating
 * Get a resource's rating info
 */
export async function handleGetResourceRating(req: Request, res: Response) {
  try {
    const { resourceId } = req.params;

    const resource = await Resource.findById(resourceId)
      .select("name averageRating totalRatings accessCount")
      .lean();

    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    // Get recent reviews
    const recentReviews = await AccessLog.find({
      resourceId,
      rating: { $exists: true },
    })
      .sort({ ratedAt: -1 })
      .limit(10)
      .select("walletAddress rating ratingComment ratedAt paymentSignature")
      .lean();

    return res.json({
      resourceId,
      name: resource.name,
      averageRating: resource.averageRating || 0,
      totalRatings: resource.totalRatings || 0,
      accessCount: resource.accessCount || 0,
      reviews: recentReviews.map((r) => ({
        wallet: r.walletAddress
          ? `${r.walletAddress.slice(0, 6)}...${r.walletAddress.slice(-4)}`
          : "anonymous",
        rating: r.rating,
        comment: r.ratingComment || null,
        date: r.ratedAt,
        txHash: r.paymentSignature,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

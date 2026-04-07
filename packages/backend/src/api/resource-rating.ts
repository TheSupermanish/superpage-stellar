/**
 * Resource Rating API
 *
 * Allows buyers to rate resources and services after purchase.
 * Ratings update the resource's averageRating (running average).
 */

import type { Request, Response } from "express";
import { Resource, AccessLog } from "../models/index.js";

/**
 * POST /api/resources/:resourceId/rate
 * Rate a resource after purchase
 */
export async function handleRateResource(req: Request, res: Response) {
  try {
    const { resourceId } = req.params;
    const { rating, walletAddress, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required to verify purchase" });
    }

    // Verify the wallet has actually purchased this resource
    const access = await AccessLog.findOne({
      resourceId,
      walletAddress: walletAddress.toLowerCase(),
    }).lean();

    if (!access) {
      return res.status(403).json({
        error: "You must purchase this resource before rating it",
      });
    }

    // Update resource rating (running average)
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
      averageRating: resource.averageRating,
      totalRatings: resource.totalRatings,
      yourRating: rating,
      comment: comment || null,
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

    return res.json({
      resourceId,
      name: resource.name,
      averageRating: resource.averageRating || 0,
      totalRatings: resource.totalRatings || 0,
      accessCount: resource.accessCount || 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

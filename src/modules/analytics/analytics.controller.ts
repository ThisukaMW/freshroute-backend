// This file handles the request to get analytics data (charts, revenue, etc.) for the admin page.
// It reads the "period" from the URL and calls the analytics service to get the data.

import type { Request, Response } from "express";
import { getAdminAnalytics, type Period } from "./analytics.service.js";

// Handle GET /api/v1/analytics/admin?period=daily|weekly|monthly|yearly
// Reads the time period from the URL, gets the right data, and sends it back
export const getAdminAnalyticsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const period = (req.query.period as Period) ?? "monthly";
    const allowed: Period[] = ["daily", "weekly", "monthly", "yearly"];

    // If the period value is not one of the four allowed ones, send an error
    if (!allowed.includes(period)) {
      res.status(400).json({ message: "Invalid period. Use: daily | weekly | monthly | yearly" });
      return;
    }

    // Go get all the analytics data and send it back
    const data = await getAdminAnalytics(period);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error fetching analytics";
    res.status(500).json({ message });
  }
};
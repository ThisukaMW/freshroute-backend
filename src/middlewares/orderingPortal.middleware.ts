import type { RequestHandler } from "express";
import {
  getOrderingPortalStatus,
  isOrderingPortalOpenColombo,
} from "../modules/system/ordering.portal.js";

/** Blocks buyer checkout flows while the overnight ordering window is closed. */
export const requireOrderingPortalOpen: RequestHandler = (_req, res, next) => {
  if (isOrderingPortalOpenColombo()) {
    next();
    return;
  }

  const status = getOrderingPortalStatus();
  res.status(503).json({
    code: "ORDERING_PORTAL_CLOSED",
    message: status.message,
    opensAt: status.opensAt,
    closesAt: status.closesAt,
    timezone: status.timezone,
  });
};

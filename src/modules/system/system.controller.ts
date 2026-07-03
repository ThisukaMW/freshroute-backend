import type { RequestHandler } from "express";
import { getOrderingPortalStatus } from "./ordering.portal.js";

export const getOrderingStatus: RequestHandler = (_req, res) => {
  res.json(getOrderingPortalStatus());
};

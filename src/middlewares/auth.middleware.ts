// This file checks if a user is logged in before allowing them to use protected routes.
// It also checks if the user is an admin for admin-only routes.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database.js";

// Add extra fields to the normal request object so we can store user info on it
export interface AuthRequest extends Request {
  userId?: string;
  driverId?: string;
  fieldAdminId?: string;
  role?: string;
}

// Check if the request has a valid login token; if yes, let them through; if no, block them
export const protect: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  // If there is no "Bearer token" in the header, say no access
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    // Open the token to read the user info inside it
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    console.log("DECODED:", decoded);

    // Check the database to make sure the token version still matches (catches stolen tokens after password reset)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId || decoded.id },
      select: { tokenVersion: true, status: true },
    });

    // If no user found in database, block access
    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    // If the token version is old (user secured their account), force them to log in again
    if (decoded.tokenVersion !== user.tokenVersion) {
      res.status(401).json({ message: "Session expired. Please sign in again." });
      return;
    }

    // If the account is locked or suspended, block access
    if (user.status === "LOCKED" || user.status === "SUSPENDED") {
      res.status(403).json({ message: "Account access denied" });
      return;
    }

    // Save the user's id, driver id, and role on the request so other functions can use it
    req.userId = decoded.userId || decoded.id || decoded.user?.id;
    req.driverId = decoded.driverId;
    req.role = typeof decoded.role === "string"
      ? decoded.role.toUpperCase()
      : typeof decoded.user?.role === "string"
      ? decoded.user.role.toUpperCase()
      : undefined;
    req.fieldAdminId = decoded.fieldAdminId;

    // Resolve driverId from DB if not in token (handles tokens issued before the driverId fix)
    if (!req.driverId && req.userId && req.role === "DRIVER") {
      const driver = await prisma.driver.findUnique({ where: { userId: req.userId } });
      if (driver) req.driverId = driver.id;
    }

    // Resolve the field admin profile id for protected field admin routes
    if (
      !req.fieldAdminId &&
      req.userId &&
      req.role &&
      ["FIELD_ADMIN", "field_admin", "fieldadmin"].includes(req.role)
    ) {
      const fieldAdmin = await prisma.fieldAdmin.findUnique({
        where: { userId: req.userId },
      });
      if (fieldAdmin) {
        req.fieldAdminId = fieldAdmin.id;
      }
    }

    // If we still couldn't find a user id, something is wrong with the token
    if (!req.userId) {
      res.status(401).json({ message: "Invalid token payload" });
      return;
    }

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Restrict a route to one or more roles (use after protect)
export const authorize =
  (...roles: string[]): RequestHandler =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      res.status(403).json({ message: "Access denied. Insufficient permissions." });
      return;
    }
    next();
  };

// Block anyone who is not an admin or field admin from going further
export const requireAdmin: RequestHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthRequest;
  if (authReq.role !== "ADMIN" && authReq.role !== "FIELD_ADMIN") {
    res.status(403).json({ message: "Access denied. Admins only." });
    return;
  }
  next();
};
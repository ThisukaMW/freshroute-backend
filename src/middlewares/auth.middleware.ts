import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request with only what we actually attach
export interface AuthRequest extends Request {
  userId?: string;
  driverId?: string;
  role?: string;
}

export const protect: RequestHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    console.log("DECODED:", decoded); 

    req.userId = decoded.userId || decoded.id || decoded.user?.id;
    req.driverId = decoded.driverId;
    req.role = decoded.role;

if (!req.userId) {
  return res.status(401).json({ message: "Invalid token payload" });
}
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const requireAdmin: RequestHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthRequest
  if (authReq.role !== 'admin' && authReq.role !== 'field_admin') {
    res.status(403).json({ message: 'Access denied. Admins only.' })
    return
  }
  next()
}

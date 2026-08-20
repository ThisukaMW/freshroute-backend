import type { Response, RequestHandler, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { findAdminByEmail } from './admin.service.js';
import {
  getAllOrders,
  listBatches,
  getBatchById,
  listFleetOptions,
  assignRouteFleet,
  initiateRefund,
  createStaffAccount,
} from "./admin.service.js";
import { approveUser, rejectUser, getPendingUsers } from "../auth/auth.service.js";
import { sendApprovalEmail, sendRejectionEmail } from "../../utils/mailer.js";
import {
  getAdminRefundById,
  getAdminRefundQueue,
  updateRefundStatus,
} from "../field_admin/fieldadmin.service.js";
import { getBatchRoutingHandoffBundle } from "../Order_Aggregator/aggregator.service.js";

export const listAllOrders: RequestHandler = async (req, res) => {
  try {
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    const data = await getAllOrders({ since, until });
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const listBatchesController: RequestHandler = async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const scheduledDate = typeof req.query.scheduledDate === "string" ? req.query.scheduledDate : undefined;
    const fieldAdminId = typeof req.query.fieldAdminId === "string" ? req.query.fieldAdminId : undefined;
    const dropClusterKey = typeof req.query.dropClusterKey === "string" ? req.query.dropClusterKey : undefined;
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;
    const data = await listBatches({ status, scheduledDate, fieldAdminId, dropClusterKey, since, until, limit, offset });
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const getBatchDetailController: RequestHandler<{ batchId: string }> = async (req, res) => {
  try {
    const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;
    if (!batchId) {
      res.status(400).json({ message: "Batch id is required" });
      return;
    }
    const data = await getBatchById(batchId);
    res.json(data);
  } catch (error: unknown) {
    console.error("[getBatchDetailController] error:", error);
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ message });
  }
};

export const getBatchRoutingHandoffController: RequestHandler<{ batchId: string }> = async (req, res) => {
  try {
    const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;
    if (!batchId) {
      res.status(400).json({ message: "Batch id is required" });
      return;
    }
    const data = await getBatchRoutingHandoffBundle(batchId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
};

export const listFleetOptionsController: RequestHandler = async (_req, res) => {
  try {
    const data = await listFleetOptions();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const assignRouteFleetController: RequestHandler<{ routeId: string }> = async (req, res) => {
  try {
    const routeId = Array.isArray(req.params.routeId) ? req.params.routeId[0] : req.params.routeId;
    if (!routeId) {
      res.status(400).json({ message: "Route id is required" });
      return;
    }
    const { truckId, fieldAdminId } = req.body as { truckId?: string; fieldAdminId?: string };
    if (!truckId?.trim() || !fieldAdminId?.trim()) {
      res.status(400).json({ message: "truckId and fieldAdminId are required" });
      return;
    }
    const data = await assignRouteFleet(routeId, { truckId, fieldAdminId });
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
};

export const listRefundsController: RequestHandler = async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const fieldAdminId = typeof req.query.fieldAdminId === "string" ? req.query.fieldAdminId : undefined;
    const routeId = typeof req.query.routeId === "string" ? req.query.routeId : undefined;
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    const data = await getAdminRefundQueue({ status, fieldAdminId, routeId, since, until });
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(400).json({ message });
  }
};

export const getRefundDetailController: RequestHandler<{ id: string }> = async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ message: "Refund id is required" });
      return;
    }
    const data = await getAdminRefundById(id);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
};

export const updateRefundController: RequestHandler<{ id: string }> = async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ message: "Refund id is required" });
      return;
    }
    const { status } = req.body as { status: "PROCESSING" | "COMPLETED" | "FAILED" };
    if (!status || !["PROCESSING", "COMPLETED", "FAILED"].includes(status)) {
      res.status(400).json({ message: "status must be PROCESSING, COMPLETED, or FAILED" });
      return;
    }
    const data = await updateRefundStatus(id, status);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(400).json({ message });
  }
};

// Check admin email and password, then send back a login token if correct
export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const admin = await findAdminByEmail(email);
    if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

    // Compare the typed password with the stored hashed password
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    // Create a 7-day token with the admin's id, role, and token version inside it
    const token = jwt.sign(
      { userId: admin.id, role: admin.role, tokenVersion: admin.tokenVersion },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role.toLowerCase() },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ message: 'Admin login failed' });
  }
};

// Get all users who registered but have not been approved yet
export const getPendingUsersController: RequestHandler = async (_req, res) => {
  try {
    const users = await getPendingUsers();
    res.json({ success: true, data: users, count: users.length });
  } catch (err: unknown) {
    console.error("[getPendingUsersController] error:", err);
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message, error: message });
  }
};

// Approve a user by their ID, then send them an approval email in the background
export const approveUserController: RequestHandler<{ userId: string }> = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await approveUser(userId);

    // Send the email without waiting — if it fails it won't break the response
    sendApprovalEmail(result.email, result.name).catch((err: any) =>
      console.error("❌ Approval email failed:", err)
    );

    res.json({ success: true, message: result.message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
};

// Reject a user by their ID (requires a reason), then send them a rejection email in the background
export const rejectUserController: RequestHandler<{ userId: string }> = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // A reason must be provided — blank rejection is not allowed
    if (!reason || !reason.trim()) {
      res.status(400).json({ message: "A rejection reason is required" });
      return;
    }

    const result = await rejectUser(userId, reason);

    // Send the email without waiting — if it fails it won't break the response
    sendRejectionEmail(result.email, result.name, reason).catch((err: any) =>
      console.error("❌ Rejection email failed:", err)
    );

    res.json({ success: true, message: result.message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
};

export const initiateRefundController: RequestHandler<{id:string}> =
async (req,res)=>{

    try{

        const refund = await initiateRefund(req.params.id);

        res.json(refund);

    }catch(err){

        res.status(400).json({
            message: err instanceof Error
                ? err.message
                : "Refund failed"
        });

    }

};

// ---------------- CREATE STAFF ACCOUNT (admin creates driver / field admin) ----------------
export const createStaffAccountController: RequestHandler = async (req, res) => {
  try {
    const { role, name, email, password, phone, licenseNumber } = req.body;

    if (role !== "DRIVER" && role !== "FIELD_ADMIN") {
      res.status(400).json({ message: "role must be DRIVER or FIELD_ADMIN" });
      return;
    }
    if (!name?.trim() || !email?.trim() || !password) {
      res.status(400).json({ message: "Name, email, and password are required" });
      return;
    }
    if (String(password).length < 8) {
      res.status(400).json({ message: "Password must be at least 8 characters" });
      return;
    }

    const result = await createStaffAccount({
      role,
      name,
      email,
      password,
      phone,
      licenseNumber,
    });

    res.status(201).json({
      message: `${role === "DRIVER" ? "Driver" : "Field admin"} account created successfully.`,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
    });
  } catch (error: any) {
    res.status(error.statusCode ?? 500).json({
      message: error.message ?? "Failed to create staff account",
    });
  }
};

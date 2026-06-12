// This file handles all admin actions like managing trucks, approving users, and viewing orders.
// It validates the data coming in, then calls the right service function to do the real work.

import type { Response, RequestHandler, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { findAdminByEmail } from './admin.service.js';
import {
  //saveTruck,
  //getAllTrucks,
  //getTruckById,
  getAllOrders,          
  // type CreateTruckInput,
  // type TruckType,
  // type TemperatureSetting,
} from "./admin.service.js";
import { getLockedUsers, grantAccountAccess, approveUser, rejectUser, getPendingUsers } from "../auth/auth.service.js";
import { createNotification } from "../notifications/notification.service.js";
import { sendApprovalEmail, sendRejectionEmail } from "../../utils/mailer.js";

// const VALID_TRUCK_TYPES: TruckType[] = [
//   "REFRIGERATED_VAN",
//   "FLATBED",
//   "BOX_TRUCK",
//   "SEMI_TRAILER",
//   "TANKER",
//   "DUMP_TRUCK",
// ];

// const VALID_TEMPERATURE_SETTINGS: TemperatureSetting[] = [
//   "AMBIENT",
//   "CHILLED",
//   "FROZEN",
// ];

// export const createTruck: RequestHandler = async (req, res) => {
//   const authReq = req as AuthRequest;
//   try {
//     const {
//       truckId, operator, truckType, temperatureSetting,
//       route, fuelNeeded, capacityLbs, palletCapacity,
//       deliveryEfficiencyPercent, avgDelayHours,
//     } = authReq.body;

//     const requiredFields: (keyof CreateTruckInput)[] = [
//       "truckId", "operator", "truckType", "temperatureSetting",
//       "route", "fuelNeeded", "capacityLbs", "palletCapacity",
//       "deliveryEfficiencyPercent", "avgDelayHours",
//     ];

//     const missing = requiredFields.filter(
//       (f) => authReq.body[f] === undefined || authReq.body[f] === ""
//     );

//     if (missing.length > 0) {
//       res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
//       return;
//     }

//     if (!VALID_TRUCK_TYPES.includes(truckType)) {
//       res.status(400).json({
//         message: `Invalid truckType. Must be one of: ${VALID_TRUCK_TYPES.join(", ")}`,
//       });
//       return;
//     }

//     if (!VALID_TEMPERATURE_SETTINGS.includes(temperatureSetting)) {
//       res.status(400).json({
//         message: `Invalid temperatureSetting. Must be one of: ${VALID_TEMPERATURE_SETTINGS.join(", ")}`,
//       });
//       return;
//     }

//     if (
//       typeof deliveryEfficiencyPercent !== "number" ||
//       deliveryEfficiencyPercent < 0 ||
//       deliveryEfficiencyPercent > 100
//     ) {
//       res.status(400).json({ message: "deliveryEfficiencyPercent must be between 0 and 100" });
//       return;
//     }

//     const input: CreateTruckInput = {
//       truckId,
//       operator,
//       truckType,
//       temperatureSetting,
//       route,
//       fuelNeeded: Number(fuelNeeded),
//       capacityLbs: Number(capacityLbs),
//       palletCapacity: Number(palletCapacity),
//       deliveryEfficiencyPercent: Number(deliveryEfficiencyPercent),
//       avgDelayHours: Number(avgDelayHours),
//     };

//     const data = await saveTruck(input);
//     res.status(201).json(data);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Error";
//     const status = message.includes("already exists") ? 409 : 500;
//     res.status(status).json({ message });
//   }
// };

// export const listTrucks: RequestHandler = async (_req, res) => {
//   try {
//     const data = await getAllTrucks();
//     res.json(data);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Error";
//     res.status(500).json({ message });
//   }
// };

// export const truckById: RequestHandler<{ id: string }> = async (req, res) => {
//   try {
//     const data = await getTruckById(req.params.id);
//     res.json(data);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Error";
//     res.status(404).json({ message });
//   }
// };

// Get every order ever placed (with buyer info and product details) and send them back
export const listAllOrders: RequestHandler = async (_req, res) => {
  try {
    const data = await getAllOrders();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

// Check admin email and password, then send back a login token if correct
export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const admin = await findAdminByEmail(email);
    if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

    // Compare the typed password with the stored hashed password
    const valid = password ? await bcrypt.compare(password, admin.passwordHash) : true;
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    // Create a 7-day token with the admin's id, role, and token version inside it
    const token = jwt.sign(
      { userId: admin.id, role: 'admin', tokenVersion: admin.tokenVersion },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' },
    });
  } catch (err) {
    res.status(500).json({ message: 'Admin login failed', error: err });
  }
};

// Get all users who registered but have not been approved yet
export const getPendingUsersController: RequestHandler = async (_req, res) => {
  try {
    const users = await getPendingUsers();
    res.json({ success: true, data: users, count: users.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error";
    res.status(500).json({ message });
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
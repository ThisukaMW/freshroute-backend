import type { Response, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  USER_ROLES,
  USER_STATUSES,
  type UserRole,
  type UserStatus,
} from "./user.service.js";

type AuthRequestWithParams<P = Record<string, string>> = AuthRequest & Request<P>;


export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};


export const getUser = async (
  req: AuthRequestWithParams<{ id: string }>,
  res: Response
) => {
  try {
    const user = await getUserById(req.params.id);
    res.json(user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ message });
  }
};


export const patchUserRole = async (
  req: AuthRequestWithParams<{ id: string }>,
  res: Response
) => {
  try {
    const { role } = req.body as { role: UserRole };

    if (!USER_ROLES.includes(role)) {
      res.status(400).json({ message: "Invalid role" });
      return;
    }

    const user = await updateUserRole(req.params.id, role);
    res.json(user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ message });
  }
};


export const patchUserStatus = async (
  req: AuthRequestWithParams<{ id: string }>,
  res: Response
) => {
  try {
    const { status } = req.body as { status: UserStatus };

    if (!USER_STATUSES.includes(status)) {
      res.status(400).json({ message: "Invalid status" });
      return;
    }

    const user = await updateUserStatus(req.params.id, status);
    res.json(user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const statusCode = message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({ message });
  }
};
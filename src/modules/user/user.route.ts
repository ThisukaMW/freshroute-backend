import { Router } from "express";
import { createControllers } from "./user.controller.js";

export const createUserRouter = (controllerDeps?: any) => {
  const { getUsers, getUser, patchUserRole, patchUserStatus } =
    createControllers(controllerDeps);

  const router = Router();

  router.get("/", getUsers);
  router.get("/:id", getUser);
  router.patch("/:id/role", patchUserRole);
  router.patch("/:id/status", patchUserStatus);

  return router;
};

// Export default router with real implementations
export default createUserRouter();
import { Router } from "express";
import { createControllers } from "./truck.controller.js";

export const createTruckRouter = (controllerDeps?: any) => {
  const { listTrucks, getTruck, postTruck, patchTruck, removeTruck, patchPallets } =
    createControllers(controllerDeps);

  const router = Router();

  router.get("/", listTrucks);
  router.post("/", postTruck);
  router.get("/:id", getTruck);
  router.patch("/:id", patchTruck);
  router.delete("/:id", removeTruck);
  router.patch("/:id/pallets", patchPallets);

  return router;
};

// Export default router with real implementations
export default createTruckRouter();
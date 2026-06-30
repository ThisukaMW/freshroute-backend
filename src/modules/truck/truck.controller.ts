import type { Response, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  getAllTrucks as getAllTrucksService,
  getTruckById as getTruckByIdService,
  createTruck as createTruckService,
  updateTruck as updateTruckService,
  deleteTruck as deleteTruckService,
  adjustPallets as adjustPalletsService,
  type CreateTruckInput,
  type UpdateTruckInput,
} from "./truck.service.js";

type AuthRequestWithParams<P = Record<string, string>> = AuthRequest & Request<P>;

type ServiceDeps = {
  getAllTrucks?: typeof getAllTrucksService;
  getTruckById?: typeof getTruckByIdService;
  createTruck?: typeof createTruckService;
  updateTruck?: typeof updateTruckService;
  deleteTruck?: typeof deleteTruckService;
  adjustPallets?: typeof adjustPalletsService;
};

const createControllers = (deps: ServiceDeps = {}) => {
  const getAllTrucks = deps.getAllTrucks || getAllTrucksService;
  const getTruckById = deps.getTruckById || getTruckByIdService;
  const createTruck = deps.createTruck || createTruckService;
  const updateTruck = deps.updateTruck || updateTruckService;
  const deleteTruck = deps.deleteTruck || deleteTruckService;
  const adjustPallets = deps.adjustPallets || adjustPalletsService;

  // GET /api/v1/trucks
  const listTrucks = async (req: AuthRequest, res: Response) => {
    try {
      const trucks = await getAllTrucks();
      res.json(trucks);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error";
      res.status(500).json({ message });
    }
  };

  // GET /api/v1/trucks/:id
  const getTruck = async (
    req: AuthRequestWithParams<{ id: string }>,
    res: Response
  ) => {
    try {
      const truck = await getTruckById(req.params.id);
      res.json(truck);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ message });
    }
  };

  // POST /api/v1/trucks
  const postTruck = async (req: AuthRequest, res: Response) => {
    try {
      const truck = await createTruck(req.body as CreateTruckInput);
      res.status(201).json(truck);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error";
      const status = message.includes("already exists") ? 409 : 500;
      res.status(status).json({ message });
    }
  };

  // PATCH /api/v1/trucks/:id
  const patchTruck = async (
    req: AuthRequestWithParams<{ id: string }>,
    res: Response
  ) => {
    try {
      const truck = await updateTruck(req.params.id, req.body as UpdateTruckInput);
      res.json(truck);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ message });
    }
  };

  // DELETE /api/v1/trucks/:id
  const removeTruck = async (
    req: AuthRequestWithParams<{ id: string }>,
    res: Response
  ) => {
    try {
      const result = await deleteTruck(req.params.id);
      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ message });
    }
  };

  // PATCH /api/v1/trucks/:id/pallets  —  body: { delta: 1 | -1 }
  const patchPallets = async (
    req: AuthRequestWithParams<{ id: string }>,
    res: Response
  ) => {
    try {
      const { delta } = req.body as { delta: number };

      if (delta !== 1 && delta !== -1) {
        res.status(400).json({ message: "delta must be 1 or -1" });
        return;
      }

      const truck = await adjustPallets(req.params.id, delta);
      res.json(truck);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ message });
    }
  };

  return { listTrucks, getTruck, postTruck, patchTruck, removeTruck, patchPallets };
};

export const { listTrucks, getTruck, postTruck, patchTruck, removeTruck, patchPallets } =
  createControllers();

export { createControllers };
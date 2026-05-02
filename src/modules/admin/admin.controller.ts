import type { Response, RequestHandler, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  saveTruck,
  getAllTrucks,
  getTruckById,
  type CreateTruckInput,
  type TruckType,
  type TemperatureSetting,
} from "./admin.service.js";

const VALID_TRUCK_TYPES: TruckType[] = [
  "REFRIGERATED_VAN",
  "FLATBED",
  "BOX_TRUCK",
  "SEMI_TRAILER",
  "TANKER",
  "DUMP_TRUCK",
];

const VALID_TEMPERATURE_SETTINGS: TemperatureSetting[] = [
  "AMBIENT",
  "CHILLED",
  "FROZEN",
];

// POST /api/v1/trucks
export const createTruck: RequestHandler = async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const {
      truckId,
      operator,
      truckType,
      temperatureSetting,
      route,
      fuelNeeded,
      capacityLbs,
      palletCapacity,
      deliveryEfficiencyPercent,
      avgDelayHours,
    } = authReq.body;

    // --- Required field check ---
    const requiredFields: (keyof CreateTruckInput)[] = [
      "truckId",
      "operator",
      "truckType",
      "temperatureSetting",
      "route",
      "fuelNeeded",
      "capacityLbs",
      "palletCapacity",
      "deliveryEfficiencyPercent",
      "avgDelayHours",
    ];

    const missing = requiredFields.filter(
      (f) => authReq.body[f] === undefined || authReq.body[f] === ""
    );

    if (missing.length > 0) {
      res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
      return;
    }

    // --- Enum validation ---
    if (!VALID_TRUCK_TYPES.includes(truckType)) {
      res.status(400).json({
        message: `Invalid truckType. Must be one of: ${VALID_TRUCK_TYPES.join(", ")}`,
      });
      return;
    }

    if (!VALID_TEMPERATURE_SETTINGS.includes(temperatureSetting)) {
      res.status(400).json({
        message: `Invalid temperatureSetting. Must be one of: ${VALID_TEMPERATURE_SETTINGS.join(", ")}`,
      });
      return;
    }

    // --- Range validation ---
    if (
      typeof deliveryEfficiencyPercent !== "number" ||
      deliveryEfficiencyPercent < 0 ||
      deliveryEfficiencyPercent > 100
    ) {
      res.status(400).json({ message: "deliveryEfficiencyPercent must be between 0 and 100" });
      return;
    }

    const input: CreateTruckInput = {
      truckId,
      operator,
      truckType,
      temperatureSetting,
      route,
      fuelNeeded: Number(fuelNeeded),
      capacityLbs: Number(capacityLbs),
      palletCapacity: Number(palletCapacity),
      deliveryEfficiencyPercent: Number(deliveryEfficiencyPercent),
      avgDelayHours: Number(avgDelayHours),
    };

    const data = await saveTruck(input);
    res.status(201).json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("already exists") ? 409 : 500;
    res.status(status).json({ message });
  }
};

// GET /api/v1/trucks
export const listTrucks: RequestHandler = async (_req, res) => {
  try {
    const data = await getAllTrucks();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

// GET /api/v1/trucks/:id
// ✅ Use Express's Request generic to type params properly
export const truckById: RequestHandler<{ id: string }> = async (req, res) => {
  try {
    const data = await getTruckById(req.params.id); // ✅ req.params.id is now string, fully typed
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(404).json({ message });
  }
};
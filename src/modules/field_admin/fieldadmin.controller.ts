import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  createAssessment,
  createDamageReport,
  createInspection,
  createRouteReassessment,
  getDashboardOverview,
  getAllOrders,
  getAssessmentCandidates,
  getFieldAdminNotifications,
  getFieldAdminProfile,
  getHistory,
  getInspectionHistory,
  getOrdersByStatus,
  getPaymentHistory,
  getRefundEligibleOrders,
  getRefunds,
  getRefundById,
  getRoutes,
  getFieldAdminRouteHandoff,
  getFieldAdminRouteHandoffs,
  getTruckLiveLoadDebug,
  getTaskStops,
  markDeliveryComplete,
  markStopComplete,
  confirmOrderFulfillment,
  initiateRefund,
  updateTruckCapacity,
} from "./fieldadmin.service.js";

const fail = (res: Response, error: unknown, status = 500) => {
  const message = error instanceof Error ? error.message : "Error";
  res.status(status).json({ message });
};

//get all orders for a field admin.
export const allOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getAllOrders(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all pending orders for a field admin.
export const pendingOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["PENDING", "PAYMENT_PENDING", "PAID"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all scheduled orders for a field admin.
export const scheduledOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["BATCHED", "ASSIGNED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all in transit orders for a field admin.
export const inTransitOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["IN_TRANSIT"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all delivered orders for a field admin.
export const deliveredOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["DELIVERED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the profile of a field admin.
export const myProfile = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminProfile(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error, 404);
  }
};

//get the profile of a field admin for editing.
export const myProfileEdit = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminProfile(req.fieldAdminId!);
    res.json({ editable: true, profile: data });
  } catch (error) {
    fail(res, error, 404);
  }
};

//get the addresses of a field admin.
export const myAddresses = async (req: AuthRequest, res: Response) => {
  try {
    const stops = await getTaskStops(req.fieldAdminId!);
    res.json(
      stops.map((s) => ({
        stopId: s.id,
        routeNumber: s.route.routeNumber,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
      }))
    );
  } catch (error) {
    fail(res, error);
  }
};

//get the notifications of a field admin.
export const myNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminNotifications(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the help content for a field admin.
export const helpContent = async (_req: AuthRequest, res: Response) => {
  res.json({
    title: "Field Admin Help",
    contact: "support@freshroute.com",
    phone: "+94 11 000 0000",
  });
};

//get the terms content for a field admin.
export const termsContent = async (_req: AuthRequest, res: Response) => {
  res.json({
    version: "1.0",
    title: "Field Admin Terms",
    summary: "Use company devices and workflows to verify quality and delivery tasks.",
  });
};

//get all routes for a field admin.
export const allRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get handoff bundles for all active assigned routes.
export const routeHandoffsAll = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminRouteHandoffs(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//get handoff bundle for one assigned route (pickup/dropoff segmentation).
export const routeHandoffById = async (req: AuthRequest, res: Response) => {
  try {
    const routeId = Array.isArray(req.params.routeId) ? req.params.routeId[0] : req.params.routeId;
    if (!routeId) {
      res.status(400).json({ message: "routeId is required" });
      return;
    }
    const data = await getFieldAdminRouteHandoff(req.fieldAdminId!, routeId);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found") ? 404 : 400;
    fail(res, error, status);
  }
};

//get all active routes for a field admin.
export const activeRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["ASSIGNED", "STARTED", "IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all scheduled routes for a field admin.
export const scheduledRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["PLANNED", "ASSIGNED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all completed routes for a field admin.
export const completedRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["COMPLETED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all in progress routes for a field admin.
export const inProgressRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the history of routes for a field admin.
export const routeHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getHistory(req.fieldAdminId!);
    res.json(data.routes);
  } catch (error) {
    fail(res, error);
  }
};

//get the history of all orders for a field admin.
export const allHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getHistory(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the history of trucks for a field admin.
export const truckHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["COMPLETED"]);
    res.json(
      data.map((r) => ({
        routeId: r.id,
        routeNumber: r.routeNumber,
        truckNumber: r.driver?.vehicleNumber ?? null,
        truckType: r.driver?.vehicleType ?? null,
        completedAt: r.actualEnd ?? r.updatedAt,
      }))
    );
  } catch (error) {
    fail(res, error);
  }
};

//get the history of drivers for a field admin.
export const driverHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["COMPLETED"]);
    res.json(
      data.map((r) => ({
        routeId: r.id,
        routeNumber: r.routeNumber,
        driverName: r.driver?.user.name ?? null,
        driverId: r.driver?.id ?? null,
        completedAt: r.actualEnd ?? r.updatedAt,
      }))
    );
  } catch (error) {
    fail(res, error);
  }
};

//get all assigned tasks for a field admin.
export const assignedTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["PENDING", "IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all completed tasks for a field admin.
export const completedTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["COMPLETED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all pending tasks for a field admin.
export const pendingTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["PENDING"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all scheduled tasks for a field admin.
export const scheduledTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["PENDING", "IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get all overdue tasks for a field admin.
export const overdueTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, undefined, true);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the payment history for a field admin.
export const paymentHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getPaymentHistory(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the payment invoices for a field admin.
export const paymentInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getPaymentHistory(req.fieldAdminId!);
    res.json(
      data.map((p) => ({
        invoiceNumber: `INV-${p.id.slice(0, 8).toUpperCase()}`,
        paymentId: p.id,
        orderNumber: p.order.orderNumber,
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt,
      }))
    );
  } catch (error) {
    fail(res, error);
  }
};

//get the payment methods for a field admin.
export const paymentMethods = async (_req: AuthRequest, res: Response) => {
  res.json([
    { id: "cash", name: "Cash on Delivery", enabled: true },
    { id: "card", name: "Card", enabled: true },
    { id: "bank", name: "Bank Transfer", enabled: false },
  ]);
};

//get the payment refunds for a field admin.
export const paymentRefunds = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRefunds(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get a single refund for the initiating field admin.
export const paymentRefundDetail = async (req: AuthRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ message: "Refund id is required" });
      return;
    }
    const data = await getRefundById(req.fieldAdminId!, id);
    res.json(data);
  } catch (error) {
    fail(res, error, 404);
  }
};

//get the eligible orders for payment refunds for a field admin.
export const paymentRefundEligibleOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRefundEligibleOrders(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//initiate a payment refund for a field admin.
export const paymentRefundInitiate = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, reason, orderItemIds } = req.body as {
      orderId: string;
      reason?: string;
      orderItemIds?: string[];
    };
    const data = await initiateRefund(req.fieldAdminId!, { orderId, reason, orderItemIds });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//get the settings profile for a field admin.
export const settingsProfile = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminProfile(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the settings notifications for a field admin.
export const settingsNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminNotifications(req.fieldAdminId!);
    res.json({ unreadCount: data.filter((n) => !n.read).length, notifications: data });
  } catch (error) {
    fail(res, error);
  }
};

//get the settings privacy for a field admin.
export const settingsPrivacy = async (_req: AuthRequest, res: Response) => {
  res.json({ shareLocation: true, shareDeviceInfo: false });
};

//get the settings security for a field admin.
export const settingsSecurity = async (_req: AuthRequest, res: Response) => {
  res.json({ twoFactorEnabled: false, jwtBasedAuth: true });
};

//confirm the quality of an order item for a field admin.
export const qualityConfirm = async (req: AuthRequest, res: Response) => {
  try {
    const { orderItemId, notes, approvedQuantity, rejectionReason, rejectionDetails } = req.body as {
      orderItemId: string;
      notes?: string;
      approvedQuantity?: number;
      rejectionReason?: string;
      rejectionDetails?: string;
    };
    const data = await createInspection(req.fieldAdminId!, {
      orderItemId,
      result: approvedQuantity !== undefined ? undefined : "APPROVED",
      approvedQuantity,
      notes,
      rejectionReason,
      rejectionDetails,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//get the history of quality confirmations for a field admin.
export const qualityHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getInspectionHistory(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//submit the quality feedback for an order item for a field admin.
export const qualityFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { orderItemId, notes, approvedQuantity } = req.body as {
      orderItemId: string;
      notes?: string;
      approvedQuantity?: number;
    };
    const data = await createInspection(req.fieldAdminId!, {
      orderItemId,
      result: approvedQuantity !== undefined ? undefined : "APPROVED",
      approvedQuantity,
      notes,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//submit the rejection of an order item for a field admin.
export const rejectSubmit = async (req: AuthRequest, res: Response) => {
  try {
    const { orderItemId, notes, approvedQuantity, rejectionReason, rejectionDetails } = req.body as {
      orderItemId: string;
      notes?: string;
      approvedQuantity?: number;
      rejectionReason?: string;
      rejectionDetails?: string;
    };
    const data = await createInspection(req.fieldAdminId!, {
      orderItemId,
      result: approvedQuantity !== undefined ? undefined : "REJECTED",
      approvedQuantity,
      notes,
      rejectionReason,
      rejectionDetails,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//get the history of rejections for a field admin.
export const rejectHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getInspectionHistory(req.fieldAdminId!, "REJECTED");
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//submit the rejection feedback for an order item for a field admin.
export const rejectFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { orderItemId, notes, approvedQuantity } = req.body as {
      orderItemId: string;
      notes?: string;
      approvedQuantity?: number;
    };
    const data = await createInspection(req.fieldAdminId!, {
      orderItemId,
      result: approvedQuantity !== undefined ? undefined : "REJECTED",
      approvedQuantity,
      notes,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//complete a stop (pickup or delivery) for a field admin.
export const completeStop = async (req: AuthRequest, res: Response) => {
  try {
    const stopId = Array.isArray(req.params.stopId) ? req.params.stopId[0] : req.params.stopId;
    const { notes } = req.body as { notes?: string };
    if (!stopId) {
      res.status(400).json({ message: "stopId is required" });
      return;
    }
    const data = await markStopComplete(req.fieldAdminId!, { stopId, notes });
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//complete the delivery of a stop for a field admin.
export const completeDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const { stopId, notes } = req.body as { stopId: string; notes?: string };
    const data = await markDeliveryComplete(req.fieldAdminId!, { stopId, notes });
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

export const completeOrderFulfillment = async (req: AuthRequest, res: Response) => {
  try {
    const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
    const { action, notes } = req.body as { action?: "pickup" | "delivery"; notes?: string };
    if (!orderId) {
      res.status(400).json({ message: "orderId is required" });
      return;
    }
    if (action !== "pickup" && action !== "delivery") {
      res.status(400).json({ message: "action must be pickup or delivery" });
      return;
    }
    const data = await confirmOrderFulfillment(req.fieldAdminId!, { orderId, action, notes });
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//assess the driver of a route for a field admin.
export const assessDriver = async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId, rating, comment } = req.body as {
      targetUserId: string;
      rating: number;
      comment?: string;
    };
    const data = await createAssessment(req.fieldAdminId!, {
      targetUserId,
      target: "DRIVER",
      rating,
      comment,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//assess the buyer of a route for a field admin.
export const assessBuyer = async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId, rating, comment } = req.body as {
      targetUserId: string;
      rating: number;
      comment?: string;
    };
    const data = await createAssessment(req.fieldAdminId!, {
      targetUserId,
      target: "BUYER",
      rating,
      comment,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//assess the seller of a route for a field admin.
export const assessSeller = async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId, rating, comment } = req.body as {
      targetUserId: string;
      rating: number;
      comment?: string;
    };
    const data = await createAssessment(req.fieldAdminId!, {
      targetUserId,
      target: "SELLER",
      rating,
      comment,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//report damage to a stop for a field admin.
export const reportDamage = async (req: AuthRequest, res: Response) => {
  try {
    const {
      description,
      stopId,
      images,
      damageType,
      severity,
      affectedItems,
      orderItemId,
      inspectionId,
    } = req.body as {
      description: string;
      stopId?: string;
      images?: unknown;
      damageType?: string;
      severity?: string;
      affectedItems?: string;
      orderItemId?: string;
      inspectionId?: string;
    };
    const data = await createDamageReport(req.fieldAdminId!, {
      description,
      stopId,
      images,
      damageType,
      severity,
      affectedItems,
      orderItemId,
      inspectionId,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//reassess the route for a field admin.
export const reassessRoute = async (req: AuthRequest, res: Response) => {
  try {
    const { routeId, reason, oldData, newData } = req.body as {
      routeId: string;
      reason?: string;
      oldData?: unknown;
      newData?: unknown;
    };
    const data = await createRouteReassessment(req.fieldAdminId!, {
      routeId,
      reason,
      oldData,
      newData,
    });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//update the truck capacity for a field admin.
export const updateTruck = async (req: AuthRequest, res: Response) => {
  try {
    const { driverId, vehicleCapacity } = req.body as {
      driverId: string;
      vehicleCapacity: number;
    };
    const data = await updateTruckCapacity(req.fieldAdminId!, { driverId, vehicleCapacity });
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//get the dashboard overview for a field admin.
export const dashboardOverview = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDashboardOverview(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

//get the assessment candidates for a field admin.
export const assessmentCandidates = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getAssessmentCandidates(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

//get the truck live load debug for a field admin.
export const truckLiveLoadDebug = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTruckLiveLoadDebug(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

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
  getRoutes,
  getTaskStops,
  markDeliveryComplete,
  initiateRefund,
  updateTruckCapacity,
} from "./fieldadmin.service.js";

const fail = (res: Response, error: unknown, status = 500) => {
  const message = error instanceof Error ? error.message : "Error";
  res.status(status).json({ message });
};

export const allOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getAllOrders(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const pendingOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["PENDING", "PAYMENT_PENDING", "PAID"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const scheduledOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["BATCHED", "ASSIGNED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const inTransitOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["IN_TRANSIT"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const deliveredOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getOrdersByStatus(req.fieldAdminId!, ["DELIVERED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const myProfile = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminProfile(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error, 404);
  }
};

export const myProfileEdit = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminProfile(req.fieldAdminId!);
    res.json({ editable: true, profile: data });
  } catch (error) {
    fail(res, error, 404);
  }
};

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

export const myNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminNotifications(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const helpContent = async (_req: AuthRequest, res: Response) => {
  res.json({
    title: "Field Admin Help",
    contact: "support@freshroute.com",
    phone: "+94 11 000 0000",
  });
};

export const termsContent = async (_req: AuthRequest, res: Response) => {
  res.json({
    version: "1.0",
    title: "Field Admin Terms",
    summary: "Use company devices and workflows to verify quality and delivery tasks.",
  });
};

export const allRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const activeRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["ASSIGNED", "STARTED", "IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const scheduledRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["PLANNED", "ASSIGNED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const completedRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["COMPLETED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const inProgressRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRoutes(req.fieldAdminId!, ["IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const routeHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getHistory(req.fieldAdminId!);
    res.json(data.routes);
  } catch (error) {
    fail(res, error);
  }
};

export const allHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getHistory(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

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

export const assignedTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["PENDING", "IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const completedTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["COMPLETED"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const pendingTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["PENDING"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const scheduledTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, ["PENDING", "IN_PROGRESS"]);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const overdueTasks = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getTaskStops(req.fieldAdminId!, undefined, true);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const paymentHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getPaymentHistory(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

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

export const paymentMethods = async (_req: AuthRequest, res: Response) => {
  res.json([
    { id: "cash", name: "Cash on Delivery", enabled: true },
    { id: "card", name: "Card", enabled: true },
    { id: "bank", name: "Bank Transfer", enabled: false },
  ]);
};

export const paymentRefunds = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRefunds(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const paymentRefundEligibleOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRefundEligibleOrders(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const paymentRefundInitiate = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, amount, reason } = req.body as {
      orderId: string;
      amount: number;
      reason?: string;
    };
    const data = await initiateRefund(req.fieldAdminId!, { orderId, amount, reason });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

export const settingsProfile = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminProfile(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const settingsNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getFieldAdminNotifications(req.fieldAdminId!);
    res.json({ unreadCount: data.filter((n) => !n.read).length, notifications: data });
  } catch (error) {
    fail(res, error);
  }
};

export const settingsPrivacy = async (_req: AuthRequest, res: Response) => {
  res.json({ shareLocation: true, shareDeviceInfo: false });
};

export const settingsSecurity = async (_req: AuthRequest, res: Response) => {
  res.json({ twoFactorEnabled: false, jwtBasedAuth: true });
};

export const qualityConfirm = async (req: AuthRequest, res: Response) => {
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

export const qualityHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getInspectionHistory(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

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

export const rejectSubmit = async (req: AuthRequest, res: Response) => {
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

export const rejectHistory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getInspectionHistory(req.fieldAdminId!, "REJECTED");
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

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

export const completeDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const { stopId, notes } = req.body as { stopId: string; notes?: string };
    const data = await markDeliveryComplete(req.fieldAdminId!, { stopId, notes });
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

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

export const reportDamage = async (req: AuthRequest, res: Response) => {
  try {
    const { description, stopId, images } = req.body as {
      description: string;
      stopId?: string;
      images?: unknown;
    };
    const data = await createDamageReport(req.fieldAdminId!, { description, stopId, images });
    res.status(201).json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

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

export const dashboardOverview = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDashboardOverview(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error);
  }
};

export const assessmentCandidates = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getAssessmentCandidates(req.fieldAdminId!);
    res.json(data);
  } catch (error) {
    fail(res, error, 400);
  }
};

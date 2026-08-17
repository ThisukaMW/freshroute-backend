import { Router } from "express";
import { protect, authorize } from "../../middlewares/auth.middleware.js";
import {
  allHistory,
  allOrders,
  allRoutes,
  assessBuyer,
  assessDriver,
  assessSeller,
  assignedTasks,
  completeDelivery,
  completeStop,
  completedRoutes,
  completedTasks,
  deliveredOrders,
  driverHistory,
  helpContent,
  inProgressRoutes,
  inTransitOrders,
  myAddresses,
  myNotifications,
  myProfile,
  myProfileEdit,
  overdueTasks,
  dashboardOverview,
  paymentHistory,
  paymentInvoices,
  paymentMethods,
  paymentRefundInitiate,
  paymentRefundDetail,
  paymentRefundEligibleOrders,
  paymentRefunds,
  pendingOrders,
  pendingTasks,
  qualityConfirm,
  qualityFeedback,
  qualityHistory,
  reassessRoute,
  rejectFeedback,
  rejectHistory,
  rejectSubmit,
  reportDamage,
  routeHistory,
  routeHandoffsAll,
  routeHandoffById,
  scheduledOrders,
  scheduledRoutes,
  scheduledTasks,
  settingsNotifications,
  settingsPrivacy,
  settingsProfile,
  settingsSecurity,
  termsContent,
  truckHistory,
  updateTruck,
  activeRoutes,
  assessmentCandidates,
  truckLiveLoadDebug,
} from "./fieldadmin.controller.js";

const router = Router();

// All field-admin routes require FIELD_ADMIN role.
router.use(protect, authorize("FIELD_ADMIN"));


// All order related APIs

router.get("/order/all", allOrders);
// NOTE: added dashboard endpoint to support Field Admin home overview cards.
router.get("/order/overview", dashboardOverview);
router.get("/order/pending", pendingOrders);
router.get("/order/scheduled", scheduledOrders);
router.get("/order/inTransit", inTransitOrders);
router.get("/order/delivered", deliveredOrders);




// //All Assignment History & Ratings Related APIs

router.get("/history/all", allHistory);
router.get("/history/trucks", truckHistory);
router.get("/history/drivers", driverHistory);


// //All Tasks Realated APIs

router.get("/tasks/assigned", assignedTasks);
router.get("/tasks/completed", completedTasks);
router.get("/tasks/pending", pendingTasks);
router.get("/tasks/scheduled", scheduledTasks);
router.get("/tasks/overdue", overdueTasks);

// //All Profile Related APIs


router.get("/me", myProfile);
router.get("/me/edit", myProfileEdit);
router.get("/me/address", myAddresses);
router.get("/me/notifications", myNotifications);
router.get("/me/help", helpContent);
router.get("/me/terms", termsContent);


// //All Route Related APIs

router.get("/route/all", allRoutes);
router.get("/route/handoff", routeHandoffsAll);
router.get("/route/:routeId/handoff", routeHandoffById);
router.get("/route/active", activeRoutes);
router.get("/route/scheduled", scheduledRoutes);
router.get("/route/completed", completedRoutes);
router.get("/route/inprogress", inProgressRoutes);
router.get("/route/history", routeHistory);

// //All Payment Related APIs

router.get("/payment/history", paymentHistory);
router.get("/payment/invoices", paymentInvoices);
router.get("/payment/methods", paymentMethods);
router.get("/payment/refunds", paymentRefunds);
router.get("/payment/refunds/eligible-orders", paymentRefundEligibleOrders);
router.get("/payment/refunds/:id", paymentRefundDetail);
// NOTE: added refund initiation endpoint used by refund screen action flow.
router.post("/payment/refunds/initiate", paymentRefundInitiate);

// //All Settings Related APIs

router.get("/settings/profile", settingsProfile);
router.get("/settings/notifications", settingsNotifications);
router.get("/settings/privacy", settingsPrivacy);
router.get("/settings/security", settingsSecurity);

// //Quality Confrim APIs

router.post("/quality/confirm", qualityConfirm);
router.get("/quality/history", qualityHistory);
router.post("/quality/feedback", qualityFeedback);

// //Reject Product APIs

router.post("/reject/submit", rejectSubmit);
router.get("/reject/history", rejectHistory);
router.post("/reject/feedback", rejectFeedback);

// //Mark Delivery Complete API

router.post("/stops/:stopId/complete", completeStop);
router.post("/delivery/complete", completeDelivery);

// //User Assesment APIs

router.post("/assessment/driver", assessDriver);
router.post("/assessment/buyer", assessBuyer);
router.post("/assessment/seller", assessSeller);
router.get("/assessment/candidates", assessmentCandidates);

// //Report Damage API
router.post("/report/damage", reportDamage);

// //Reassessment Route API
router.post("/reassessment/route", reassessRoute);

// //Truck Capacity Update API
router.post("/truck/capacity/update", updateTruck);
router.get("/truck/live-load/debug", truckLiveLoadDebug);

export default router;











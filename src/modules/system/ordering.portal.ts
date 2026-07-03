import {
  AGGREGATOR_TIMEZONE,
  getColomboHour,
  getDeliveryDayBoundsColombo,
} from "../Order_Aggregator/aggregator.colombo.js";

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 60 * 60 * 1000;

export const ORDERING_PORTAL_OPEN_HOUR = 4;

export const isOrderingPortalEnforced = () => process.env.ORDERING_PORTAL_ENFORCE !== "false";

/** Overnight maintenance: 00:00–03:59 Colombo (batching window). */
export const isWithinOvernightMaintenanceColombo = (now: Date = new Date()) => {
  const hour = getColomboHour(now);
  return hour >= 0 && hour < ORDERING_PORTAL_OPEN_HOUR;
};

export const isOrderingPortalOpenColombo = (now: Date = new Date()) => {
  if (!isOrderingPortalEnforced()) return true;
  return !isWithinOvernightMaintenanceColombo(now);
};

export type OrderingPortalStatus = {
  isOpen: boolean;
  timezone: string;
  enforceOrderingPortal: boolean;
  maintenanceWindow: { startHour: number; endHour: number; label: string };
  opensAt: string;
  closesAt: string;
  message: string;
};

export const getOrderingPortalStatus = (now: Date = new Date()): OrderingPortalStatus => {
  const enforceOrderingPortal = isOrderingPortalEnforced();
  const isOpen = isOrderingPortalOpenColombo(now);
  const { deliveryDayStart } = getDeliveryDayBoundsColombo(now);
  const opensAt = new Date(deliveryDayStart.getTime() + ORDERING_PORTAL_OPEN_HOUR * MS_PER_HOUR);
  const closesAt = new Date(deliveryDayStart.getTime() + MS_PER_DAY);

  const message = isOpen
    ? "Ordering is open. The portal closes at midnight (Asia/Colombo)."
    : "Ordering is closed for overnight batching (00:00–04:00 Asia/Colombo). Please try again after 4:00 AM.";

  return {
    isOpen,
    timezone: AGGREGATOR_TIMEZONE,
    enforceOrderingPortal,
    maintenanceWindow: {
      startHour: 0,
      endHour: ORDERING_PORTAL_OPEN_HOUR,
      label: `00:00–0${ORDERING_PORTAL_OPEN_HOUR}:00`,
    },
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    message,
  };
};

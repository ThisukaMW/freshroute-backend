import prisma from "../config/database.js";
import { getColomboHour } from "../modules/Order_Aggregator/aggregator.colombo.js";
import { notifyBuyerCartReminder } from "../modules/notifications/notification.events.js";

let isRunning = false;

export const isCartReminderEnabled = () =>
  process.env.CART_REMINDER_ENABLED !== "false";

// Hours before the portal closes (midnight Colombo) to fire. Change this one number to retune.
export const CART_REMINDER_LEAD_HOURS = 1;
export const ORDERING_CLOSE_HOUR_PLACEHOLDER = 18; // 6 PM Colombo — TODO sync with ordering.portal.js
export const CART_REMINDER_HOUR = ORDERING_CLOSE_HOUR_PLACEHOLDER - CART_REMINDER_LEAD_HOURS; // 17 = 5 PM

export const isWithinCartReminderWindowColombo = (now: Date = new Date()) =>
  getColomboHour(now) === CART_REMINDER_HOUR;

/**
 * Sends ONE batched "complete your order" reminder per buyer with a non-empty
 * cart, timed at CART_REMINDER_LEAD_HOURS before the portal closes. Dedup is
 * via Cart.lastReminderSentAt so a buyer isn't re-notified on every poll
 * during the reminder hour, or twice in the same delivery day.
 */
export const runCartReminderIfDue = async (): Promise<void> => {
  if (!isCartReminderEnabled()) return;

  const now = new Date();
  if (!isWithinCartReminderWindowColombo(now)) return;
  if (isRunning) return;

  isRunning = true;
  try {
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const cartsToRemind = await prisma.cart.findMany({
        where: {
            items: { some: { savedForLater: false } },
            OR: [
            { lastReminderSentAt: null },
            { lastReminderSentAt: { lt: twelveHoursAgo } },
            ],
        },
        include: {
            items: { where: { savedForLater: false } },
            buyer: { select: { userId: true } },
        },
        });

    if (cartsToRemind.length === 0) {
      console.log("🔔 Cart reminder: no carts due");
      return;
    }

    console.log(`🔔 Cart reminder: sending to ${cartsToRemind.length} buyer(s)`);

    for (const cart of cartsToRemind) {
      try {
        await notifyBuyerCartReminder(cart.buyer.userId, cart.items.length);
        await prisma.cart.update({
          where: { id: cart.id },
          data: { lastReminderSentAt: now },
        });
      } catch (error) {
        console.error(
          `❌ Cart reminder failed for cart ${cart.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  } finally {
    isRunning = false;
  }
};
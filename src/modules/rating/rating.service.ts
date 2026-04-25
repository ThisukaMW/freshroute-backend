import prisma from '../../config/database.js';
import { createNotification } from '../notifications/notification.service.js';

interface RatingInput {
  orderId: string;
  driverId: string;
  buyerId: string;
  ratings: {
    overall: number;
    delivery: number;
    quality: number;
    packaging?: number;
  };
  comment?: string;
}

// ---------------- SUBMIT RATING ----------------
export const createRating = async (input: RatingInput) => {
  // prevent duplicate ratings for same order
  const existing = await prisma.rating.findUnique({ where: { orderId: input.orderId } });
  if (existing) throw new Error('You have already rated this order');

  // verified purchase — check order belongs to this buyer
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { buyerId: true, status: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.buyerId !== input.buyerId) throw new Error('This order does not belong to you');
  if (order.status !== 'DELIVERED') throw new Error('You can only rate delivered orders');

  const rating = await prisma.rating.create({
    data: {
      orderId: input.orderId,
      driverId: input.driverId,
      buyerId: input.buyerId,
      rating: input.ratings.overall,
      deliveryRating: input.ratings.delivery,
      productQualityRating: input.ratings.quality,
      comment: input.comment,
      isVerifiedPurchase: true,
    },
    include: {
      driver: { include: { user: true } },
      buyer: { include: { user: true } },
    },
  });

  // update driver average rating
  const allRatings = await prisma.rating.findMany({
    where: { driverId: input.driverId },
    select: { rating: true },
  });

  const totalCount = allRatings.length;
  const avgRating = allRatings.reduce((sum, r) => sum + r.rating, 0) / totalCount;

  await prisma.driver.update({
    where: { id: input.driverId },
    data: { averageRating: avgRating, totalRatings: totalCount },
  });

  // notify the driver
  const driverUserId = rating.driver.user.id;
  const buyerName = rating.buyer.user.name;
  const stars = '★'.repeat(input.ratings.overall) + '☆'.repeat(5 - input.ratings.overall);

  await createNotification({
    userId: driverUserId,
    title: 'You received a new rating!',
    body: `${buyerName} rated you ${stars} (${input.ratings.overall}/5)${input.comment ? ` — "${input.comment}"` : ''}`,
    data: { type: 'rating', orderId: input.orderId },
  }).catch(() => {});

  return rating;
};

// ---------------- GET BUYER'S OWN RATINGS ----------------
export const getBuyerRatings = async (buyerId: string) => {
  return prisma.rating.findMany({
    where: { buyerId },
    orderBy: { createdAt: 'desc' },
    include: {
      driver: { include: { user: { select: { name: true } } } },
      order: { select: { orderNumber: true } },
    },
  });
};

// ---------------- GET RATINGS FOR A DRIVER/SELLER ----------------
export const getDriverRatings = async (driverId: string, filterStar?: number) => {
  return prisma.rating.findMany({
    where: {
      driverId,
      ...(filterStar ? { rating: filterStar } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      buyer: { include: { user: { select: { name: true } } } },
      order: { select: { orderNumber: true } },
    },
  });
};

// ---------------- GET RATING STATS ----------------
export const getRatingStats = async (driverId: string) => {
  const ratings = await prisma.rating.findMany({
    where: { driverId },
    select: { rating: true },
  });

  const total = ratings.length;
  if (total === 0) return { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

  const average = ratings.reduce((sum, r) => sum + r.rating, 0) / total;
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  ratings.forEach((r) => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

  return { total, average: Math.round(average * 10) / 10, distribution };
};

// ---------------- EDIT OWN RATING (within 24h) ----------------
export const editRating = async (
  ratingId: string,
  buyerId: string,
  updates: {
    ratings?: { overall?: number; delivery?: number; quality?: number };
    comment?: string;
  }
) => {
  const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
  if (!rating) throw new Error('Rating not found');
  if (rating.buyerId !== buyerId) throw new Error('You can only edit your own ratings');

  const hoursSince = (Date.now() - new Date(rating.createdAt).getTime()) / 1000 / 60 / 60;
  if (hoursSince > 24) throw new Error('You can only edit ratings within 24 hours');

  return prisma.rating.update({
    where: { id: ratingId },
    data: {
      ...(updates.ratings?.overall !== undefined && { rating: updates.ratings.overall }),
      ...(updates.ratings?.delivery !== undefined && { deliveryRating: updates.ratings.delivery }),
      ...(updates.ratings?.quality !== undefined && { productQualityRating: updates.ratings.quality }),
      ...(updates.comment !== undefined && { comment: updates.comment }),
    },
  });
};

// ---------------- DELETE OWN RATING ----------------
export const deleteRating = async (ratingId: string, buyerId: string) => {
  const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
  if (!rating) throw new Error('Rating not found');
  if (rating.buyerId !== buyerId) throw new Error('You can only delete your own ratings');

  const hoursSince = (Date.now() - new Date(rating.createdAt).getTime()) / 1000 / 60 / 60;
  if (hoursSince > 24) throw new Error('You can only delete ratings within 24 hours');

  return prisma.rating.delete({ where: { id: ratingId } });
};

// ---------------- FLAG RATING ----------------
export const flagRating = async (ratingId: string) => {
  const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
  if (!rating) throw new Error('Rating not found');
  await prisma.rating.update({
    where: { id: ratingId },
    data: { isFlagged: true },
  });
  return { message: 'Rating flagged for review' };
};
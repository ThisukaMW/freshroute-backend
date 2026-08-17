import prisma from '../../config/database.js';
import { createNotification } from '../notifications/notification.service.js';

interface RatingInput {
  orderId: string;
  productId: string;
  sellerId: string;
  driverId: string;
  buyerId: string;
  ratings: {
    overall: number;
    delivery: number;
    quality: number;
    packaging?: number;
  };
  comment?: string;
  images?: string[];   // ← add
}

// ---------------- SUBMIT RATING (per product) ----------------
export const createRating = async (input: RatingInput) => {
  // prevent duplicate ratings for same order + product combo
  const existing = await prisma.rating.findUnique({
    where: { orderId_productId: { orderId: input.orderId, productId: input.productId } },
  });
  if (existing) throw new Error('You have already rated this product for this order');

  // verified purchase — check order belongs to this buyer and is delivered
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { buyerId: true, status: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.buyerId !== input.buyerId) throw new Error('This order does not belong to you');
  if (order.status !== 'DELIVERED') throw new Error('You can only rate delivered orders');

  // check product was actually in this order
  const orderItem = await prisma.orderItem.findFirst({
    where: { orderId: input.orderId, productId: input.productId },
  });
  if (!orderItem) throw new Error('This product was not part of this order');

  const rating = await prisma.rating.create({
    data: {
      orderId:              input.orderId,
      productId:            input.productId,
      sellerId:             input.sellerId,
      driverId:             input.driverId,
      buyerId:              input.buyerId,
      rating:               input.ratings.overall,
      deliveryRating:       input.ratings.delivery,
      productQualityRating: input.ratings.quality,
      packagingRating:      input.ratings.packaging ?? null,
      comment:              input.comment,
      images:               input.images && input.images.length ? input.images : undefined,  // ← add
      isVerifiedPurchase:   true,
    },
    include: {
      driver:  { include: { user: true } },
      seller:  { include: { user: true } },
      buyer:   { include: { user: true } },
      product: true,
    },
  });

  // ---- update seller average rating ----
  const sellerRatings = await prisma.rating.findMany({
    where: { sellerId: input.sellerId },
    select: { rating: true },
  });
  const sellerTotal = sellerRatings.length;
  const sellerAvg   = sellerRatings.reduce((sum, r) => sum + r.rating, 0) / sellerTotal;
  await prisma.seller.update({
    where: { id: input.sellerId },
    data:  { averageRating: sellerAvg, totalRatings: sellerTotal },
  });

  // ---- notify driver ----
  const stars       = '★'.repeat(input.ratings.overall) + '☆'.repeat(5 - input.ratings.overall);
  const buyerName   = rating.buyer.user.name;
  const productName = rating.product.name;

  await createNotification({
    userId: rating.driver.user.id,
    title:  'New delivery rating!',
    body:   `${buyerName} rated your delivery ${stars} for "${productName}"`,
    data:   { type: 'rating', orderId: input.orderId },
  }).catch(() => {});

  // ---- notify seller ----
  await createNotification({
    userId: rating.seller.user.id,
    title:  'New product review! ⭐',
    body:   `${buyerName} rated "${productName}" ${stars}${input.comment ? ` — "${input.comment}"` : ''}`,
    data:   { type: 'rating', orderId: input.orderId, productId: input.productId },
  }).catch(() => {});

  return rating;
};

// ---------------- CHECK IF BUYER HAS ALREADY RATED AN ORDER ----------------
// Returns true if at least one rating exists for this orderId + buyerId combination
export const checkRating = async (orderId: string, buyerId: string): Promise<boolean> => {
  const existing = await prisma.rating.findFirst({
    where: { orderId, buyerId },
    select: { id: true },
  });
  return !!existing;
};

// ---------------- GET BUYER'S OWN RATINGS ----------------
export const getBuyerRatings = async (buyerId: string) => {
  return prisma.rating.findMany({
    where:   { buyerId },
    orderBy: { createdAt: 'desc' },
    include: {
      driver:  { include: { user: { select: { name: true } } } },
      seller:  { include: { user: { select: { name: true } } } },
      product: { select: { name: true, imageUrl: true } },
      order:   { select: { orderNumber: true } },
    },
  });
};

// ---------------- GET RATINGS FOR A DRIVER ----------------
export const getDriverRatings = async (driverId: string, filterStar?: number) => {
  return prisma.rating.findMany({
    where: {
      driverId,
      ...(filterStar ? { deliveryRating: filterStar } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      buyer:   { include: { user: { select: { name: true } } } },
      product: { select: { name: true } },
      order:   { select: { orderNumber: true } },
    },
  });
};

// ---------------- GET RATINGS FOR A SELLER ----------------
export const getSellerRatings = async (sellerId: string, filterStar?: number) => {
  return prisma.rating.findMany({
    where: {
      sellerId,
      ...(filterStar ? { rating: filterStar } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      buyer:   { include: { user: { select: { name: true } } } },
      product: { select: { id: true, name: true, imageUrl: true } },
      order:   { select: { orderNumber: true } },
    },
  });
};

// ---------------- GET RATINGS FOR A SPECIFIC PRODUCT ----------------
export const getProductRatings = async (productId: string, filterStar?: number) => {
  return prisma.rating.findMany({
    where: {
      productId,
      ...(filterStar ? { rating: filterStar } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      buyer: { include: { user: { select: { name: true } } } },
      order: { select: { orderNumber: true } },
    },
  });
};

// ---------------- GET PRODUCT RATING STATS ----------------
export const getProductRatingStats = async (productId: string) => {
  const ratings = await prisma.rating.findMany({
    where:  { productId },
    select: { rating: true, deliveryRating: true, productQualityRating: true, packagingRating: true },
  });

  const total = ratings.length;
  if (total === 0) return {
    total: 0,
    averages: { overall: 0, delivery: 0, quality: 0, packaging: 0 },
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v !== null);
    return valid.length ? Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 10) / 10 : 0;
  };

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  ratings.forEach((r) => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

  return {
    total,
    averages: {
      overall:  avg(ratings.map(r => r.rating)),
      delivery: avg(ratings.map(r => r.deliveryRating)),
      quality:  avg(ratings.map(r => r.productQualityRating)),
      packaging: avg(ratings.map(r => r.packagingRating)),
    },
    distribution,
  };
};

// ---------------- GET ALL PRODUCTS WITH RATING SUMMARY (for seller dashboard) ----------------
export const getSellerProductsWithRatings = async (sellerId: string) => {
  const products = await prisma.product.findMany({
    where: { sellerId },
    select: {
      id:       true,
      name:     true,
      imageUrl: true,
      category: true,
      ratings: {
        select: {
          rating:               true,
          deliveryRating:       true,
          productQualityRating: true,
          packagingRating:      true,
        },
      },
    },
  });

  return products.map((p) => {
    const total = p.ratings.length;
    if (total === 0) return { ...p, totalRatings: 0, averageRating: 0, ratings: undefined };

    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v !== null);
      return valid.length ? Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 10) / 10 : 0;
    };

    return {
      id:           p.id,
      name:         p.name,
      imageUrl:     p.imageUrl,
      category:     p.category,
      totalRatings: total,
      averageRating: avg(p.ratings.map(r => r.rating)),
    };
  });
};

// ---------------- GET RATING STATS (driver) ----------------
export const getRatingStats = async (driverId: string) => {
  const ratings = await prisma.rating.findMany({
    where:  { driverId },
    select: { rating: true },
  });

  const total = ratings.length;
  if (total === 0) return { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

  const average      = ratings.reduce((sum, r) => sum + r.rating, 0) / total;
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  ratings.forEach((r) => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

  return { total, average: Math.round(average * 10) / 10, distribution };
};

// ---------------- GET RATING STATS (seller overall) ----------------
export const getSellerRatingStats = async (sellerId: string) => {
  const ratings = await prisma.rating.findMany({
    where:  { sellerId },
    select: { rating: true },
  });

  const total = ratings.length;
  if (total === 0) return { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

  const average      = ratings.reduce((sum, r) => sum + r.rating, 0) / total;
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  ratings.forEach((r) => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

  return { total, average: Math.round(average * 10) / 10, distribution };
};

// ---------------- EDIT OWN RATING (within 24h) ----------------
export const editRating = async (
  ratingId: string,
  buyerId: string,
  updates: {
    ratings?: { overall?: number; delivery?: number; quality?: number; packaging?: number };
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
      ...(updates.ratings?.overall   !== undefined && { rating:               updates.ratings.overall }),
      ...(updates.ratings?.delivery  !== undefined && { deliveryRating:       updates.ratings.delivery }),
      ...(updates.ratings?.quality   !== undefined && { productQualityRating: updates.ratings.quality }),
      ...(updates.ratings?.packaging !== undefined && { packagingRating:      updates.ratings.packaging }),
      ...(updates.comment            !== undefined && { comment:              updates.comment }),
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
  await prisma.rating.update({ where: { id: ratingId }, data: { isFlagged: true } });
  return { message: 'Rating flagged for review' };
};

// ---------------- SUBMIT DRIVER RATING (once per order) ----------------
export const createDriverRating = async (input: {
  orderId: string;
  driverId: string;
  buyerId: string;
  rating: number;
  comment?: string;
}) => {
  const existing = await prisma.driverRating.findUnique({
    where: { orderId: input.orderId },
  });
  if (existing) throw new Error('You have already rated the driver for this order');

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { buyerId: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.buyerId !== input.buyerId) throw new Error('This order does not belong to you');

  const driverRating = await prisma.driverRating.create({
    data: {
      orderId: input.orderId,
      driverId: input.driverId,
      buyerId: input.buyerId,
      rating: input.rating,
      comment: input.comment,
    },
  });

  // Recalculate the driver's average from DriverRating only — one entry per trip
  const allRatings = await prisma.driverRating.findMany({
    where: { driverId: input.driverId },
    select: { rating: true },
  });
  const total = allRatings.length;
  const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / total;
  await prisma.driver.update({
    where: { id: input.driverId },
    data: { averageRating: avg, totalRatings: total },
  });

  return driverRating;
};

// ---------------- CHECK IF BUYER ALREADY RATED THE DRIVER FOR THIS ORDER ----------------
export const checkDriverRating = async (orderId: string, buyerId: string): Promise<boolean> => {
  const existing = await prisma.driverRating.findFirst({
    where: { orderId, buyerId },
    select: { id: true },
  });
  return !!existing;
};
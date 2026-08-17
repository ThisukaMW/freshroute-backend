import type { Request, Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware.js';
import {
  createRating,
  checkRating,
  getBuyerRatings,
  getDriverRatings,
  getSellerRatings,
  getProductRatings,
  getProductRatingStats,
  getSellerProductsWithRatings,
  getRatingStats,
  getSellerRatingStats,
  deleteRating,
  editRating,
  flagRating,
} from './rating.service.js';
import { createDriverRating, checkDriverRating } from './rating.service.js';

// Extracts the first value from a param that may be a string or string array
const getParam = (param: string | string[]): string =>
  Array.isArray(param) ? param[0] : param;

// POST /api/v1/rating
export const submitRating = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, productId, sellerId, driverId, buyerId, comment } = req.body;

    const ratings =
      typeof req.body.ratings === 'string' ? JSON.parse(req.body.ratings) : req.body.ratings;

    if (!orderId || !productId || !sellerId || !driverId || !buyerId || !ratings) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const files = (req as AuthRequest & { files?: Express.Multer.File[] }).files ?? [];
    const imageUrls = files.map((file) => file.path);

    const rating = await createRating({
      orderId,
      productId,
      sellerId,
      driverId,
      buyerId,
      ratings,
      comment,
      images: imageUrls,
    });
    return res.status(201).json({ message: 'Rating submitted', rating });
  } catch (err: any) {
    return res.status(400).json({ message: err.message ?? 'Failed to submit rating' });
  }
};

// GET /api/v1/rating/check?orderId=:orderId — returns { alreadyRated: boolean }
export const checkRatingController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { orderId } = req.query;
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ message: 'orderId query param is required' });
    }

    // Resolve the userId to a buyerId before querying the rating table
    const db = await import('../../config/database.js').then(m => m.default);
    const buyer = await db.buyer.findUnique({ where: { userId }, select: { id: true } });
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });

    const alreadyRated = await checkRating(orderId, buyer.id);
    return res.json({ alreadyRated });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to check rating status' });
  }
};

// GET /api/v1/rating/my  (buyer sees their own ratings)
export const getMyRatings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const buyer = await import('../../config/database.js').then(m =>
      m.default.buyer.findUnique({ where: { userId }, select: { id: true } })
    );
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });

    const ratings = await getBuyerRatings(buyer.id);
    return res.json(ratings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch ratings' });
  }
};

// GET /api/v1/rating/my-seller-ratings  (seller sees all their reviews + product summary)
export const getMySellerRatings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const seller = await import('../../config/database.js').then(m =>
      m.default.seller.findUnique({ where: { userId }, select: { id: true } })
    );
    if (!seller) return res.status(404).json({ message: 'Seller profile not found' });

    const [ratings, stats, products] = await Promise.all([
      getSellerRatings(seller.id),
      getSellerRatingStats(seller.id),
      getSellerProductsWithRatings(seller.id),
    ]);

    return res.json({ ratings, stats, products });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch seller ratings' });
  }
};

// GET /api/v1/rating/driver/:driverId
export const getDriverRatingsController = async (req: Request, res: Response) => {
  try {
    const driverId   = getParam(req.params.driverId);
    const filterStar = req.query.star ? parseInt(req.query.star as string) : undefined;
    const ratings    = await getDriverRatings(driverId, filterStar);
    return res.json(ratings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch ratings' });
  }
};

// GET /api/v1/rating/driver/:driverId/stats
export const getRatingStatsController = async (req: Request, res: Response) => {
  try {
    const driverId = getParam(req.params.driverId);
    const stats    = await getRatingStats(driverId);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch stats' });
  }
};

// GET /api/v1/rating/seller/:sellerId
export const getSellerRatingsController = async (req: Request, res: Response) => {
  try {
    const sellerId   = getParam(req.params.sellerId);
    const filterStar = req.query.star ? parseInt(req.query.star as string) : undefined;
    const ratings    = await getSellerRatings(sellerId, filterStar);
    return res.json(ratings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch seller ratings' });
  }
};

// GET /api/v1/rating/seller/:sellerId/stats
export const getSellerRatingStatsController = async (req: Request, res: Response) => {
  try {
    const sellerId = getParam(req.params.sellerId);
    const stats    = await getSellerRatingStats(sellerId);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch seller stats' });
  }
};

// GET /api/v1/rating/product/:productId
export const getProductRatingsController = async (req: Request, res: Response) => {
  try {
    const productId  = getParam(req.params.productId);
    const filterStar = req.query.star ? parseInt(req.query.star as string) : undefined;
    const [ratings, stats] = await Promise.all([
      getProductRatings(productId, filterStar),
      getProductRatingStats(productId),
    ]);
    return res.json({ ratings, stats });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch product ratings' });
  }
};

// PATCH /api/v1/rating/:id
export const editRatingController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const buyer = await import('../../config/database.js').then(m =>
      m.default.buyer.findUnique({ where: { userId }, select: { id: true } })
    );
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });

    const ratingId             = getParam(req.params.id);
    const { ratings, comment } = req.body;
    const updated              = await editRating(ratingId, buyer.id, { ratings, comment });
    return res.json({ message: 'Rating updated', rating: updated });
  } catch (err: any) {
    return res.status(400).json({ message: err.message ?? 'Failed to update rating' });
  }
};

// DELETE /api/v1/rating/:id
export const deleteRatingController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const buyer = await import('../../config/database.js').then(m =>
      m.default.buyer.findUnique({ where: { userId }, select: { id: true } })
    );
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });

    const ratingId = getParam(req.params.id);
    await deleteRating(ratingId, buyer.id);
    return res.json({ message: 'Rating deleted' });
  } catch (err: any) {
    return res.status(400).json({ message: err.message ?? 'Failed to delete rating' });
  }
};

// POST /api/v1/rating/:id/flag
export const flagRatingController = async (req: Request, res: Response) => {
  try {
    const ratingId = getParam(req.params.id);
    const result   = await flagRating(ratingId);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message ?? 'Failed to flag rating' });
  }
};

// POST /api/v1/rating/driver-rating
export const submitDriverRating = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const db = await import('../../config/database.js').then(m => m.default);
    const buyer = await db.buyer.findUnique({ where: { userId }, select: { id: true } });
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });

    const { orderId, driverId, rating, comment } = req.body;
    if (!orderId || !driverId || !rating) {
      return res.status(400).json({ message: 'orderId, driverId, and rating are required' });
    }

    const driverRating = await createDriverRating({
      orderId, driverId, buyerId: buyer.id, rating, comment,
    });
    return res.status(201).json({ message: 'Driver rating submitted', driverRating });
  } catch (err: any) {
    return res.status(400).json({ message: err.message ?? 'Failed to submit driver rating' });
  }
};

// GET /api/v1/rating/driver-rating/check?orderId=:orderId
export const checkDriverRatingController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { orderId } = req.query;
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ message: 'orderId query param is required' });
    }

    const db = await import('../../config/database.js').then(m => m.default);
    const buyer = await db.buyer.findUnique({ where: { userId }, select: { id: true } });
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });

    const alreadyRated = await checkDriverRating(orderId, buyer.id);
    return res.json({ alreadyRated });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to check driver rating status' });
  }
};
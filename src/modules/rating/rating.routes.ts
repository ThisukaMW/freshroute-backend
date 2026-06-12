import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import {
  submitRating,
  getMyRatings,
  getMySellerRatings,
  getDriverRatingsController,
  getRatingStatsController,
  getSellerRatingsController,
  getSellerRatingStatsController,
  getProductRatingsController,
  editRatingController,
  deleteRatingController,
  flagRatingController,
  checkRatingController,
} from './rating.controller.js';

const router = Router();

router.post('/',                          protect, submitRating);
router.get('/my',                         protect, getMyRatings);
router.get('/my-seller-ratings',          protect, getMySellerRatings);
// Checks if the authenticated buyer has already rated a specific order — used by the frontend modal
router.get('/check',                      protect, checkRatingController);
router.get('/driver/:driverId',           getDriverRatingsController);
router.get('/driver/:driverId/stats',     getRatingStatsController);
router.get('/seller/:sellerId',           getSellerRatingsController);
router.get('/seller/:sellerId/stats',     getSellerRatingStatsController);
router.get('/product/:productId',         getProductRatingsController);
router.patch('/:id',                      protect, editRatingController);
router.delete('/:id',                     protect, deleteRatingController);
router.post('/:id/flag',                  flagRatingController);

export default router;
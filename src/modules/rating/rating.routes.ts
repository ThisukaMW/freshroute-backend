import { Router } from 'express';
import multer from 'multer';
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
  submitDriverRating,           // ← add
  checkDriverRatingController,  // ← add
} from './rating.controller.js';

const upload = multer({ dest: 'uploads/' });

const router = Router();

router.post('/',                          protect, upload.array('images', 5), submitRating);
router.get('/my',                         protect, getMyRatings);
router.get('/my-seller-ratings',          protect, getMySellerRatings);
router.get('/check',                      protect, checkRatingController);
router.get('/driver/:driverId',           getDriverRatingsController);
router.get('/driver/:driverId/stats',     getRatingStatsController);
router.get('/seller/:sellerId',           getSellerRatingsController);
router.get('/seller/:sellerId/stats',     getSellerRatingStatsController);
router.get('/product/:productId',         getProductRatingsController);
router.patch('/:id',                      protect, editRatingController);
router.delete('/:id',                     protect, deleteRatingController);
router.post('/:id/flag',                  protect, flagRatingController);
router.post('/driver-rating',             protect, submitDriverRating);          // ← add
router.get('/driver-rating/check',        protect, checkDriverRatingController); // ← add

export default router;
import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import {
  submitRating,
  getMyRatings,
  getDriverRatingsController,
  getRatingStatsController,
  editRatingController,
  deleteRatingController,
  flagRatingController,
} from './rating.controller.js';

const router = Router();

router.post('/', protect, submitRating);
router.get('/my', protect, getMyRatings);
router.get('/driver/:driverId', getDriverRatingsController);
router.get('/driver/:driverId/stats', getRatingStatsController);
router.patch('/:id', protect, editRatingController);
router.delete('/:id', protect, deleteRatingController);
router.post('/:id/flag', flagRatingController);

export default router;
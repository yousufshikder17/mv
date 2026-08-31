import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { listRecommendations } from "../controllers/recommendController.js";

const router = express.Router();

// Built from what this user has tracked, so it needs an account.
router.use(authMiddleware);
router.get("/", catchAsync(listRecommendations));

export default router;

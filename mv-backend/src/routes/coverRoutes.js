import express from "express";
import rateLimit from "express-rate-limit";
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { albumCover } from "../controllers/coverController.js";

const router = express.Router();

/**
 * Covers are images, not API calls, and the general limiter is sized for API
 * calls: 100 requests per 15 minutes would be spent by five search pages.
 *
 * This router is mounted BEFORE that limiter in app.js for the same reason,
 * so this is the only budget these requests answer to.
 */
const coverLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: Number.parseInt(process.env.COVER_RATE_LIMIT_MAX_REQUESTS, 10) || 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: "Too many cover requests." },
});

router.get("/album/:mbid", coverLimiter, catchAsync(albumCover));

export default router;

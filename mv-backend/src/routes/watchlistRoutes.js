import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import {
    addToWatchlist,
    removeFromWatchlist,
    updateWatchlistItem,
    getUserWatchlist,
    getSeasonRatings,
    upsertSeasonRating,
} from "../controllers/watchListController.js";
import { validateRequest } from "../middleware/validateMiddleware.js";
import { addToWatchlistSchema, updateWatchlistSchema, seasonRatingSchema } from "../validators/watchlistVallidators.js";
// Import Routes

const router = express.Router();

router.use(authMiddleware);

router.get("/", catchAsync(getUserWatchlist));

router.post("/", validateRequest(addToWatchlistSchema), catchAsync(addToWatchlist));

// {{baseURL}}/watchlist/:id
router.put("/:id", validateRequest(updateWatchlistSchema), catchAsync(updateWatchlistItem));

// Seasons. Declared before the generic "/:id" handlers would otherwise be
// tempting to reorder - Express matches in declaration order.
router.get("/:id/seasons", catchAsync(getSeasonRatings));
router.put("/:id/seasons/:n", validateRequest(seasonRatingSchema), catchAsync(upsertSeasonRating));

router.delete("/:id", catchAsync(removeFromWatchlist));

export default router;

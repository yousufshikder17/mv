import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { addToWatchlist, removeFromWatchlist, updateWatchlistItem, getUserWatchlist } from "../controllers/watchListController.js";
import { validateRequest } from "../middleware/validateMiddleware.js";
import { addToWatchlistSchema, updateWatchlistSchema } from "../validators/watchlistVallidators.js";
// Import Routes

const router = express.Router();

router.use(authMiddleware);

router.get("/", catchAsync(getUserWatchlist));

router.post("/", validateRequest(addToWatchlistSchema), catchAsync(addToWatchlist));

// {{baseURL}}/watchlist/:id
router.put("/:id", validateRequest(updateWatchlistSchema), catchAsync(updateWatchlistItem));

router.delete("/:id", catchAsync(removeFromWatchlist));

export default router;

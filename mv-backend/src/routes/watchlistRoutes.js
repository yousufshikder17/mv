import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { addToWatchlist, removeFromWatchlist, updateWatchlistItem, getUserWatchlist } from "../controllers/watchListController.js";
import { validateRequest } from "../middleware/validateMiddleware.js";
import { addToWatchlistSchema } from "../validators/watchlistVallidators.js";
// Import Routes

const router = express.Router();

router.use(authMiddleware);

router.get("/", getUserWatchlist);

router.post("/", validateRequest(addToWatchlistSchema), addToWatchlist);

// {{baseURL}}/watchlist/:id
router.put("/:id", updateWatchlistItem);

router.delete("/:id", removeFromWatchlist);

export default router;

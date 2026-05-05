import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { addToWatchlist, removeFromWatchlist, updateWatchlistItem, getUserWatchlist } from "../controllers/watchListController.js";
// Import Routes

const router = express.Router();

router.use(authMiddleware);

router.get("/", getUserWatchlist);

router.post("/", addToWatchlist);

// {{baseURL}}/watchlist/:id
router.put("/:id", updateWatchlistItem);

router.delete("/:id", removeFromWatchlist);

export default router;

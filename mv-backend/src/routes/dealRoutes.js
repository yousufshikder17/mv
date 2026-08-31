import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { publicLimiter } from '../middleware/rateLimiter.js';
import {
    getDeals,
    getDealPlatforms,
    getDealsRss,
    voteOnDeal,
    removeVote,
} from "../controllers/dealController.js";

const router = express.Router();

// Public. A deal is a link - browsing, filtering and clicking through need no
// account, and there is nothing to sign up for. The same rule M3 settled: the
// gate is persistence, not access.
//
// publicLimiter because this answers to anyone, though unlike the TMDB proxy
// it reads our own database rather than someone else's quota.
router.get("/", publicLimiter, catchAsync(getDeals));
router.get("/platforms", publicLimiter, catchAsync(getDealPlatforms));
router.get("/rss", publicLimiter, catchAsync(getDealsRss));

// Voting is the one thing here that writes a row.
router.post("/:mediaItemId/vote", authMiddleware, catchAsync(voteOnDeal));
router.delete("/:mediaItemId/vote", authMiddleware, catchAsync(removeVote));

export default router;

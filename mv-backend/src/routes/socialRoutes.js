import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { publicLimiter } from '../middleware/rateLimiter.js';
import { validateRequest } from '../middleware/validateMiddleware.js';
import { reviewSchema, commentSchema, voteSchema } from '../validators/socialValidators.js';
import { getProfile, getProfileItems, follow, unfollow, getFeed } from "../controllers/socialController.js";
import { listReviews, upsertReview, deleteReview, voteReview } from "../controllers/reviewController.js";
import { listComments, addComment, deleteComment } from "../controllers/commentController.js";

const router = express.Router();

// ── Public reads ─────────────────────────────────────────────────────
//
// M3's rule again: the gate is persistence, not access. Profiles, reviews and
// discussion are readable by anyone, subject to the owner's privacy settings.
// optionalAuth rather than authMiddleware so a signed-in viewer sees their own
// private profile and their follow state, while a stranger still gets a page.
router.get("/profile/:userId", publicLimiter, optionalAuth, catchAsync(getProfile));
router.get("/profile/:userId/items", publicLimiter, optionalAuth, catchAsync(getProfileItems));
router.get("/items/:mediaItemId/reviews", publicLimiter, catchAsync(listReviews));
router.get("/items/:mediaItemId/comments", publicLimiter, catchAsync(listComments));

// ── Everything below writes ──────────────────────────────────────────
router.use(authMiddleware);

router.get("/feed", catchAsync(getFeed));

router.post("/follow/:userId", catchAsync(follow));
router.delete("/follow/:userId", catchAsync(unfollow));

router.put("/items/:mediaItemId/review", validateRequest(reviewSchema), catchAsync(upsertReview));
router.delete("/reviews/:reviewId", catchAsync(deleteReview));
router.post("/reviews/:reviewId/vote", validateRequest(voteSchema), catchAsync(voteReview));

router.post("/items/:mediaItemId/comments", validateRequest(commentSchema), catchAsync(addComment));
router.delete("/comments/:commentId", catchAsync(deleteComment));

export default router;

import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { validateRequest } from '../middleware/validateMiddleware.js';
import { importMovieSchema } from '../validators/movieValidator.js';
import { publicLimiter } from '../middleware/rateLimiter.js';
import {
    searchTmdb,
    trending,
    variety,
    publicDetails,
    itemPrices,
    importFromTmdb,
    getSeasonEpisodes,
    getAllMovies,
    getMovieById,
} from "../controllers/movieController.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────────────────
//
// M3: the gate is persistence, not access. Reading about a film needs no
// account; keeping it does. A logged-out visitor can find and read anything a
// logged-in one can, and simply cannot save it.
//
// The auth gate WAS the quota defence, so removing it needs a real
// replacement rather than nothing: publicLimiter caps a single IP well below
// what scraping wants, and the controller serves these from a TTL cache so a
// repeated query never reaches TMDB at all. Do not drop either one.
//
// Declared before "/:id", or Express matches "search" and "details" as uuids.
router.get("/search", publicLimiter, catchAsync(searchTmdb));
router.get("/trending", publicLimiter, catchAsync(trending));
router.get("/variety", publicLimiter, catchAsync(variety));
router.get("/details/:type/:externalId", publicLimiter, catchAsync(publicDetails));
router.get("/prices/:type/:externalId", publicLimiter, catchAsync(itemPrices));

// ── Everything below writes, or reads our own catalogue ──────────────
router.use(authMiddleware);

router.post("/import", validateRequest(importMovieSchema), catchAsync(importFromTmdb));

router.get("/", catchAsync(getAllMovies));

// TV only - 400s for anything else.
router.get("/:id/seasons/:n", catchAsync(getSeasonEpisodes));

router.get("/:id", catchAsync(getMovieById));

export default router;

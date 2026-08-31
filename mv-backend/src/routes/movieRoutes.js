import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { validateRequest } from '../middleware/validateMiddleware.js';
import { importMovieSchema } from '../validators/movieValidator.js';
import {
    searchTmdb,
    trending,
    importFromTmdb,
    getSeasonEpisodes,
    getAllMovies,
    getMovieById,
} from "../controllers/movieController.js";

const router = express.Router();

// Auth on everything: search proxies TMDB, and an open proxy would let anyone
// burn our API quota.
router.use(authMiddleware);

// Must precede "/:id" or Express matches "search" as a uuid param.
router.get("/search", catchAsync(searchTmdb));

// Also before "/:id" — same reason.
router.get("/trending", catchAsync(trending));

router.post("/import", validateRequest(importMovieSchema), catchAsync(importFromTmdb));

router.get("/", catchAsync(getAllMovies));

// TV only - 400s for anything else.
router.get("/:id/seasons/:n", catchAsync(getSeasonEpisodes));

router.get("/:id", catchAsync(getMovieById));

export default router;

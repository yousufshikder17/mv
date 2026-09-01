import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { publicLimiter } from '../middleware/rateLimiter.js';
import { validateRequest } from '../middleware/validateMiddleware.js';
import {
    createListSchema, updateListSchema, addItemSchema, updateItemSchema,
} from '../validators/listValidators.js';
import {
    myLists, browseLists, getList, createList, updateList, deleteList,
    addItem, updateItem, removeItem,
} from "../controllers/listController.js";

const router = express.Router();

// ── Public read ──────────────────────────────────────────────────────
//
// M3's rule again: the gate is persistence, not access. A public list is a
// page, and a page anyone can open is the whole reason to make one.
//
// optionalAuth rather than authMiddleware so the owner sees their own private
// list at the same URL a stranger gets a 404 from.
//
// Declared before the authMiddleware below, or reading a public list would
// require an account.
// Before "/:listId", or Express matches "browse" as a list id.
router.get("/browse", publicLimiter, catchAsync(browseLists));
router.get("/:listId", publicLimiter, optionalAuth, catchAsync(getList));

// ── Everything below is yours ────────────────────────────────────────
router.use(authMiddleware);

router.get("/", catchAsync(myLists));
router.post("/", validateRequest(createListSchema), catchAsync(createList));
router.patch("/:listId", validateRequest(updateListSchema), catchAsync(updateList));
router.delete("/:listId", catchAsync(deleteList));

router.post("/:listId/items", validateRequest(addItemSchema), catchAsync(addItem));
router.patch("/:listId/items/:itemId", validateRequest(updateItemSchema), catchAsync(updateItem));
router.delete("/:listId/items/:itemId", catchAsync(removeItem));

export default router;

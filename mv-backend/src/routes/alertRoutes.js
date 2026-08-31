import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { validateRequest } from '../middleware/validateMiddleware.js';
import { upsertAlertSchema, setActiveSchema } from '../validators/alertValidators.js';
import {
    listAlerts,
    upsertAlert,
    setAlertActive,
    removeAlert,
} from "../controllers/alertController.js";

const router = express.Router();

// SPEC §9: price alerts are always private. Nothing here is public, unlike
// discovery in M3.
router.use(authMiddleware);

router.get("/", catchAsync(listAlerts));
router.post("/", validateRequest(upsertAlertSchema), catchAsync(upsertAlert));
router.patch("/:id", validateRequest(setActiveSchema), catchAsync(setAlertActive));
router.delete("/:id", catchAsync(removeAlert));

export default router;

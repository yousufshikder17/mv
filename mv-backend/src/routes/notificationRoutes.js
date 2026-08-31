import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import {
    listNotifications,
    markRead,
    vapidKey,
    subscribePush,
    unsubscribePush,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", catchAsync(listNotifications));
router.post("/read", catchAsync(markRead));
router.get("/vapid-key", catchAsync(vapidKey));
router.post("/subscribe", catchAsync(subscribePush));
router.delete("/subscribe", catchAsync(unsubscribePush));

export default router;

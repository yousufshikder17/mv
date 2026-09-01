import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { validateRequest } from '../middleware/validateMiddleware.js';
import { pushSubscriptionSchema, markReadSchema } from '../validators/notificationValidators.js';
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
router.post("/read", validateRequest(markReadSchema), catchAsync(markRead));
router.get("/vapid-key", catchAsync(vapidKey));
// The endpoint here is a URL the SERVER later fetches, so validating it is
// an SSRF control rather than input tidiness.
router.post("/subscribe", validateRequest(pushSubscriptionSchema), catchAsync(subscribePush));
router.delete("/subscribe", catchAsync(unsubscribePush));

export default router;

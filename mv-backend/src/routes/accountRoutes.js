import express from "express";
import { authMiddleware } from '../middleware/authMiddleware.js';
import { catchAsync } from '../middleware/catchAsyncMiddleware.js';
import { validateRequest } from '../middleware/validateMiddleware.js';
import { privacySchema } from '../validators/socialValidators.js';
import { exportAccount, updatePrivacy } from "../controllers/accountController.js";

const router = express.Router();

// Everything here is about your own account.
router.use(authMiddleware);

router.get("/export", catchAsync(exportAccount));
router.patch("/privacy", validateRequest(privacySchema), catchAsync(updatePrivacy));

export default router;

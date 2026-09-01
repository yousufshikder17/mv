import express from "express";
import { register, login, logout } from "../controllers/authController.js";
import { validateRequest } from "../middleware/validateMiddleware.js";
import { registerSchema, loginSchema } from "../schemas/authSchemas.js";
import { loginLimiter, registerLimiter } from "../middleware/rateLimiter.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { catchAsync } from "../middleware/catchAsyncMiddleware.js";
import { forgotPassword, resetPassword, signOutEverywhere } from "../controllers/passwordController.js";

const router = express.Router()

router.post("/register", registerLimiter, validateRequest(registerSchema), register)
router.post("/login", loginLimiter, validateRequest(loginSchema), login)
router.post("/logout", logout)

// Reset. Both are unauthenticated by necessity - someone who cannot sign in
// cannot present a token - so both sit behind the login limiter, and /forgot
// answers identically whether or not the address exists.
router.post("/forgot", loginLimiter, catchAsync(forgotPassword))
router.post("/reset", loginLimiter, catchAsync(resetPassword))

// Revocation. Ordinary logout clears a cookie; this invalidates every token
// the account has ever been issued.
router.post("/sign-out-everywhere", authMiddleware, catchAsync(signOutEverywhere))

export default router;
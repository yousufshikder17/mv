import express from "express";
import { register, login, logout } from "../controllers/authController.js";
import { validateRequest } from "../middleware/validateMiddleware.js";
import { registerSchema, loginSchema } from "../schemas/authSchemas.js";
import { loginLimiter, registerLimiter } from "../middleware/rateLimiter.js";

const router = express.Router()

router.post("/register", registerLimiter, validateRequest(registerSchema), register)
router.post("/login", loginLimiter, validateRequest(loginSchema), login)
router.post("/logout", logout)

export default router;
import { z } from "zod";

// Base email logic to reuse
const emailSchema = z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Please provide a valid email")
    .toLowerCase();

export const registerSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: emailSchema,
    password: z
        .string()
        .min(1, "Password is required")
        .min(8, "Password must be at least 8 characters"), // Slightly stronger
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required"),
});
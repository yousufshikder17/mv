import express from "express";
import cors from "cors";
import { config } from 'dotenv';
import { connectDB } from "./config/db.js";
import apiLimiter from "./middleware/rateLimiter.js"; // 1. Import the limiter
import movieRoutes from "./routes/movieRoutes.js"
import authRoutes from "./routes/authRoutes.js"
import watchlistRoutes from "./routes/watchlistRoutes.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

config();
connectDB();

const app = express();

// 2. Add this for Production (so it sees user IPs correctly)
app.set('trust proxy', 1);

app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Apply the limiter HERE (Global shield)
app.use(apiLimiter);

// API Routes
app.use("/movies", movieRoutes);
app.use("/auth", authRoutes);
app.use("/watchlist", watchlistRoutes);

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

// Simplified Error Handling 
// (No disconnectDB needed because HTTP connections aren't persistent)
process.on("unhandledRejection", (err) => {
    console.error("🚨 unhandledRejection:", err);
    server.close(() => process.exit(1));
});

process.on("uncaughtException", (err) => {
    console.error("🚨 Uncaught Exception:", err);
    process.exit(1);
});

process.on("SIGTERM", () => {
    console.log("👋 SIGTERM received, shutting down gracefully...");
    server.close(() => process.exit(0));
});
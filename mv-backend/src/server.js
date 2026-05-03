import express from "express";
import { config } from 'dotenv';
import { connectDB } from "./config/db.js"; // Removed disconnectDB

import movieRoutes from "./routes/movieRoutes.js"
import authRoutes from "./routes/authRoutes.js"
import watchlistRoutes from "./routes/watchlistRoutes.js"

config();
// Initialize the database connection check
connectDB();

const app = express();

//Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Important: Add middleware to parse JSON bodies 
// (Prisma tutorials often skip this until later, but you'll need it for Drizzle)
app.use(express.json());

// API Routes
app.use("/movies", movieRoutes);
app.use("/auth", authRoutes);
app.use("/watchlist", watchlistRoutes);

const PORT = 5001;
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
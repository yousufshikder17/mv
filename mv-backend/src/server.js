import express from "express";
import { config } from 'dotenv';
import { connectDB } from "./config/db.js";
import movieRoutes from "./routes/movieRoutes.js"
import authRoutes from "./routes/authRoutes.js"
import watchlistRoutes from "./routes/watchlistRoutes.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js"; // Import your handlers

config();
connectDB();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use("/movies", movieRoutes);
app.use("/auth", authRoutes);
app.use("/watchlist", watchlistRoutes);

// Error Handling Middleware (MUST be after routes)
app.use(notFound);      // Catches 404s
app.use(errorHandler);  // Catches all other errors

// Use process.env.PORT for hosting
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
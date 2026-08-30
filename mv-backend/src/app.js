import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiLimiter from "./middleware/rateLimiter.js";
import movieRoutes from "./routes/movieRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

// Building the app is separated from starting it so a test can mount this
// with supertest without opening a socket or connecting to a database.
// server.js owns connectDB() and listen(); nothing here has side effects.
export const createApp = () => {
    const app = express();

    // So express-rate-limit and req.ip see the real client address behind a
    // proxy rather than the proxy's own.
    app.set("trust proxy", 1);

    app.use(
        cors({
            origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization"],
        }),
    );

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    app.use(apiLimiter);

    app.use("/movies", movieRoutes);
    app.use("/auth", authRoutes);
    app.use("/watchlist", watchlistRoutes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
};

export default createApp;

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiLimiter from "./middleware/rateLimiter.js";
import movieRoutes from "./routes/movieRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import { mountSpa } from "./middleware/spa.js";

// Building the app is separated from starting it so a test can mount this
// with supertest without opening a socket or connecting to a database.
// server.js owns connectDB() and listen(); nothing here has side effects.
export const createApp = () => {
    const app = express();

    // So express-rate-limit and req.ip see the real client address behind a
    // proxy rather than the proxy's own.
    app.set("trust proxy", 1);

    // Hardcoding localhost blocked every deployed frontend, which matters now
    // that M3 serves public pages. Comma-separated CORS_ORIGINS in .env, with
    // the dev defaults kept so nothing local has to change.
    const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

    app.use(
        cors({
            origin: origins,
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
    app.use("/alerts", alertRoutes);
    app.use("/notifications", notificationRoutes);

    // Serves the built frontend when one exists, with per-item meta tags so
    // shared links preview correctly. No-op in development, where Vite serves
    // the frontend itself.
    mountSpa(app);

    app.use(notFound);
    app.use(errorHandler);

    return app;
};

export default createApp;

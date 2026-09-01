import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import apiLimiter from "./middleware/rateLimiter.js";
import movieRoutes from "./routes/movieRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import recommendRoutes from "./routes/recommendRoutes.js";
import dealRoutes from "./routes/dealRoutes.js";
import listRoutes from "./routes/listRoutes.js";
import coverRoutes from "./routes/coverRoutes.js";
import socialRoutes from "./routes/socialRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
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

    // Security headers. HSTS, no-sniff, frame-deny, referrer policy and a CSP.
    //
    // The CSP is written out rather than left on helmet's default, because the
    // default img-src is 'self' and every cover on this site comes from
    // somebody else's CDN - TMDB, RAWG, Open Library, the Cover Art Archive
    // and iTunes. Leaving it default would ship a site with no images.
    //
    // Each entry here corresponds to an adapter. Adding a media source means
    // adding its image host, and if that is forgotten the covers vanish
    // loudly rather than the policy silently permitting everything.
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    // 'unsafe-inline' for style attributes: React writes them
                    // for the hero's animation delays and per-cover zoom.
                    // Google Fonts serves the three typefaces index.html asks
                    // for - without it the whole site falls back to system
                    // fonts, silently, only in production.
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    scriptSrc: ["'self'"],
                    imgSrc: [
                        "'self'",
                        "data:",
                        "https://image.tmdb.org",        // films, TV
                        "https://media.rawg.io",         // games
                        "https://covers.openlibrary.org",// books
                        "https://coverartarchive.org",   // albums
                        // Open Library and the Cover Art Archive both 302 to
                        // archive.org, which redirects AGAIN to a numbered
                        // node - ia600703.us.archive.org, dn711004.ca... - and
                        // CSP is enforced against the final target, so the
                        // wildcard is required rather than tidy.
                        "https://archive.org",
                        "https://*.archive.org",
                        "https://*.mzstatic.com",        // iTunes artwork fallback
                    ],
                    connectSrc: ["'self'"],
                    // The font FILES come from gstatic, not googleapis.
                    fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
                    objectSrc: ["'none'"],
                    frameAncestors: ["'self'"],
                    upgradeInsecureRequests: [],
                },
            },
            // The API serves images and JSON to its own frontend; the default
            // same-origin policy would block the SPA's own asset requests when
            // frontend and API are deployed on different hosts.
            crossOriginResourcePolicy: { policy: "cross-origin" },
        }),
    );

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

    // Before the API limiter, deliberately. A search page requests twenty
    // covers, and charging those against a 100-per-15-minutes API budget
    // would rate limit a person for scrolling. This router carries its own,
    // sized for images.
    app.use("/covers", coverRoutes);

    app.use(apiLimiter);

    app.use("/movies", movieRoutes);
    app.use("/auth", authRoutes);
    app.use("/watchlist", watchlistRoutes);
    app.use("/alerts", alertRoutes);
    app.use("/notifications", notificationRoutes);
    app.use("/recommendations", recommendRoutes);
    app.use("/deals", dealRoutes);
    app.use("/lists", listRoutes);
    app.use("/social", socialRoutes);
    app.use("/account", accountRoutes);

    // Serves the built frontend when one exists, with per-item meta tags so
    // shared links preview correctly. No-op in development, where Vite serves
    // the frontend itself.
    mountSpa(app);

    app.use(notFound);
    app.use(errorHandler);

    return app;
};

export default createApp;

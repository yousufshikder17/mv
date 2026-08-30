import rateLimit from 'express-rate-limit';

// Defaults matter here. These were read with a bare parseInt, so a missing or
// malformed RATE_LIMIT_* produced NaN — and `windowMs: NaN` does not fail
// loudly, it just yields a limiter with undefined behaviour. A rate limiter
// that silently stops limiting is worse than one that is absent, because
// nothing tells you it went away.
const DEFAULT_WINDOW_MINUTES = 15;
const DEFAULT_MAX_REQUESTS = 100;

const intFromEnv = (name, fallback) => {
    const parsed = Number.parseInt(process.env[name], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const apiLimiter = rateLimit({
    windowMs: intFromEnv('RATE_LIMIT_WINDOW_MINUTES', DEFAULT_WINDOW_MINUTES) * 60 * 1000,
    max: intFromEnv('RATE_LIMIT_MAX_REQUESTS', DEFAULT_MAX_REQUESTS),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        error: "Too many requests."
    }
});

export default apiLimiter;

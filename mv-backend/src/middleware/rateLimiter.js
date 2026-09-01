import rateLimit from 'express-rate-limit';

// Defaults matter here. These were read with a bare parseInt, so a missing or
// malformed RATE_LIMIT_* produced NaN - and `windowMs: NaN` does not fail
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
    message: { status: 429, error: "Too many requests." },
});

/**
 * Stricter limit for the unauthenticated TMDB proxy routes.
 *
 * These sit in front of somebody else's quota rather than our own database,
 * and they answer to anyone on the internet. The general limiter allows 100
 * requests per 15 minutes per IP, which is generous for a logged-in user and
 * an invitation for an anonymous script.
 *
 * Deliberately still usable by a real person: a search box firing on every
 * keystroke is debounced client-side, so 25 requests in 5 minutes is far more
 * than browsing needs and far less than scraping wants. Combined with the
 * response cache, a repeated query costs TMDB nothing at all.
 *
 * The number has to be checked against the GLOBAL limiter, not chosen alone.
 * apiLimiter runs first on every request at 100 per 15 minutes; a public
 * limit of 40 per 5 minutes is 120 per 15, so the global one bound first and
 * this was strictly decorative. 25 per 5 minutes is 75 per 15 - genuinely
 * tighter, which is the entire point of having it.
 */
const publicLimiter = rateLimit({
    windowMs: intFromEnv('PUBLIC_RATE_LIMIT_WINDOW_MINUTES', 5) * 60 * 1000,
    max: intFromEnv('PUBLIC_RATE_LIMIT_MAX_REQUESTS', 25),
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: "Too many requests. Please slow down." },
});

/**
 * Failed login attempts.
 *
 * The global limiter allows 100 requests per 15 minutes, which is fine for
 * browsing and absurd for a password field: it is 100 guesses a quarter of an
 * hour, forever, against every account on the site.
 *
 * skipSuccessfulRequests is the important flag. Only FAILURES count, so a
 * person signing in normally - or several people behind one office NAT - never
 * meets this, while someone guessing meets it on the tenth try.
 */
const loginLimiter = rateLimit({
    windowMs: intFromEnv('AUTH_RATE_LIMIT_WINDOW_MINUTES', 15) * 60 * 1000,
    max: intFromEnv('AUTH_RATE_LIMIT_MAX_REQUESTS', 10),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: "Too many sign-in attempts. Try again shortly." },
});

/**
 * Account creation.
 *
 * Counts every request, unlike the login limiter: here it is the SUCCESSES
 * that are the abuse. Registration is also the one endpoint that can make the
 * mailer send to an address the requester chose, so an unbounded one is a way
 * to have this server post mail at strangers.
 */
const registerLimiter = rateLimit({
    windowMs: intFromEnv('REGISTER_RATE_LIMIT_WINDOW_MINUTES', 60) * 60 * 1000,
    max: intFromEnv('REGISTER_RATE_LIMIT_MAX_REQUESTS', 5),
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: "Too many accounts created from here. Try again later." },
});

export { publicLimiter, loginLimiter, registerLimiter };
export default apiLimiter;

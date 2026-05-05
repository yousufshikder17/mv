import rateLimit from 'express-rate-limit';

// Strictly pull from .env
const windowMsValue = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES) * 60 * 1000;
const maxRequestsValue = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS);

const apiLimiter = rateLimit({
    windowMs: windowMsValue,
    max: maxRequestsValue,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        error: "Too many requests."
    }
});

export default apiLimiter;
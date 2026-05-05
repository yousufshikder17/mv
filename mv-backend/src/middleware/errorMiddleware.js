/**
 * Global error handler middleware adapted for Drizzle/Postgres
 */
export const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // Handle Postgres/Drizzle Errors (using Postgres Error Codes)
    // 23505 = Unique Violation (e.g., movie already in watchlist)
    if (err.code === "23505") {
        statusCode = 400;
        message = "This item is already in your watchlist.";
    }

    // 23503 = Foreign Key Violation (e.g., movieId doesn't exist in movies table)
    if (err.code === "23503") {
        statusCode = 400;
        message = "The referenced movie or user does not exist.";
    }

    // 22P02 = Invalid Text Representation (e.g., sending 'abc' as a UUID)
    if (err.code === "22P02") {
        statusCode = 400;
        message = "Invalid ID format provided.";
    }

    res.status(statusCode).json({
        status: statusCode >= 400 && statusCode < 500 ? "fail" : "error",
        message: message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};

export const notFound = (req, res, next) => {
    const error = new Error(`Route ${req.originalUrl} not found`);
    error.statusCode = 404;
    next(error); // This passes the error to your errorHandler below
};
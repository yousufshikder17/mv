/**
 * Global error handler middleware adapted for Drizzle/Postgres
 */
export const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // Drizzle wraps driver errors in its own Error and hangs the original off
    // `cause`, so the SQLSTATE is not on the error itself. Every mapping below
    // used to test `err.code` alone and therefore never fired once — a
    // malformed uuid answered 500 while the 400 for it sat here unreachable.
    const sqlState = err.code ?? err.cause?.code;

    // Handle Postgres/Drizzle Errors (using Postgres Error Codes)
    // 23505 = Unique Violation (e.g., movie already in watchlist)
    if (sqlState === "23505") {
        statusCode = 400;
        message = "This item is already in your watchlist.";
    }

    // 23503 = Foreign Key Violation (e.g., movieId doesn't exist in movies table)
    if (sqlState === "23503") {
        statusCode = 400;
        message = "The referenced movie or user does not exist.";
    }

    // 22P02 = Invalid Text Representation (e.g., sending 'abc' as a UUID)
    if (sqlState === "22P02") {
        statusCode = 400;
        message = "Invalid ID format provided.";
    }

    // Anything still landing on 5xx is an error we did not recognise, and a
    // driver message is not safe to forward: drizzle puts the failed SQL and
    // its bound parameters in it, so returning it hands the caller our schema
    // and whatever values were in flight. Log it, answer generically.
    if (statusCode >= 500) {
        console.error("Unhandled error:", err);
        message = "Internal Server Error";
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

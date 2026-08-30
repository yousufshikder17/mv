import 'dotenv/config';
import { connectDB, disconnectDB } from "./config/db.js";
import { createApp } from "./app.js";

connectDB();

const app = createApp();

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

// disconnectDB is a no-op under Neon HTTP but drains the pool when running
// against a local Postgres, so shutdown is clean on either driver.
process.on("unhandledRejection", (err) => {
    console.error("🚨 unhandledRejection:", err);
    server.close(async () => {
        await disconnectDB();
        process.exit(1);
    });
});

process.on("uncaughtException", (err) => {
    console.error("🚨 Uncaught Exception:", err);
    process.exit(1);
});

const shutdown = (signal) => {
    console.log(`👋 ${signal} received, shutting down gracefully...`);
    server.close(async () => {
        await disconnectDB();
        process.exit(0);
    });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

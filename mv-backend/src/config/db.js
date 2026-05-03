import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../db/schema.js';
import 'dotenv/config';

// 1. Initialize the Neon connection
const sql = neon(process.env.DATABASE_URL);

// 2. Initialize Drizzle with the schema for IntelliSense
export const db = drizzle(sql, { schema });

// 3. Optional helper to verify connection on startup
export const connectDB = async () => {
    try {
        // We perform a simple query to verify the connection is live
        await sql`SELECT 1`;
        console.log("✅ DB connected via Drizzle (Neon HTTP)");
    } catch (error) {
        console.error(`❌ Connection error: ${error.message}`);
        process.exit(1);
    }
};

// Note: No disconnectDB is needed for the HTTP driver as it doesn't maintain a persistent socket.
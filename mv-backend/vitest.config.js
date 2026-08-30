import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        // Set before any module loads. db.js reads DB_DRIVER at import time and
        // builds its client immediately, so this cannot be done in a setup file.
        // dotenv does not overwrite variables that already exist, so a real .env
        // on the machine cannot leak a live database into the suite.
        env: {
            NODE_ENV: 'test',
            DB_DRIVER: 'pglite',
            DATABASE_URL: '',
            JWT_SECRET: 'test-only-secret-never-used-outside-vitest',
            JWT_EXPIRES_IN: '1d',
            // The suite makes far more than the production 100 requests per
            // window; without this the limiter starts returning 429 partway
            // through and tests fail for a reason unrelated to what they assert.
            RATE_LIMIT_MAX_REQUESTS: '1000000',
            RATE_LIMIT_WINDOW_MINUTES: '15',
        },
        // pglite compiles a WASM Postgres on first boot.
        testTimeout: 30000,
        hookTimeout: 30000,
    },
});

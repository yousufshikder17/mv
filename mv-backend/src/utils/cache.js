/**
 * Tiny TTL cache for upstream responses.
 *
 * This is the other half of ungating the TMDB proxy. The auth gate was the
 * quota defence - movieRoutes.js said so outright: "an open proxy would let
 * anyone burn our API quota". Removing it without a replacement trades a
 * login wall for a revoked API key, and TMDB's is the key the whole films/TV
 * half of the product runs on.
 *
 * Caching is also a compliance requirement rather than an optimisation for
 * the price sources: ITAD's terms say "you should not be constantly maxing
 * out your usage, implement proper caching" (SPEC 7).
 *
 * ponytail: in-process Map, so it is per-instance and dies with the process.
 * That is correct for one server and wrong the moment there are two - swap in
 * Redis when a second instance exists, not before.
 */

const store = new Map();

// Cheap bound. Discovery traffic is long-tailed, so an unbounded map would
// grow with every distinct search term until the process died.
const MAX_ENTRIES = 500;

export const cacheStats = { hits: 0, misses: 0 };

/** Removes expired entries, then the oldest if still over the cap. */
const evict = () => {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires <= now) store.delete(k);
    // Map iterates in insertion order, so the first key is the oldest.
    while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
};

/**
 * Returns the cached value for `key`, or awaits `produce()` and stores it.
 *
 * Failures are NOT cached: a TMDB blip would otherwise be served back for the
 * full TTL, turning a two-second outage into a five-minute one.
 */
export const cached = async (key, ttlMs, produce) => {
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) {
        cacheStats.hits += 1;
        return hit.value;
    }

    cacheStats.misses += 1;
    const value = await produce();
    store.set(key, { value, expires: Date.now() + ttlMs });
    evict();
    return value;
};

/** Test hook. Nothing in production should need to reach in and clear this. */
export const clearCache = () => {
    store.clear();
    cacheStats.hits = 0;
    cacheStats.misses = 0;
};

export const cacheSize = () => store.size;

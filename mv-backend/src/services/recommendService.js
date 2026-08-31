import { and, eq, ne, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems, trackingItems } from '../db/schema.js';

/**
 * Content-based recommendations, with a reason attached to every result.
 *
 * NOT machine learning, and deliberately so. This is similarity scoring over
 * features we already store - genres and creators - which is what SPEC 9's
 * requirement to *always show why* actually demands. A model that cannot
 * explain itself fails that requirement no matter how good its guesses are,
 * and with one user there is no interaction data to learn from anyway
 * (SPEC 13 defers collaborative filtering for exactly this reason).
 *
 * SPEC 3: Spotify's terms forbid their content being used in recommendation
 * systems or ML. Albums are excluded here by source, not by hoping nobody
 * adds one.
 */

// Sources whose licence forbids their data being used to build a
// recommendation system. Keyed on SOURCE rather than type, because the licence
// attaches to whoever supplied the row, not to what kind of thing it is.
//
// Spotify stays listed even though nothing imports from it: SPEC 3 forbids
// their content in recommendations or ML, and if a Spotify adapter is ever
// added the exclusion must already be in force rather than remembered.
//
// MusicBrainz is deliberately NOT here. Its core data is CC0, so albums
// sourced from it are recommendable - which is exactly what SPEC 3 anticipated
// when it said music is excluded "until MusicBrainz replaces Spotify as the
// metadata source". Choosing MusicBrainz did not just avoid a subscription, it
// unblocked a capability.
const EXCLUDED_SOURCES = ['spotify'];

// A shared creator is far stronger evidence than a shared genre: half the
// catalogue is 'Drama', but two films by the same director is a real signal.
const GENRE_WEIGHT = 1;
const CREATOR_WEIGHT = 3;

// Only these say "I liked it". PLANNED means untested, DROPPED is a negative
// signal, and recommending from either would be building taste out of noise.
const POSITIVE_STATUSES = ['COMPLETED', 'REVISITING', 'COLLECTED'];

// Below this, a match is one accidental shared genre and the explanation
// reads as a stretch. Better to return three good rows than twenty weak ones.
const MIN_SCORE = 2;

const overlap = (a = [], b = []) => {
    const set = new Set((b ?? []).map((x) => x.toLowerCase()));
    return (a ?? []).filter((x) => set.has(x.toLowerCase()));
};

/**
 * Builds a taste profile from what someone rated well or finished.
 *
 * Weighted by rating where one exists: a 9 should pull harder than a 6. An
 * unrated completed item still counts, because finishing something is itself
 * a mild endorsement.
 */
export const tasteProfile = async (userId) => {
    const rows = await db
        .select({ item: mediaItems, tracking: trackingItems })
        .from(trackingItems)
        .innerJoin(mediaItems, eq(trackingItems.mediaItemId, mediaItems.id))
        .where(and(
            eq(trackingItems.userId, userId),
            inArray(trackingItems.status, POSITIVE_STATUSES),
        ));

    const genres = new Map();
    const creators = new Map();
    const seen = new Set();

    for (const { item, tracking } of rows) {
        seen.add(item.id);
        if (EXCLUDED_SOURCES.includes(item.source)) continue;

        // 7 is the midpoint of the 1-10 scale that reads as "fine". Above it
        // pulls, below it pushes, and unrated sits neutral at 1.
        const weight = tracking.rating != null ? Math.max(0.25, tracking.rating - 6) : 1;

        for (const g of item.genres ?? []) {
            const key = g.toLowerCase();
            genres.set(key, (genres.get(key) ?? 0) + weight);
        }
    }

    return { genres, creators, seen };
};

/**
 * Recommendations for a user, each with the reason it was chosen.
 *
 * Candidates come from our own catalogue rather than an upstream API: a
 * recommendation you cannot act on is worse than none, and everything here is
 * already importable because somebody imported it.
 */
export const recommendFor = async (userId, { limit = 12 } = {}) => {
    const { genres, seen } = await tasteProfile(userId);
    if (!genres.size) return { recommendations: [], reason: 'not_enough_signal' };

    const candidates = await db
        .select()
        .from(mediaItems)
        .where(and(
            isNotNull(mediaItems.genres),
            seen.size ? sql`${mediaItems.id} NOT IN ${[...seen]}` : undefined,
        ))
        .limit(500);

    const scored = [];
    for (const item of candidates) {
        if (seen.has(item.id)) continue;
        if (EXCLUDED_SOURCES.includes(item.source)) continue;

        const matched = (item.genres ?? []).filter((g) => genres.has(g.toLowerCase()));
        if (!matched.length) continue;

        const score = matched.reduce((sum, g) => sum + GENRE_WEIGHT * genres.get(g.toLowerCase()), 0);
        if (score < MIN_SCORE) continue;

        scored.push({
            item,
            score,
            // The explanation is not decoration. SPEC 9 requires it, and it is
            // also the honest description of what this actually did.
            why: 'Because you liked ' + matched.slice(0, 2).join(' and ') + '.',
            matchedGenres: matched.slice(0, 3),
        });
    }

    scored.sort((a, b) => b.score - a.score);
    return { recommendations: scored.slice(0, limit), reason: null };
};

import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db, disconnectDB } from '../src/config/db.js';
import { mediaItems } from '../src/db/schema.js';
import * as rawg from '../src/adapters/media/rawg.ts';

/**
 * Seeds the public deal feed with well-known games.
 *
 * The problem this solves: the poller only prices what someone tracks, so a
 * public deal feed is empty until users arrive - and nobody signs up for an
 * empty feed. A seeded set makes it live from the start, exactly as
 * GOOGLE_BOOKS_WATCH_IDS does for book prices in M0.
 *
 * Run once: npm run seed:deals
 *
 * Idempotent. Re-running marks the same rows featured rather than duplicating
 * them - the catalogue is keyed on (source, type, externalId).
 */

// Deliberately broad rather than a personal favourites list: several genres,
// several publishers, and a spread of ages, so the feed shows variety rather
// than one taste. These get priced daily whether or not anyone tracks them.
const SEED_TITLES = [
    'Elden Ring',
    'Baldurs Gate 3',
    'Cyberpunk 2077',
    'The Witcher 3 Wild Hunt',
    'Red Dead Redemption 2',
    'Hades',
    'Disco Elysium',
    'Hollow Knight',
    'Stardew Valley',
    'Factorio',
    'Grand Theft Auto V',
    'DOOM Eternal',
    'Resident Evil 4',
    'Sekiro Shadows Die Twice',
    'Dark Souls III',
    'Celeste',
    'Outer Wilds',
    'Return of the Obra Dinn',
    'Subnautica',
    'Terraria',
    'Rimworld',
    'Slay the Spire',
    'Portal 2',
    'Half-Life Alyx',
    'Death Stranding',
];

const seed = async () => {
    let created = 0;
    let featured = 0;
    const missing = [];

    for (const title of SEED_TITLES) {
        try {
            const [hit] = await rawg.searchGames(title);
            if (!hit) { missing.push(title); continue; }

            const details = await rawg.getGameDetails(hit.externalId);

            const [row] = await db
                .insert(mediaItems)
                .values({ ...details, featured: true, refreshedAt: new Date() })
                .onConflictDoUpdate({
                    target: [mediaItems.source, mediaItems.type, mediaItems.externalId],
                    // Only the flag on conflict: a game somebody already
                    // tracks keeps whatever metadata it has.
                    set: { featured: true },
                })
                .returning({ id: mediaItems.id, createdAt: mediaItems.createdAt });

            if (row) { created += 1; featured += 1; }
        } catch (err) {
            missing.push(title + ' (' + err.message + ')');
        }
    }

    const total = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(and(eq(mediaItems.type, 'game'), eq(mediaItems.featured, true)));

    console.log('seeded ' + featured + ' of ' + SEED_TITLES.length + ' titles');
    console.log('featured games in catalogue: ' + total.length);
    if (missing.length) console.log('not found: ' + missing.join(', '));
    console.log('');
    console.log('Run `npm run poll` to price them, then GET /deals.');
};

await seed();
await disconnectDB();
process.exit(0);

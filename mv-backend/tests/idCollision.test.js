import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '../src/config/db.js';
import { mediaItems } from '../src/db/schema.js';
import { createSchema, resetTables, registerUser, api } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(resetTables);

// A source's id space is only unique within a media type. TMDB movie 550 is
// Fight Club; TMDB tv 550 is "Till Death Us Do Part". Keyed on
// (source, externalId) alone, importing the show silently overwrote the film -
// no error, no duplicate row, just different data under the same uuid, and
// every watchlist pointing at it now showed the wrong title.
describe('external id collisions across media types', () => {
    it('keeps a film and a show that share a source id as separate rows', async () => {
        await db.insert(mediaItems).values({ type: 'film', source: 'tmdb', externalId: '550', title: 'Fight Club' });
        await db.insert(mediaItems).values({ type: 'tv', source: 'tmdb', externalId: '550', title: 'Till Death Us Do Part' });

        const rows = await db.select().from(mediaItems);
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.title).sort()).toEqual(['Fight Club', 'Till Death Us Do Part']);
    });

    it('still rejects the same id twice within one type', async () => {
        // The constraint must not have been loosened into uselessness.
        await db.insert(mediaItems).values({ type: 'film', source: 'tmdb', externalId: '550', title: 'Fight Club' });

        await expect(
            db.insert(mediaItems).values({ type: 'film', source: 'tmdb', externalId: '550', title: 'Duplicate' }),
        ).rejects.toThrow();
    });

    it('separates the same id across different sources', async () => {
        await db.insert(mediaItems).values({ type: 'game', source: 'tmdb', externalId: '550', title: 'A' });
        await db.insert(mediaItems).values({ type: 'game', source: 'rawg', externalId: '550', title: 'B' });

        expect(await db.select().from(mediaItems)).toHaveLength(2);
    });

    it('does not clobber a film when a show with the same id is imported', async () => {
        // The upsert target has to match the constraint exactly, or the
        // conflict is never detected in the first place.
        const user = await registerUser();
        await db.insert(mediaItems).values({ type: 'film', source: 'tmdb', externalId: '550', title: 'Fight Club' });

        await db
            .insert(mediaItems)
            .values({ type: 'tv', source: 'tmdb', externalId: '550', title: 'Till Death Us Do Part' })
            .onConflictDoUpdate({
                target: [mediaItems.source, mediaItems.type, mediaItems.externalId],
                set: { title: 'Till Death Us Do Part' },
            });

        const rows = await db.select().from(mediaItems);
        const film = rows.find((r) => r.type === 'film');
        expect(rows).toHaveLength(2);
        expect(film.title).toBe('Fight Club');
        expect(user).toBeTruthy();
    });
});

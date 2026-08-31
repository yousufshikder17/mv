import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '../src/config/db.js';
import { trackingItems, users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(resetTables);

const track = async (user, media, over = {}) => {
    const res = await user.auth(api().post('/watchlist')).send({ movieId: media.id });
    const id = res.body.data.watchlistItem.id;
    if (Object.keys(over).length) await user.auth(api().put('/watchlist/' + id)).send(over);
    return id;
};

describe('profiles are public by default and readable by anyone', () => {
    it('shows stats without an account', async () => {
        const user = await registerUser();
        const film = await createMovie();
        await track(user, film, { status: 'COMPLETED', rating: 9 });

        const res = await api().get('/social/profile/' + user.id);

        expect(res.status).toBe(200);
        expect(res.body.data.profile.stats).toMatchObject({ tracked: 1, completed: 1, completionRate: 100 });
        expect(res.body.data.profile.averageRating).toBeUndefined();
        expect(res.body.data.profile.stats.averageRating).toBe(9);
    });

    it('never includes the email address', async () => {
        // A public profile is a page about someone's taste, not their contact
        // details.
        const user = await registerUser();
        const res = await api().get('/social/profile/' + user.id);
        expect(JSON.stringify(res.body)).not.toContain(user.email);
    });
});

// SPEC 9: privacy is per-list, per-item AND profile-level.
describe('profile-level privacy', () => {
    it('hides a private profile from everyone else', async () => {
        const user = await registerUser();
        await user.auth(api().patch('/account/privacy')).send({ profilePublic: false });

        // 404 rather than 403: a distinct answer would confirm the account
        // exists, which its owner did not choose to publish.
        expect((await api().get('/social/profile/' + user.id)).status).toBe(404);

        const other = await registerUser();
        expect((await other.auth(api().get('/social/profile/' + user.id))).status).toBe(404);
    });

    it('still shows a private profile to its owner', async () => {
        const user = await registerUser();
        await user.auth(api().patch('/account/privacy')).send({ profilePublic: false });

        const res = await user.auth(api().get('/social/profile/' + user.id));
        expect(res.status).toBe(200);
        expect(res.body.data.profile.isSelf).toBe(true);
    });
});

describe('per-item privacy', () => {
    it('keeps a hidden item off a public profile', async () => {
        const user = await registerUser();
        const shown = await createMovie({ title: 'Shown' });
        const secret = await createMovie({ title: 'Secret' });
        await track(user, shown);
        await track(user, secret, { hidden: true });

        const res = await api().get('/social/profile/' + user.id + '/items');
        const titles = res.body.data.items.map((i) => i.movie.title);

        expect(titles).toEqual(['Shown']);
    });

    it('excludes hidden items from public stats', async () => {
        // Otherwise the count itself reveals that something is hidden.
        const user = await registerUser();
        await track(user, await createMovie(), { hidden: true });

        expect((await api().get('/social/profile/' + user.id)).body.data.profile.stats.tracked).toBe(0);
    });

    it('still shows hidden items to their owner', async () => {
        const user = await registerUser();
        await track(user, await createMovie({ title: 'Secret' }), { hidden: true });

        const res = await user.auth(api().get('/social/profile/' + user.id + '/items'));
        expect(res.body.results).toBe(1);
    });
});

describe('following is asymmetric', () => {
    it('does not require approval and does not follow back', async () => {
        const alice = await registerUser();
        const bob = await registerUser();

        await alice.auth(api().post('/social/follow/' + bob.id));

        const bobSeen = await alice.auth(api().get('/social/profile/' + bob.id));
        expect(bobSeen.body.data.profile.followers).toBe(1);
        expect(bobSeen.body.data.profile.isFollowing).toBe(true);

        const aliceSeen = await bob.auth(api().get('/social/profile/' + alice.id));
        expect(aliceSeen.body.data.profile.isFollowing).toBe(false);
    });

    it('is idempotent', async () => {
        const alice = await registerUser();
        const bob = await registerUser();
        await alice.auth(api().post('/social/follow/' + bob.id));
        await alice.auth(api().post('/social/follow/' + bob.id));

        expect((await api().get('/social/profile/' + bob.id)).body.data.profile.followers).toBe(1);
    });

    it('refuses self-follow', async () => {
        const user = await registerUser();
        expect((await user.auth(api().post('/social/follow/' + user.id))).status).toBe(400);
    });

    it('unfollows', async () => {
        const alice = await registerUser();
        const bob = await registerUser();
        await alice.auth(api().post('/social/follow/' + bob.id));
        await alice.auth(api().delete('/social/follow/' + bob.id));

        expect((await api().get('/social/profile/' + bob.id)).body.data.profile.followers).toBe(0);
    });
});

describe('the activity feed', () => {
    it('is empty and says why, rather than showing invented activity', async () => {
        // SPEC 9 is explicit: do not seed fake activity. An honest empty
        // state has to explain itself instead.
        const user = await registerUser();
        const res = await user.auth(api().get('/social/feed'));

        expect(res.body.results).toBe(0);
        expect(res.body.reason).toBe('follow_nobody_yet');
    });

    it('shows what followed users tracked', async () => {
        const alice = await registerUser();
        const bob = await registerUser();
        await track(bob, await createMovie({ title: 'Dune' }), { status: 'COMPLETED', rating: 9 });
        await alice.auth(api().post('/social/follow/' + bob.id));

        const res = await alice.auth(api().get('/social/feed'));
        expect(res.body.results).toBe(1);
        expect(res.body.data.activity[0]).toMatchObject({ title: 'Dune', userName: bob.name });
    });

    it('never leaks a hidden item into the feed', async () => {
        const alice = await registerUser();
        const bob = await registerUser();
        await track(bob, await createMovie({ title: 'Secret' }), { hidden: true });
        await alice.auth(api().post('/social/follow/' + bob.id));

        expect((await alice.auth(api().get('/social/feed'))).body.results).toBe(0);
    });

    it('never leaks activity from a private profile', async () => {
        // Excluded at the query rather than filtered afterwards - a feed that
        // fetches private rows and hopes to drop them is one bug away from
        // publishing them.
        const alice = await registerUser();
        const bob = await registerUser();
        await track(bob, await createMovie());
        await alice.auth(api().post('/social/follow/' + bob.id));
        await bob.auth(api().patch('/account/privacy')).send({ profilePublic: false });

        expect((await alice.auth(api().get('/social/feed'))).body.results).toBe(0);
    });

    it('shows nothing from people you do not follow', async () => {
        const alice = await registerUser();
        const stranger = await registerUser();
        await track(stranger, await createMovie());

        expect((await alice.auth(api().get('/social/feed'))).body.results).toBe(0);
    });

    it('requires an account - it is built from who YOU follow', async () => {
        expect((await api().get('/social/feed')).status).toBe(401);
    });
});

describe('reviews', () => {
    it('is one per person per item, and rewriting is an edit', async () => {
        const user = await registerUser();
        const film = await createMovie();

        await user.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'First.' });
        await user.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'Second.' });

        const res = await api().get('/social/items/' + film.id + '/reviews');
        expect(res.body.results).toBe(1);
        expect(res.body.data.reviews[0].body).toBe('Second.');
    });

    it('returns spoiler text, because the blur is a display decision', async () => {
        // Withholding the body would break editing your own review and make
        // the flag impossible to undo.
        const user = await registerUser();
        const film = await createMovie();
        await user.auth(api().put('/social/items/' + film.id + '/review'))
            .send({ body: 'He was dead the whole time.', hasSpoilers: true });

        const [review] = (await api().get('/social/items/' + film.id + '/reviews')).body.data.reviews;
        expect(review.hasSpoilers).toBe(true);
        expect(review.body).toContain('dead');
    });

    it('hides reviews written by a private profile', async () => {
        const user = await registerUser();
        const film = await createMovie();
        await user.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'Mine.' });
        await user.auth(api().patch('/account/privacy')).send({ profilePublic: false });

        expect((await api().get('/social/items/' + film.id + '/reviews')).body.results).toBe(0);
    });

    it('refuses a vote on your own review', async () => {
        // Self-voting is not signal, it is self-promotion.
        const user = await registerUser();
        const film = await createMovie();
        const r = await user.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'Mine.' });

        const res = await user.auth(api().post('/social/reviews/' + r.body.data.review.id + '/vote'))
            .send({ helpful: true });
        expect(res.status).toBe(400);
    });

    it('counts helpful and unhelpful separately, one vote per person', async () => {
        const author = await registerUser();
        const a = await registerUser();
        const b = await registerUser();
        const film = await createMovie();
        const r = await author.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'x' });
        const id = r.body.data.review.id;

        await a.auth(api().post('/social/reviews/' + id + '/vote')).send({ helpful: true });
        await b.auth(api().post('/social/reviews/' + id + '/vote')).send({ helpful: false });
        // A changed mind, not a second vote.
        await b.auth(api().post('/social/reviews/' + id + '/vote')).send({ helpful: true });

        const [review] = (await api().get('/social/items/' + film.id + '/reviews')).body.data.reviews;
        expect(review.helpful).toBe(2);
        expect(review.unhelpful).toBe(0);
    });

    it('cannot delete a review written by somebody else', async () => {
        const author = await registerUser();
        const mallory = await registerUser();
        const film = await createMovie();
        const r = await author.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'x' });

        const res = await mallory.auth(api().delete('/social/reviews/' + r.body.data.review.id));
        expect(res.status).toBe(404);
    });
});

describe('discussion threads', () => {
    it('nests one level, and a reply to a reply joins the same root', async () => {
        const user = await registerUser();
        const film = await createMovie();

        const root = await user.auth(api().post('/social/items/' + film.id + '/comments')).send({ body: 'Top' });
        const rootId = root.body.data.comment.id;
        const reply = await user.auth(api().post('/social/items/' + film.id + '/comments'))
            .send({ body: 'Reply', parentId: rootId });
        await user.auth(api().post('/social/items/' + film.id + '/comments'))
            .send({ body: 'Reply to reply', parentId: reply.body.data.comment.id });

        const res = await api().get('/social/items/' + film.id + '/comments');
        expect(res.body.data.comments).toHaveLength(1);
        expect(res.body.data.comments[0].replies).toHaveLength(2);
    });

    it('promotes an orphaned reply rather than dropping it', async () => {
        // Losing someone's comment because the one above it was deleted is
        // worse than a slightly odd thread.
        const user = await registerUser();
        const film = await createMovie();
        const root = await user.auth(api().post('/social/items/' + film.id + '/comments')).send({ body: 'Top' });
        const rootId = root.body.data.comment.id;
        await user.auth(api().post('/social/items/' + film.id + '/comments'))
            .send({ body: 'Orphan', parentId: rootId });

        await user.auth(api().delete('/social/comments/' + rootId));

        const res = await api().get('/social/items/' + film.id + '/comments');
        expect(res.body.data.comments.map((c) => c.body)).toEqual(['Orphan']);
    });

    it('requires an account to post but not to read', async () => {
        const film = await createMovie();
        expect((await api().get('/social/items/' + film.id + '/comments')).status).toBe(200);
        expect((await api().post('/social/items/' + film.id + '/comments').send({ body: 'x' })).status).toBe(401);
    });
});

describe('GDPR export', () => {
    it('returns everything the account created', async () => {
        const user = await registerUser();
        const film = await createMovie();
        await track(user, film, { rating: 8 });
        await user.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'Good.' });

        const res = await user.auth(api().get('/account/export'));

        expect(res.status).toBe(200);
        expect(res.body.account.email).toBe(user.email);
        expect(res.body.tracking).toHaveLength(1);
        expect(res.body.reviews).toHaveLength(1);
        expect(res.body.exportedAt).toBeTruthy();
    });

    it('excludes the password hash and push encryption keys', async () => {
        // Credentials rather than personal data. Exporting a bcrypt hash helps
        // nobody and puts a credential in a file people forward around.
        const user = await registerUser();
        await user.auth(api().post('/notifications/subscribe'))
            .send({ endpoint: 'https://push.test/a', keys: { p256dh: 'SECRETKEY', auth: 'SECRETAUTH' } });

        const res = await user.auth(api().get('/account/export'));
        const dump = JSON.stringify(res.body);

        // Matching the bcrypt prefix rather than the word "password" - the
        // note field says the hash is excluded, and it should keep saying so.
        expect(dump).not.toMatch(/\$2[aby]\$/);
        expect(res.body.account.password).toBeUndefined();
        expect(dump).not.toContain('SECRETKEY');
        expect(dump).not.toContain('SECRETAUTH');
        // The endpoint itself is the user's data and is included.
        expect(dump).toContain('https://push.test/a');
    });

    it('requires an account', async () => {
        expect((await api().get('/account/export')).status).toBe(401);
    });
});

// A review body is user prose posted by anyone with an account. Long-form is
// the point, unbounded is not.
describe('what the endpoints refuse', () => {
    it('rejects an empty or whitespace-only review', async () => {
        const user = await registerUser();
        const film = await createMovie();
        const url = '/social/items/' + film.id + '/review';

        expect((await user.auth(api().put(url)).send({ body: '' })).status).toBe(400);
        expect((await user.auth(api().put(url)).send({ body: '   ' })).status).toBe(400);
        expect((await user.auth(api().put(url)).send({})).status).toBe(400);
    });

    it('caps a review at 10k characters and a comment at 2k', async () => {
        const user = await registerUser();
        const film = await createMovie();

        const review = await user.auth(api().put('/social/items/' + film.id + '/review'))
            .send({ body: 'x'.repeat(10001) });
        expect(review.status).toBe(400);

        const comment = await user.auth(api().post('/social/items/' + film.id + '/comments'))
            .send({ body: 'x'.repeat(2001) });
        expect(comment.status).toBe(400);
    });

    it('refuses a vote that does not say which way', async () => {
        const author = await registerUser();
        const voter = await registerUser();
        const film = await createMovie();
        const r = await author.auth(api().put('/social/items/' + film.id + '/review')).send({ body: 'x' });

        const res = await voter.auth(api().post('/social/reviews/' + r.body.data.review.id + '/vote')).send({});
        expect(res.status).toBe(400);
    });

    it('refuses a review on an item that does not exist', async () => {
        const user = await registerUser();
        const res = await user.auth(api().put('/social/items/00000000-0000-4000-8000-000000000000/review'))
            .send({ body: 'x' });
        expect(res.status).toBe(404);
    });

    it('caps a bio at 500 characters', async () => {
        const user = await registerUser();
        const res = await user.auth(api().patch('/account/privacy')).send({ bio: 'x'.repeat(501) });
        expect(res.status).toBe(400);
    });

    it('rejects a privacy patch that changes nothing', async () => {
        const user = await registerUser();
        expect((await user.auth(api().patch('/account/privacy')).send({})).status).toBe(400);
    });
});

import 'dotenv/config';
import { searchAlbums } from '../src/adapters/media/musicbrainz.ts';
import { rankResults, scoreResult, RANKING_WEIGHTS } from '../src/services/rankingService.js';

/**
 * Music search quality benchmark.
 *
 * A script rather than a test, deliberately: it hits MusicBrainz live at one
 * request per second, so it is far too slow for the suite and would be flaky
 * inside it. The suite tests the ranking LOGIC against fixtures; this measures
 * ranking QUALITY against reality.
 *
 * Run: npm run bench:music
 *
 * The point is to make tuning evidence-based. Weights were guessed, and
 * guessing produced a photo book outranking the album it was about.
 */

// Curated, and chosen for the ways music search actually fails: covers,
// tributes, karaoke, live records, compilations, and titles that are also
// common words. Bare titles are included precisely because they are the hard
// case - MusicBrainz has no popularity signal to break those ties.
const BENCHMARK = [
    { query: 'thriller michael jackson', expect: { title: 'Thriller', artist: 'Michael Jackson' } },
    { query: 'thriller',                 expect: { title: 'Thriller', artist: 'Michael Jackson' }, hard: true },
    { query: 'abbey road beatles',       expect: { title: 'Abbey Road', artist: 'The Beatles' } },
    { query: 'abbey road',               expect: { title: 'Abbey Road', artist: 'The Beatles' }, hard: true },
    { query: 'in rainbows radiohead',    expect: { title: 'In Rainbows', artist: 'Radiohead' } },
    { query: 'in rainbows',              expect: { title: 'In Rainbows', artist: 'Radiohead' }, hard: true },
    { query: 'a night at the opera queen', expect: { title: 'A Night at the Opera', artist: 'Queen' } },
    { query: 'nevermind nirvana',        expect: { title: 'Nevermind', artist: 'Nirvana' } },
    { query: 'rumours fleetwood mac',    expect: { title: 'Rumours', artist: 'Fleetwood Mac' } },
    { query: 'back to black amy winehouse', expect: { title: 'Back to Black', artist: 'Amy Winehouse' } },
    { query: 'kind of blue miles davis', expect: { title: 'Kind of Blue', artist: 'Miles Davis' } },
    { query: 'ok computer radiohead',    expect: { title: 'OK Computer', artist: 'Radiohead' } },
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Where the expected album lands, 1-indexed. 0 means absent. */
const rankOf = (results, expect) => {
    const wantTitle = norm(expect.title);
    const wantArtist = norm(expect.artist);
    const i = results.findIndex((r) => {
        const [titlePart, artistPart] = String(r.title).split(' by ');
        return norm(titlePart) === wantTitle && norm(artistPart) === wantArtist;
    });
    return i + 1;
};

const pct = (n, total) => ((n / total) * 100).toFixed(0) + '%';

const run = async () => {
    console.log('Weights:', JSON.stringify(RANKING_WEIGHTS));
    console.log('');

    const rows = [];
    const failures = [];

    for (const bench of BENCHMARK) {
        // MusicBrainz 503s under load. A benchmark that dies on one is a
        // benchmark nobody runs - the same graceful-degradation rule the
        // search path follows.
        let raw = null;
        for (let attempt = 1; attempt <= 3 && !raw; attempt++) {
            try {
                raw = await searchAlbums(bench.query);
            } catch (err) {
                if (attempt === 3) failures.push(bench.query + ': ' + err.message);
                else await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
        }
        if (!raw) continue;

        const ranked = rankResults(bench.query, raw);

        const before = rankOf(raw, bench.expect);
        const after = rankOf(ranked, bench.expect);
        rows.push({ ...bench, before, after, top: ranked[0]?.title ?? '(none)' });

        const arrow = before === after ? '=' : after < before || before === 0 ? 'up' : 'DOWN';
        console.log(
            (bench.hard ? '[hard] ' : '       ') + bench.query.padEnd(32),
            'provider:' + String(before || '-').padStart(3),
            '-> ranked:' + String(after || '-').padStart(3),
            arrow.padEnd(5),
            '| top: ' + rows[rows.length - 1].top.slice(0, 44),
        );
    }

    const scored = rows.filter((r) => r.after > 0);
    const inTop = (n, key) => rows.filter((r) => r[key] > 0 && r[key] <= n).length;

    console.log('');
    console.log('                  provider order   after ranking');
    for (const n of [1, 3, 5]) {
        console.log(
            ('top-' + n + ' accuracy').padEnd(18),
            pct(inTop(n, 'before'), rows.length).padStart(8),
            pct(inTop(n, 'after'), rows.length).padStart(15),
        );
    }
    const meanAfter = scored.reduce((s, r) => s + r.after, 0) / (scored.length || 1);
    console.log('mean rank'.padEnd(18), ''.padStart(8), meanAfter.toFixed(1).padStart(15));
    console.log('not found'.padEnd(18),
        String(rows.filter((r) => !r.before).length).padStart(8),
        String(rows.filter((r) => !r.after).length).padStart(15));

    if (failures.length) {
        console.log('');
        console.log('provider failures (excluded from the numbers):');
        for (const f of failures) console.log('   ' + f);
    }

    const worsened = rows.filter((r) => r.before > 0 && r.after > r.before);
    if (worsened.length) {
        console.log('');
        console.log('WORSENED by ranking:');
        for (const r of worsened) console.log('   ' + r.query + ': ' + r.before + ' -> ' + r.after);
    }
};

await run();
process.exit(0);

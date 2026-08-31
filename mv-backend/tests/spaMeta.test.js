import { describe, it, expect } from 'vitest';
import { metaTagsFor, injectMeta } from '../src/middleware/spa.js';

const SHELL = `<!doctype html><html><head>
    <meta charset="UTF-8" />
    <meta name="description" content="mv - generic site description" />
    <title>mv - Personal media ledger</title>
  </head><body><div id="root"></div></body></html>`;

const item = (over = {}) => ({
    type: 'tv',
    title: 'Severance',
    releaseYear: 2022,
    overview: 'Mark leads a team whose memories have been surgically divided.',
    posterUrl: 'https://image.tmdb.org/t/p/w342/p.jpg',
    ...over,
});

// Slack, Discord, WhatsApp and iMessage read raw HTML and never run
// JavaScript, so setting document.title client-side does nothing for them.
// Without this every shared item link previewed identically.
describe('shared-link meta tags', () => {
    it('replaces the generic title rather than adding a second one', () => {
        const html = injectMeta(SHELL, metaTagsFor(item(), 'https://mv.test/media/tv/95396'));

        expect(html.match(/<title>/g)).toHaveLength(1);
        expect(html).toContain('<title>Severance (2022) - mv</title>');
        expect(html).not.toContain('Personal media ledger');
    });

    it('replaces the generic description rather than leaving both', () => {
        const html = injectMeta(SHELL, metaTagsFor(item()));
        expect(html.match(/name="description"/g)).toHaveLength(1);
        expect(html).not.toContain('generic site description');
    });

    it('carries the poster, which is what makes a preview worth having', () => {
        const html = injectMeta(SHELL, metaTagsFor(item()));
        expect(html).toContain('property="og:image"');
        expect(html).toContain('summary_large_image');
    });

    it('falls back to a plain card when there is no poster', () => {
        // summary_large_image with no image renders worse than no card at all.
        const tags = metaTagsFor(item({ posterUrl: null }));
        expect(tags).not.toContain('og:image');
        expect(tags).toContain('content="summary"');
    });

    it('marks films and shows with the right og:type', () => {
        expect(metaTagsFor(item({ type: 'tv' }))).toContain('video.tv_show');
        expect(metaTagsFor(item({ type: 'film' }))).toContain('video.movie');
    });

    it('escapes titles so a quote cannot break out of the attribute', () => {
        // Titles come from TMDB, not from us. An unescaped quote would end the
        // attribute early and put arbitrary markup into the head.
        const tags = metaTagsFor(item({ title: 'A "Quoted" <b>Title</b>' }));
        expect(tags).not.toContain('<b>');
        expect(tags).toContain('&quot;Quoted&quot;');
        expect(tags).toContain('&lt;b&gt;');
    });

    it('handles a missing overview and a missing year', () => {
        const tags = metaTagsFor(item({ overview: null, releaseYear: null }));
        expect(tags).toContain('Track Severance on mv.');
        expect(tags).toContain('<title>Severance - mv</title>');
    });

    it('truncates a long overview rather than shipping the whole synopsis', () => {
        const tags = metaTagsFor(item({ overview: 'x'.repeat(400) }));
        const description = tags.match(/name="description" content="(.*?)"/)[1];
        expect(description.length).toBeLessThanOrEqual(200);
    });
});

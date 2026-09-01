import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import express from 'express';
import * as tmdb from '../adapters/media/tmdb.ts';
import { cached } from '../utils/cache.js';

/**
 * Serves the built frontend, with per-item meta tags injected into the HTML.
 *
 * This is NOT server-side rendering, and deliberately so. Migrating to Next.js
 * would be a rewrite for no user-visible benefit, and SPEC 10 is explicit that
 * "rewrites are where working auth and tested ownership checks go to die".
 *
 * The problem being solved is narrower than SEO. Googlebot executes
 * JavaScript and indexes the SPA adequately. Slack, Discord, WhatsApp,
 * iMessage and Twitter do NOT - they read raw HTML and stop. So every shared
 * item link previewed identically: the site title, the site description, no
 * poster. On a discovery product where sharing a title is the organic loop,
 * that is the expensive part, and setting document.title client-side does not
 * fix it because the crawler has already left.
 *
 * So: same SPA bundle, same single deployed process, head rewritten for one
 * route. The data comes from the cache the public routes already fill.
 */

const escapeHtml = (str) =>
    String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Builds the head for one item. Exported so it can be tested without a build. */
export const metaTagsFor = (item, url) => {
    const year = item.releaseYear ? ` (${item.releaseYear})` : '';
    const title = `${item.title}${year} - mv`;
    const description = item.overview
        ? item.overview.slice(0, 200)
        : `Track ${item.title} on mv.`;

    return [
        `<title>${escapeHtml(title)}</title>`,
        `<meta name="description" content="${escapeHtml(description)}" />`,
        `<meta property="og:type" content="${item.type === 'tv' ? 'video.tv_show' : 'video.movie'}" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        item.posterUrl ? `<meta property="og:image" content="${escapeHtml(item.posterUrl)}" />` : '',
        url ? `<meta property="og:url" content="${escapeHtml(url)}" />` : '',
        // summary_large_image needs an image; without one the card renders
        // worse than no card at all.
        `<meta name="twitter:card" content="${item.posterUrl ? 'summary_large_image' : 'summary'}" />`,
    ].filter(Boolean).join('\n    ');
};

/** Replaces the existing title + description in the shipped index.html. */
export const injectMeta = (html, tags) =>
    html
        .replace(/<title>[\s\S]*?<\/title>/i, '')
        .replace(/<meta\s+name="description"[^>]*>/i, '')
        .replace('</head>', `  ${tags}\n  </head>`);

/**
 * Is this a browser asking for a page, rather than code asking for data?
 *
 * Three frontend routes share a path with an API mount - /deals, /lists and
 * /watchlist are each both a page and a router. Whichever is registered first
 * wins, so mounting the API first returned JSON to anyone who opened
 * /lists directly, refreshed on /watchlist, or followed a shared /deals link.
 *
 * Invisible in development, where Vite serves pages on another port entirely,
 * and broken in production, where this process serves both.
 *
 * Renaming every API mount to /api would also fix it and is the more usual
 * shape, but it would rewrite the URL in ~500 tests to solve a problem that is
 * really about content negotiation. A browser navigating asks for text/html;
 * axios asks for application/json and never for html.
 *
 * Tested for EXPLICITLY rather than with req.accepts(), which returns the
 * first type offered when a request carries no Accept header at all - so
 * curl, supertest and anything else terse would have been served the page
 * instead of the API.
 */
const wantsHtml = (req) => String(req.headers.accept ?? '').includes('text/html');

export const mountSpa = (app) => {
    // Resolved from THIS FILE, not the working directory.
    //
    // path.resolve('../mv-frontend/dist') resolves against process.cwd(), so
    // it only found the build when the process happened to start inside
    // mv-backend. A host that starts the server from the repository root
    // would resolve it one level above the repo, find nothing, and mountSpa
    // would return false - which looks like "the API works and every page
    // 404s" rather than an error.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dist = path.resolve(
        process.env.FRONTEND_DIST ?? path.join(here, '..', '..', '..', 'mv-frontend', 'dist'),
    );

    // In development Vite serves the frontend on its own port, so there is no
    // build to serve and this does nothing.
    if (!existsSync(path.join(dist, 'index.html'))) return false;

    // Item pages first, so they get meta before the catch-all sends the
    // untouched shell.
    app.get('/media/:type/:externalId', async (req, res, next) => {
        const { type, externalId } = req.params;
        if (!wantsHtml(req)) return next();
        if (type !== 'film' && type !== 'tv') return next();

        try {
            const item = await cached(
                `details:${type}:${externalId}`,
                60 * 60 * 1000,
                () => tmdb.getDetailsWithCast(type, externalId),
            );
            const html = await readFile(path.join(dist, 'index.html'), 'utf8');
            const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
            return res.type('html').send(injectMeta(html, metaTagsFor(item, url)));
        } catch {
            // A dead id or a TMDB outage must still serve the app - the client
            // renders its own "could not find that title".
            return next();
        }
    });

    app.use(express.static(dist, { index: false }));

    // Everything else a BROWSER asks for is a client route. Anything that
    // wanted JSON falls through to the API routers and their 404, so this
    // cannot swallow an API response or mask a genuine missing endpoint.
    app.get(/.*/, async (req, res, next) => {
        if (!wantsHtml(req)) return next();
        res.type('html').send(await readFile(path.join(dist, 'index.html'), 'utf8'));
    });

    return true;
};

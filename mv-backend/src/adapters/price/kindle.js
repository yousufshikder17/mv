// Kindle Daily Deals RSS -> PriceQuote[] (SPEC §7).
//
// This feed is the only source of book price history that will ever exist in
// this system — it carries no history of its own, so a day not polled is a day
// gone. That is why M0 is first.
//
// The feed URL is configuration, not a constant: Amazon publishes no official
// Kindle deals RSS, so which mirror or aggregator we point at can change
// without the parsing changing. Set KINDLE_RSS_URL in .env.

export const SOURCE = 'kindle_rss';
export const PLATFORM = 'Amazon Kindle';

// ponytail: regex, not an XML parser. RSS 2.0 is regular enough for tag-level
// extraction and this saves a dependency; swap in fast-xml-parser if a feed
// ever nests markup inside these fields.
const ITEM_RE = /<item[\s>][\s\S]*?<\/item>/gi;

const tag = (xml, name) => {
    // String.raw, not a plain template: `\s` in a normal template literal
    // collapses to a literal 's' before RegExp ever sees it, which silently
    // produces a pattern that matches nothing.
    const m = xml.match(new RegExp(String.raw`<${name}(?:\s[^>]*)?>([\s\S]*?)</${name}>`, 'i'));
    if (!m) return null;
    const text = m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#3[49];/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
    return text || null;
};

// "$1.99" / "$1,299.00" / "USD 1.99" -> cents. Integer cents throughout: a
// price that arrives as a float never survives a decade of aggregation.
const toCents = (str) => {
    if (!str) return null;
    const m = str.match(/(?:\$|USD\s*)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    if (!m) return null;
    const cents = Math.round(Number.parseFloat(m[1].replace(/,/g, '')) * 100);
    return Number.isFinite(cents) ? cents : null;
};

/** ASIN is the only stable identifier Amazon URLs carry. */
export const asinFromUrl = (url) => url?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] ?? null;

const parseDate = (str) => {
    if (!str) return null;
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * @param {string} xml   raw feed body
 * @param {Date}   now   fetch time; injected so tests are not clock-dependent
 * @returns {Array} PriceQuote rows, skipping items with no ASIN or no price
 */
export const parseKindleFeed = (xml, now = new Date()) => {
    const quotes = [];

    for (const block of String(xml ?? '').match(ITEM_RE) ?? []) {
        const url = tag(block, 'link');
        // guid is often the product URL when link is a redirect wrapper.
        const externalId = asinFromUrl(url) ?? asinFromUrl(tag(block, 'guid'));
        if (!externalId || !url) continue;

        const title = tag(block, 'title');
        const description = tag(block, 'description');
        // Deal price lives in the title on most of these feeds and in the body
        // on the rest; the list price, when present, is always labelled.
        const listMatch = (description ?? '').match(/(?:list|was|regular(?:ly)?)[^$]{0,20}(\$[0-9][0-9,.]*)/i);
        const priceCents = toCents(title) ?? toCents(description);
        if (priceCents === null) continue;

        const originalPriceCents = toCents(listMatch?.[1]);
        // A "list price" below the deal price is a mis-parse, not a markup.
        const original = originalPriceCents > priceCents ? originalPriceCents : null;

        quotes.push({
            source: SOURCE,
            externalId,
            title,
            platform: PLATFORM,
            priceCents,
            currency: 'USD',
            originalPriceCents: original,
            discountPercent: original
                ? Math.round(((original - priceCents) / original) * 100)
                : null,
            saleEnds: null, // daily deals expire at midnight PT; the feed never says so
            url,
            fetchedAt: now,
            quoteDate: parseDate(tag(block, 'pubDate')) ?? now,
        });
    }

    return quotes;
};

/** One feed. Throws on a non-2xx so the caller can report which one failed. */
const fetchOne = async (url, now) => {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: {
            Accept: 'application/rss+xml, application/xml, text/xml',
            // Several deal aggregators 403 an unidentified client.
            'User-Agent': 'MediaVaultBot/0.1 (+price tracking; contact via repo)',
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseKindleFeed(await res.text(), now);
};

/**
 * Fetches every configured feed and merges the results.
 *
 * KINDLE_RSS_URL takes a comma-separated list, because no single source covers
 * Kindle deals — Amazon publishes no official feed, and the aggregators each
 * see a different slice. More feeds is strictly better coverage.
 *
 * One feed failing must not lose the others: a day of book prices cannot be
 * backfilled (SPEC §7), so partial data beats none. Failures are returned for
 * the job to log rather than thrown.
 *
 * Deduped in memory as well as at the unique constraint — two aggregators
 * listing the same book on the same day is the normal case, not the exception,
 * and onConflictDoNothing cannot dedupe rows inside one INSERT.
 */
export const fetchKindleDeals = async (urls = process.env.KINDLE_RSS_URL, now = new Date()) => {
    const list = String(urls ?? '').split(',').map((u) => u.trim()).filter(Boolean);
    if (!list.length) throw new Error('KINDLE_RSS_URL is not set in mv-backend/.env');

    const settled = await Promise.allSettled(list.map((u) => fetchOne(u, now)));

    const seen = new Map();
    const errors = [];

    settled.forEach((r, i) => {
        if (r.status === 'rejected') {
            errors.push(`${list[i]}: ${r.reason.message}`);
            return;
        }
        for (const q of r.value) {
            const key = `${q.externalId}|${q.quoteDate instanceof Date ? q.quoteDate.toISOString().slice(0, 10) : q.quoteDate}`;
            // Keep the lowest price when feeds disagree — that is the deal.
            const prev = seen.get(key);
            if (!prev || q.priceCents < prev.priceCents) seen.set(key, q);
        }
    });

    return { quotes: [...seen.values()], errors };
};

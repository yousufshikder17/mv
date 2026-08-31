import { listDeals } from './dealService.js';

/**
 * RSS for the deal feed.
 *
 * SPEC 8 draws a hard line here, and it is the reason this file is separate
 * from the JSON feed rather than a formatting switch on it:
 *
 *   "The public RSS feed and deal history may carry prices and store links.
 *    They may not republish RAWG's game metadata wholesale. Pricing data is
 *    yours; their catalogue is not."
 *
 * A rendered page showing a cover to a visitor is display. A machine-readable
 * feed consumed by other services is far closer to "making it available for
 * other businesses", which RAWG's terms forbid outright.
 *
 * So: title, price, discount, store, link, and our own quality assessment.
 * No description, no cover art, no genres, no platforms - nothing sourced
 * from a metadata provider beyond the title needed to say which deal it is.
 */

const NL = String.fromCharCode(10);

const escape = (str) =>
    String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const money = (cents, currency = 'USD') => {
    const symbol = { USD: '$', GBP: '£', EUR: '€' }[currency] ?? '';
    return symbol + (cents / 100).toFixed(2);
};

export const dealsToRss = (deals, { siteUrl = '' } = {}) => {
    const items = deals.map((deal) => {
        const price = money(deal.priceCents, deal.currency);
        const was = deal.originalPriceCents ? ', was ' + money(deal.originalPriceCents, deal.currency) : '';

        // Deliberately terse. Every field here is a price, a store or our own
        // judgement - none of it is a provider's catalogue content.
        const description = [
            price + was,
            deal.discountPercent ? deal.discountPercent + '% off' : null,
            'at ' + deal.platform,
            deal.reason,
        ].filter(Boolean).join(' | ');

        return [
            '    <item>',
            '      <title>' + escape(deal.title + ' - ' + price + ' at ' + deal.platform) + '</title>',
            // Links to the STORE, not to us: the point of the feed is the deal.
            '      <link>' + escape(deal.url) + '</link>',
            '      <guid isPermaLink="false">' + escape(deal.mediaItemId + ':' + deal.quoteDate + ':' + deal.platform) + '</guid>',
            '      <description>' + escape(description) + '</description>',
            '      <pubDate>' + new Date(deal.quoteDate).toUTCString() + '</pubDate>',
            '    </item>',
        ].join(NL);
    });

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0">',
        '  <channel>',
        '    <title>Media Vault deals</title>',
        '    <link>' + escape(siteUrl + '/deals') + '</link>',
        '    <description>Price drops on tracked films, shows, games, books and music.</description>',
        '    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>',
        ...items,
        '  </channel>',
        '</rss>',
    ].join(NL);
};

export const buildDealFeed = async (opts = {}) => {
    // Capped tighter than the page. A feed reader wants the good ones, not
    // everything currently on sale.
    const deals = await listDeals({ ...opts, limit: 40 });
    return dealsToRss(deals, opts);
};

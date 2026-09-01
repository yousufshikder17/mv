import { cached } from '../utils/cache.js';

/**
 * Album cover resolution.
 *
 * MusicBrainz search returns release groups; the Cover Art Archive holds the
 * artwork, and for a release group with none it answers 400. Pointing an <img>
 * straight at it therefore produced one failed request per coverless album -
 * measured in a real browser, 132 of them on a single music search, each
 * costing a DNS lookup, a TLS handshake and a round trip before failing.
 *
 * Search cannot know in advance which albums have art. ListenBrainz's
 * fresh-releases feed carries caa_id, which is how the browse row avoids this,
 * but the popularity endpoint used during search does not - it returns listen
 * counts and nothing else.
 *
 * So the question is answered once, here, and remembered:
 *
 *   art exists  -> 302 to the Cover Art Archive
 *   it does not -> a placeholder, 200
 *
 * A redirect rather than a proxy: the browser still fetches the image straight
 * from the archive, so this server never carries image bytes. It carries one
 * HEAD request per album, ever, and nothing at all after that.
 *
 * This adds no latency to search, which is the reason it lives on the image
 * path rather than in the search response. Resolving during search would put
 * a network call for every unknown album in front of every music query, to fix
 * something no user can see - the placeholder renders either way.
 */

const CAA = 'https://coverartarchive.org/release-group';

// Cover art does not come and go. A month is conservative, and a negative is
// worth remembering exactly as long as a positive: an album with no scan today
// will not have one on Thursday.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TIMEOUT_MS = 4000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The placeholder, inline.
 *
 * A file would be one more thing to deploy and one more path to get wrong.
 * It deliberately matches the surface colour of a card so a missing cover
 * reads as an empty slot rather than a broken one.
 */
const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300" role="img" aria-label="No cover art">
  <rect width="200" height="300" fill="#161719"/>
  <circle cx="100" cy="140" r="34" fill="none" stroke="#2a2b2e" stroke-width="2"/>
  <circle cx="100" cy="140" r="6" fill="#2a2b2e"/>
</svg>`;

const sendPlaceholder = (res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    // Long-lived: this is a static asset that happens to be served from a
    // dynamic route.
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.status(200).send(PLACEHOLDER);
};

/** Does the archive hold a front cover for this release group? */
const hasArt = (mbid) =>
    cached(`caa:has:${mbid}`, TTL_MS, async () => {
        try {
            const res = await fetch(`${CAA}/${mbid}/front-250`, {
                method: 'HEAD',
                redirect: 'follow',
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { 'User-Agent': process.env.MUSICBRAINZ_USER_AGENT ?? 'MediaVault/0.1' },
            });
            return res.ok;
        } catch {
            // Timed out or unreachable. Answer "no" for now rather than
            // failing the image, and let the cache expire so a blip does not
            // blank an album's cover for a month.
            return false;
        }
    });

/** GET /covers/album/:mbid */
export const albumCover = async (req, res) => {
    const { mbid } = req.params;

    if (!UUID.test(mbid)) return sendPlaceholder(res);

    if (await hasArt(mbid)) {
        // 302 rather than 301: the archive gaining a cover later should not be
        // permanently cached against the album by every browser that looked.
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.redirect(302, `${CAA}/${mbid}/front-250`);
    }

    return sendPlaceholder(res);
};

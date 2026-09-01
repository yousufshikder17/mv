// Media vocabulary — one place, because the backend stores general statuses
// and the label depends on what the item is.
//
// The DB stores IN_PROGRESS; "Watching" / "Reading" / "Playing" is
// presentation, derived from `type`. That is the whole reason the stored enum
// can stay at six values while new media types are added without a migration.
// Mirrors STATUS_LABELS in mv-backend/src/validators/watchlistVallidators.js.

export const TYPE_LABEL = {
  film: 'Film',
  tv: 'TV',
  book: 'Book',
  game: 'Game',
  album: 'Album',
};

/** Which statuses each type may use. Albums are never "completed" (SPEC §6). */
// The type pages, in nav order. `path` is the public URL, `type` the value
// the API speaks — kept together so the nav, the routes and the API call can
// never drift apart.
export const BROWSE_NAV = [
  { path: 'films',  type: 'film',  label: 'Films' },
  { path: 'shows',  type: 'tv',    label: 'Shows' },
  { path: 'games',  type: 'game',  label: 'Games' },
  { path: 'books',  type: 'book',  label: 'Books' },
  { path: 'music',  type: 'album', label: 'Music' },
];

// The hero copy for each type page. One entry per type so the same page
// component can carry five different pitches, and adding a sixth media type
// is a block here rather than a new file.
// A curated wall for the Films page, kept from the original landing hero.
//
// Deliberately not the trending feed. Trending is whatever released this
// month; these nine are a statement of taste, which is what a hero is for -
// and they are chosen to sit together as a palette rather than compete.
// TMDB attribution for them lives in the page footer, as their terms require.
const TMDB_ART = (path) => 'https://image.tmdb.org/t/p/w342' + path;

const FILM_ART = [
  '/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg', // Blade Runner 2049
  '/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg', // In the Mood for Love
  '/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg', // Dune
  '/602vevIURmpDfzbnv5Ubi6wIkQm.jpg', // Drive
  '/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg', // Arrival
  '/fa0RDkAlCec0STeMNAhPaF89q6U.jpg', // There Will Be Blood
  '/7fn624j5lj3xTme2SgiLCeuedmO.jpg', // Whiplash
  '/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg', // Her
  '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', // Parasite
].map(TMDB_ART);

// Home's two film slots, pinned.
//
// Home draws the rest of its wall from the live catalogue, but the film slots
// are fixed so the two pages do not open on the same posters: Dune and
// Parasite belong to the Films wall above, and seeing them again one click
// later makes the site look smaller than it is.
export const HOME_FILM_ART = [
  '/lxM6kqilAdpdhqUl2biYp5frUxE.jpg', // Jaws
  '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', // The Shawshank Redemption
].map(TMDB_ART);

// Two pinned covers for the Music wall.
//
// ListenBrainz fresh releases is genuinely fresh - it is what came out in the
// last month, which is the right row for "popular right now" and the wrong one
// for a hero. These two are picked, and keyed by release-group MBID so they
// resolve through the same Cover Art Archive path as everything else.
const CAA_ART = (mbid) => 'https://coverartarchive.org/release-group/' + mbid + '/front-250';

const MUSIC_ART = [
  'd9ca78a8-e6d1-442c-bad1-4e5f26542111', // Hellfire — black midi
  '25267682-bdfc-435a-b6a7-89c266f7d0e8', // Absolute Elsewhere — Blood Incantation
].map(CAA_ART);

export const BROWSE_COPY = {
  film: {
    art: FILM_ART,
    headline: ['Every film you’ve', 'ever', 'watched, in one', 'vault.'],
    sub: 'Log what you have seen, what you gave up on, and what you keep meaning to get to.',
    features: [
      ['Track Everything', 'Watched, watching, abandoned, or queued — and rewatches count as their own status rather than overwriting the first time.'],
      ['Rate & Review', 'Score out of 10 with decimals, review at length, flag spoilers, and keep private notes nobody else sees.'],
      ['Know what you are getting', 'Runtime, director, cast and the original title — because a film is not only its English name.'],
    ],
    cta: ['Your film vault is waiting.', 'Free forever for personal use. Start logging today.'],
  },
  tv: {
    headline: ['Every series, every', 'season', 'accounted', 'for.'],
    sub: 'Track a show to the episode, rate each season on its own, and remember exactly where you stopped.',
    features: [
      ['Season by season', 'Rate each season separately. A show that fell apart in series four should not average out to "fine".'],
      ['Down to the episode', 'Progress is stored as season and episode, so picking a show back up after a year takes no detective work.'],
      ['Never a stale count', 'Returning series refresh every three days rather than monthly — mid-season, last month’s episode count is useless.'],
    ],
    cta: ['Your next series is waiting.', 'Free forever for personal use. Start tracking today.'],
  },
  game: {
    headline: ['Every game you', 'own', 'and what it costs', 'today.'],
    sub: 'A backlog that knows its own prices — watched against real historical lows, not launch RRP.',
    features: [
      ['Prices with history', 'An alert fires when something is genuinely cheap, measured against its all-time low across dozens of stores.'],
      ['Playtime, not page count', 'Progress in hours, plus which platform you actually own it on — a different fact from what it was released on.'],
      ['Rate & Review', 'Score out of 10, review at length, and see what other people made of it.'],
    ],
    cta: ['Your backlog is waiting.', 'Free forever for personal use. Start tracking today.'],
  },
  book: {
    headline: ['Every book you have', 'read', 'and the ones still', 'waiting.'],
    sub: 'Page counts, editions and prices, for the pile you finished and the pile you did not.',
    features: [
      ['Reading, not watching', 'Progress in pages, with the status vocabulary a book actually needs — reading, reread, abandoned.'],
      ['Prices worth waiting for', 'Ebook prices are tracked daily, so a long-term drop is visible rather than something you happen to catch.'],
      ['Editions that differ', 'Page counts and covers vary by edition. The one you read is the one recorded.'],
    ],
    cta: ['Your reading pile is waiting.', 'Free forever for personal use. Start logging today.'],
  },
  album: {
    artLead: MUSIC_ART,
    headline: ['Every album worth', 'returning', 'to, in one', 'shelf.'],
    sub: 'A record collection that does not care which service you happen to be paying for this year.',
    features: [
      ['Collected, not consumed', 'An album is not "completed" — you listen to it or you own it, and the statuses say so.'],
      ['Open data underneath', 'Built on MusicBrainz and ListenBrainz, so your collection is not hostage to one streaming platform’s catalogue.'],
      ['Rate & Review', 'Score out of 10, review at length, and keep the notes that explain why.'],
    ],
    cta: ['Your shelf is waiting.', 'Free forever for personal use. Start collecting today.'],
  },
};

// What each type page shows, and where the row honestly comes from. Only TMDB
// publishes a chart; the rest borrow the nearest real thing their source has.
export const BROWSE_SOURCE = {
  film:  'Trending this week, from TMDB',
  tv:    'Trending this week, from TMDB',
  game:  'Most added this year, from RAWG',
  book:  'Trending this week, from Open Library',
  album: 'New this month, by artists people listen to — ListenBrainz',
};

// The type filter, in the order the nav and the search page both use.
// Empty string is "all" — it maps straight onto the API's optional ?type=.
export const TYPE_TABS = [
  ['', 'All'], ['film', 'Films'], ['tv', 'TV'],
  ['game', 'Games'], ['book', 'Books'], ['album', 'Music'],
];

export const STATUSES_BY_TYPE = {
  film:  ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
  tv:    ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
  book:  ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
  game:  ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
  album: ['PLANNED', 'IN_PROGRESS', 'COLLECTED'],
};

const PER_TYPE = {
  film:  { IN_PROGRESS: 'Watching',  REVISITING: 'Rewatching', COMPLETED: 'Watched' },
  tv:    { IN_PROGRESS: 'Watching',  REVISITING: 'Rewatching', COMPLETED: 'Watched' },
  book:  { IN_PROGRESS: 'Reading',   REVISITING: 'Rereading' },
  game:  { IN_PROGRESS: 'Playing',   REVISITING: 'Replaying' },
  album: { IN_PROGRESS: 'Listening', COLLECTED:  'In collection' },
};

const DEFAULT = {
  PLANNED:     'Planned',
  IN_PROGRESS: 'In progress',
  COMPLETED:   'Completed',
  DROPPED:     'Dropped',
  REVISITING:  'Revisiting',
  COLLECTED:   'Collected',
};

export const statusLabel = (type, status) =>
  PER_TYPE[type]?.[status] ?? DEFAULT[status] ?? status;

export const statusesFor = (type) => STATUSES_BY_TYPE[type] ?? STATUSES_BY_TYPE.film;

/** The unit progress is counted in. Null where progress is meaningless. */
export const PROGRESS_UNIT = {
  film:  null,        // atomic — a film is watched or it is not
  tv:    'episode',
  book:  'page',
  game:  'hour',
  album: null,
};

/** Sources that require visible attribution on any page showing their data. */
export const ATTRIBUTION_BY_SOURCE = {
  tmdb: 'tmdb',
  rawg: 'rawg',
}

/** "S2 E4 of 10", "page 120 of 300", "hour 12 of 62". Null when nothing to show. */
export const progressLabel = (type, item) => {
  const unit = PROGRESS_UNIT[type];
  if (!unit || item?.progressCurrent == null) return null;

  const of = item.progressTotal ? ` of ${item.progressTotal}` : '';
  if (type === 'tv') {
    const season = item.progressSeason ? `S${item.progressSeason} ` : '';
    return `${season}E${item.progressCurrent}${of}`;
  }
  // Hours read better suffixed than prefixed: "12h of 62h", not "hour 12 of 62".
  if (type === 'game') {
    return `${item.progressCurrent}h${item.progressTotal ? ` of ${item.progressTotal}h` : ''}`;
  }
  return `${unit} ${item.progressCurrent}${of}`;
};

/** The status a "mark done" toggle should move to, and back from. */
export const doneStatusFor = (type) => (type === 'album' ? 'COLLECTED' : 'COMPLETED');

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
// Curated hero walls, one per page.
//
// Every one of these URLs was resolved through the same adapters the app uses
// and checked for a 200 before being written down. A hardcoded cover that
// 404s is worse than no wall at all, because it fails silently and only on
// someone else's screen.
//
// Curated rather than fed, because a hero is a statement of taste and a feed
// is whatever came out this month. The rows underneath are still live.
const TMDB_ART = (path) => 'https://image.tmdb.org/t/p/w342' + path;
const CAA_ART = (mbid) => 'https://coverartarchive.org/release-group/' + mbid + '/front-250';

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

const TV_ART = [
  '/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg', // The Sopranos
  '/lA9CNSdo50iQPZ8A2fyVpMvJZAf.jpg', // Twin Peaks
  '/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg', // Breaking Bad
  '/4lbclFySvugI51fwsyxBTOm4DqK.jpg', // The Wire
  '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg', // Severance
  '/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg', // Chernobyl
  '/27vEYsRKa3eAniwmoccOoluEXQ1.jpg', // Fleabag
  '/zjg4jpK1Wp2kiRvtt5ND0kznako.jpg', // Better Call Saul
  '/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg', // Succession
].map(TMDB_ART);

// RAWG art is landscape key art rather than box art, which is why the game
// wall reads differently from the others. Their own images, their own shape.
const GAME_ART = [
  'https://media.rawg.io/media/games/0af/0afe9e8ace196123d8c7cf22172cec63.jpg', // Disco Elysium
  'https://media.rawg.io/media/games/4cf/4cfc6b7f1850590a4634b08bfab308ab.jpg', // Hollow Knight
  'https://media.rawg.io/media/games/9f4/9f418898f5415668ca47b5f4ab1ecfeb.jpg', // Outer Wilds
  'https://media.rawg.io/media/games/511/5118aff5091cb3efec399c808f8c598f.jpg', // Red Dead Redemption 2
  'https://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a552855.jpg', // Elden Ring
  'https://media.rawg.io/media/games/2ba/2bac0e87cf45e5b508f227d281c9252a.jpg', // Portal 2
  'https://media.rawg.io/media/games/1f4/1f47a270b8f241e4676b14d39ec620f7.jpg', // Hades
  'https://media.rawg.io/media/games/618/618c2031a07bbff6b4f611f10b6bcdbc.jpg', // The Witcher 3
  'https://media.rawg.io/media/games/052/052f9afc7aaeea3e2c5d46eafa92c64e.jpg', // Return of the Obra Dinn
];

const BOOK_ART = [
  '11481354', // Dune
  '419991',   // Blood Meridian
  '10618463', // The Left Hand of Darkness
  '1047334',  // Never Let Me Go
  '8261367',  // Beloved
  '10226290', // Piranesi
  '198120',   // The Road
  '6714077',  // Cloud Atlas
  '8345848',  // Wolf Hall
].map((id) => 'https://covers.openlibrary.org/b/id/' + id + '-M.jpg');

const MUSIC_ART = [
  'd9ca78a8-e6d1-442c-bad1-4e5f26542111', // Hellfire - black midi
  '25267682-bdfc-435a-b6a7-89c266f7d0e8', // Absolute Elsewhere - Blood Incantation
  '6e335887-60ba-38f0-95af-fae7774336bf', // In Rainbows - Radiohead
  'd9103c72-3807-4378-9ce7-b6f3e8fdd547', // To Pimp a Butterfly - Kendrick Lamar
  'cb76227e-3ac0-3002-9a10-615a5b73cc59', // Loveless - My Bloody Valentine
  '5cbcdd9f-4b7d-3b3c-b9f2-6b0e75971157', // Sound of Silver - LCD Soundsystem
  '0da340a0-6ad7-4fc2-a272-6f94393a7831', // Blonde - Frank Ocean
  'ab570ccb-b06b-3746-8147-4903163ba895', // Madvillainy - Madvillain
  'aa0b4e86-358e-4c92-aecd-94f5f59233f7', // The Money Store - Death Grips
].map(CAA_ART);

// Home's own wall. Deliberately shares nothing with the five above.
//
// It reused a cover or two from each type page at first, which made home read
// as a summary of the other pages rather than a page in its own right.
//
// The register is different too, and that is the point. The type pages can
// afford deep cuts - someone on /films has already chosen films. Home is the
// first thing a stranger sees, so recognition beats taste: these are things
// almost anyone can name on sight, across all five media types, which is the
// one claim this page actually makes.
const RAWG_ART = (path) => 'https://media.rawg.io/media/games/' + path;
const OL_ART = (id, size = 'M') =>
  'https://covers.openlibrary.org/b/id/' + id + '-' + size + '.jpg';

// Order matters, for two reasons.
//
// .cell:nth-child(2) and (6) are the two cells left in full colour; the rest
// are desaturated and darkened. The two most colourful covers sit there on
// purpose - illustration and a gradient sleeve survive that treatment, a pale
// group photo does not.
//
// The wall is also masked: it fades out below 55% of its height and past 70%
// of its width, so the nine cells are not equally visible. Reading as a 3-wide
// grid, the top-left is barely touched and the bottom-right is faded by both
// gradients at once.
//
// Gatsby sits in that bottom-right corner by choice. It is the most faded cell
// on the wall, so the cover reads as a suggestion rather than a statement -
// which is the intent. Do not "fix" this by moving it inward.
export const HOME_ART = [
  TMDB_ART('/lxM6kqilAdpdhqUl2biYp5frUxE.jpg'),          // Jaws
  TMDB_ART('/qwi3p6PzKfQZ4YXBzv3CP5pO2dE.jpg'),          // Gravity Falls        <- colour cell
  RAWG_ART('da1/da1b267764d77221f07a4386b6548e5a.jpg'),  // Dark Souls III
  TMDB_ART('/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg'),          // The Shawshank Redemption
  TMDB_ART('/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg'),          // Game of Thrones
  CAA_ART('08aa7a6c-3e43-4459-87b2-e47faf3a088a'),       // Currents - Tame Impala <- colour cell
  TMDB_ART('/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg'),          // Alien (1979)
  RAWG_ART('8cd/8cd179c85bd3de8f79bef245b15075fb.jpg'),  // Machinarium
  // Photographed jacket, not a flat scan: a sliver of the book's spine
  // shows down the left edge. A small zoom crops it out.
  { src: OL_ART('14314120', 'L'), zoom: 1.1 },           // The Great Gatsby - Cugat's Celestial Eyes
];

// Book covers are chosen by cover id, after looking at the image. Searching
// by title is not enough: Open Library serves whichever edition it holds, and
// the first hit for The Great Gatsby is an Oxford schools reprint with no art
// on it at all, while Nineteen Eighty-Four is a blank cloth binding.
//
// 14314120 is the 1925 first-edition jacket - Francis Cugat's Celestial Eyes,
// the eyes and lips over the carnival lights. Requested by name as the iconic
// one, and it is: probably the most recognised book cover ever made. Served at
// -L because a large scan exists for this id, which is not true of every
// cover; the hero cell is big enough for the difference to show.
//
// Swaps that were considered and are one line each, kept here so the choice
// is visible rather than forgotten:
//   Great Gatsby  <-> Jurassic Park      OL_ART('12882940')
//                     Chip Kidd's jacket, black skeleton on white.
//                 <-> A Clockwork Orange  OL_ART('13151224')
//                     The 1962 illustrated jacket, strong orange. Goes muddy
//                     outside one of the two colour cells.
//                 <-> The Hobbit          OL_ART('14627509')
//                     1960s Ballantine paperback. Warm, but three lines of
//                     cover text and a busy oval read as clutter at this size.
//                 <-> The Little Prince   OL_ART('10708272')
//                 <-> Where the Wild Things Are  OL_ART('50842')
//                     Landscape cover, so 2/3 crops it hard.
//   Gravity Falls <-> The Office (US, 2005)
//                     TMDB_ART('/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg')
//                     Rejected on the art: five people against white paper on
//                     a pale ground goes to mud once the wall darkens it.
//   Machinarium   <-> ICO   RAWG_ART('3ef/3ef0dc5bda761da51de4dcb170dcf32a.jpg')
//   Currents      <-> Dark Side of the Moon
//                     CAA_ART('f5093c06-23e3-404f-aeaa-40f72885ee3a')

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
    art: TV_ART,
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
    art: GAME_ART,
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
    art: BOOK_ART,
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
    art: MUSIC_ART,
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

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

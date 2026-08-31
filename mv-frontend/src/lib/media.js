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

/** "S2 E4 of 10", or "page 120 of 300". Null when there is nothing to show. */
export const progressLabel = (type, item) => {
  const unit = PROGRESS_UNIT[type];
  if (!unit || item?.progressCurrent == null) return null;

  const of = item.progressTotal ? ` of ${item.progressTotal}` : '';
  if (type === 'tv') {
    const season = item.progressSeason ? `S${item.progressSeason} ` : '';
    return `${season}E${item.progressCurrent}${of}`;
  }
  return `${unit} ${item.progressCurrent}${of}`;
};

/** The status a "mark done" toggle should move to, and back from. */
export const doneStatusFor = (type) => (type === 'album' ? 'COLLECTED' : 'COMPLETED');

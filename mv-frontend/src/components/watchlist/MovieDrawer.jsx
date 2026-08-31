import { useEffect, useRef } from 'react'
import Poster from '../ui/Poster.jsx'
import StarRating from '../ui/StarRating.jsx'
import styles from './MovieDrawer.module.css'
import { statusesFor, statusLabel, doneStatusFor, PROGRESS_UNIT } from '../../lib/media.js'
import SeasonRatings from './SeasonRatings.jsx'


export default function MovieDrawer({ item, movie, open, onClose, onUpdateRating, onUpdateStatus, onUpdateProgress, onRemove, showToast }) {
  const drawerRef = useRef(null)

  // Trap focus & close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!item || !movie) return null

  // Status vocabulary and labels are per media type: the backend stores
  // IN_PROGRESS, and whether that reads "Watching" or "Reading" depends on
  // what this is.
  const type = movie.type ?? 'film'

  return (
    <>
      {/* Scrim */}
      <div
        className={`scrim ${open ? 'open' : ''}`}
        onClick={onClose}
        id="drawer-scrim"
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className={`drawer ${open ? 'open' : ''}`}
        ref={drawerRef}
        aria-label="Movie detail"
        id="movie-drawer"
      >
        {/* Close button */}
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close detail panel"
          id="drawer-close-btn"
        >
          ✕
        </button>

        {/* Backdrop poster */}
        <div className={styles.backdropPoster}>
          <Poster url={movie.posterUrl} title={movie.title} aspectRatio="16/9" className={styles.backdropImg} />
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Eyebrow */}
          <p className={styles.eyebrow}>
            {movie.releaseYear}
            {movie.runtime && ` · ${movie.runtime}m`}
          </p>

          {/* Title */}
          <h2 className={styles.title}>{movie.title}</h2>

          {/* Genres */}
          {movie.genres?.length > 0 && (
            <div className={styles.genres}>
              {movie.genres.map((g) => <span key={g} className="chip">{g}</span>)}
            </div>
          )}

          {/* Overview */}
          {movie.overview && (
            <p className={styles.overview}>{movie.overview}</p>
          )}

          <hr className={styles.divider} />

          {/* Rating */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Your Rating</p>
            <StarRating
              value={item.rating}
              onChange={(r) => onUpdateRating(item.id, r)}
              size="lg"
            />
            {item.rating != null && (
              <p className={styles.ratingNum}>{item.rating} / 10</p>
            )}
          </div>

          {/* Progress. Only for types where it means something - a film is
              watched or it is not, so PROGRESS_UNIT is null and this whole
              block disappears. */}
          {PROGRESS_UNIT[type] && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Progress</p>
              <div className={styles.progressRow}>
                {type === 'tv' && (
                  <label className={styles.progressField}>
                    <span>Season</span>
                    <input
                      type="number"
                      min="1"
                      max={movie.seasonCount ?? undefined}
                      value={item.progressSeason ?? ''}
                      onChange={(e) => onUpdateProgress(item.id, {
                        progressSeason: e.target.value === '' ? null : Number(e.target.value),
                      })}
                      id="drawer-progress-season"
                    />
                  </label>
                )}
                <label className={styles.progressField}>
                  <span>{type === 'tv' ? 'Episode' : PROGRESS_UNIT[type]}</span>
                  <input
                    type="number"
                    min="0"
                    value={item.progressCurrent ?? ''}
                    onChange={(e) => onUpdateProgress(item.id, {
                      progressCurrent: e.target.value === '' ? null : Number(e.target.value),
                    })}
                    id="drawer-progress-current"
                  />
                </label>
                <label className={styles.progressField}>
                  <span>of</span>
                  <input
                    type="number"
                    min="0"
                    value={item.progressTotal ?? ''}
                    onChange={(e) => onUpdateProgress(item.id, {
                      progressTotal: e.target.value === '' ? null : Number(e.target.value),
                    })}
                    id="drawer-progress-total"
                  />
                </label>
              </div>
              {movie.episodeCount != null && (
                <p className={styles.progressHint}>
                  {movie.seasonCount} season{movie.seasonCount === 1 ? '' : 's'}, {movie.episodeCount} episodes
                </p>
              )}
            </div>
          )}

          {/* Per-season ratings. TV only. */}
          {type === 'tv' && movie.seasonCount > 0 && (
            <div className={styles.section}>
              <SeasonRatings key={item.id} itemId={item.id} seasonCount={movie.seasonCount} showToast={showToast} />
            </div>
          )}

          {/* Status */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Status</p>
            <div className={styles.statusRow}>
              {statusesFor(type).map((s) => (
                <button
                  key={s}
                  className={`${styles.statusChip} ${item.status === s ? styles.statusActive : ''}`}
                  onClick={() => onUpdateStatus(item.id, s)}
                  id={`drawer-status-${s.toLowerCase()}`}
                >
                  {statusLabel(type, s)}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              className={`btn-primary ${styles.bigBtn}`}
              onClick={() => onUpdateStatus(item.id, item.status === doneStatusFor(type) ? 'PLANNED' : doneStatusFor(type))}
              id="drawer-toggle-btn"
            >
              {item.status === doneStatusFor(type) ? `✓ ${statusLabel(type, doneStatusFor(type))}` : `+ Mark as ${statusLabel(type, doneStatusFor(type))}`}
            </button>
            <button
              className={`btn-ghost ${styles.removeBtn}`}
              onClick={() => { onRemove(item.id); onClose() }}
              id="drawer-remove-btn"
            >
              Remove
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

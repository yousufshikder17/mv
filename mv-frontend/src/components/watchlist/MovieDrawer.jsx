import { useEffect, useRef } from 'react'
import Poster from '../ui/Poster.jsx'
import StarRating from '../ui/StarRating.jsx'
import styles from './MovieDrawer.module.css'

const STATUS_OPTIONS = ['PLANNED', 'WATCHING', 'COMPLETED', 'DROPPED']
const STATUS_LABEL   = { PLANNED: 'Planned', WATCHING: 'Watching', COMPLETED: 'Completed', DROPPED: 'Dropped' }

export default function MovieDrawer({ item, movie, open, onClose, onUpdateRating, onUpdateStatus, onRemove }) {
  const drawerRef = useRef(null)

  // Trap focus & close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!item || !movie) return null

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

          {/* Status */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Status</p>
            <div className={styles.statusRow}>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`${styles.statusChip} ${item.status === s ? styles.statusActive : ''}`}
                  onClick={() => onUpdateStatus(item.id, s)}
                  id={`drawer-status-${s.toLowerCase()}`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              className={`btn-primary ${styles.bigBtn}`}
              onClick={() => onUpdateStatus(item.id, item.status === 'COMPLETED' ? 'PLANNED' : 'COMPLETED')}
              id="drawer-toggle-btn"
            >
              {item.status === 'COMPLETED' ? '✓ Watched' : '+ Mark as Watched'}
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

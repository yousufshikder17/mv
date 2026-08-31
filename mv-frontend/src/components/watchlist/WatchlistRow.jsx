import Poster from '../ui/Poster.jsx'
import StarRating from '../ui/StarRating.jsx'
import styles from './WatchlistRow.module.css'
import { statusLabel, doneStatusFor, progressLabel } from '../../lib/media.js'


export default function WatchlistRow({ item, movie, onOpen, onToggleWatched }) {
  const type = movie?.type ?? 'film'
  const isWatched = item.status === doneStatusFor(type)

  return (
    <article
      className={`${styles.row} ${isWatched ? styles.watched : ''}`}
      id={`row-${item.id}`}
      onClick={() => onOpen(item, movie)}
    >
      {/* Thumbnail */}
      <div className={styles.thumb} onClick={(e) => e.stopPropagation()}>
        <Poster url={movie?.posterUrl} title={movie?.title} aspectRatio="2/3" />
      </div>

      {/* Title + meta */}
      <div className={styles.info}>
        <p className={styles.title}>{movie?.title ?? 'Unknown title'}</p>
        <div className={styles.sub}>
          <span>{movie?.releaseYear ?? '—'}</span>
          {movie?.runtime && <><span className={styles.dot}>·</span><span>{movie.runtime}m</span></>}
        </div>
        {movie?.genres?.length > 0 && (
          <div className={styles.genres}>
            {movie.genres.slice(0, 3).map((g) => (
              <span key={g} className="chip">{g}</span>
            ))}
          </div>
        )}
      </div>

      {/* Rating */}
      <div className={styles.ratingCol} onClick={(e) => e.stopPropagation()}>
        {item.rating != null
          ? <StarRating value={item.rating} size="sm" />
          : <span className={styles.noRating}>—</span>
        }
      </div>

      {/* Status */}
      <div className={styles.statusCol}>
        <span className={`chip ${isWatched ? styles.chipWatched : ''}`}>
          {statusLabel(type, item.status)}{progressLabel(type, item) ? ` · ${progressLabel(type, item)}` : ''}
        </span>
      </div>

      {/* Toggle action */}
      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
        <button
          className={`btn-ghost ${styles.toggleBtn} ${isWatched ? styles.toggleBtnOn : ''}`}
          onClick={() => onToggleWatched(item)}
          id={`row-toggle-${item.id}`}
        >
          {isWatched ? '✓ Watched' : '+ Watch'}
        </button>
      </div>
    </article>
  )
}

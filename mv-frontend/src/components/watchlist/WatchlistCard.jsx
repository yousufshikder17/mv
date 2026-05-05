import Poster from '../ui/Poster.jsx'
import StarRating from '../ui/StarRating.jsx'
import styles from './WatchlistCard.module.css'

const STATUS_LABEL = { PLANNED: 'Planned', WATCHING: 'Watching', COMPLETED: 'Watched', DROPPED: 'Dropped' }

export default function WatchlistCard({ item, movie, onOpen, onToggleWatched }) {
  const isWatched = item.status === 'COMPLETED'

  return (
    <article className={`${styles.card} ${isWatched ? styles.watched : ''}`} id={`card-${item.id}`}>
      {/* Poster button */}
      <button
        className={styles.posterBtn}
        onClick={() => onOpen(item, movie)}
        aria-label={`Open details for ${movie?.title}`}
        id={`card-poster-${item.id}`}
      >
        <Poster url={movie?.posterUrl} title={movie?.title} />

        {/* Quick toggle */}
        <button
          className={styles.quick}
          onClick={(e) => { e.stopPropagation(); onToggleWatched(item) }}
          aria-label={isWatched ? 'Mark as planned' : 'Mark as watched'}
          id={`card-quick-${item.id}`}
        >
          {isWatched ? '✓' : '+'}
        </button>

        {/* Status badge */}
        {isWatched && (
          <span className={styles.badge} aria-label="Watched">✓ Watched</span>
        )}
      </button>

      {/* Meta */}
      <div className={styles.meta}>
        <button
          className={styles.title}
          onClick={() => onOpen(item, movie)}
          id={`card-title-${item.id}`}
        >
          {movie?.title ?? 'Unknown title'}
        </button>
        <div className={styles.sub}>
          <span>{movie?.releaseYear ?? '—'}</span>
          {movie?.runtime && <><span className={styles.dot}>·</span><span>{movie.runtime}m</span></>}
        </div>
        {item.rating != null && (
          <div className={styles.rating}>
            <StarRating value={item.rating} size="sm" />
          </div>
        )}
        <span className={styles.status}>{STATUS_LABEL[item.status] ?? item.status}</span>
      </div>
    </article>
  )
}

import { useState, useEffect, useRef } from 'react'
import { addToWatchlist, searchMovies, importMovie } from '../../services/watchlistService.js'
import styles from './AddMovieModal.module.css'
import { SearchIcon } from '../ui/Icon.jsx'
import { TYPE_LABEL } from '../../lib/media.js'

const DEBOUNCE_MS = 350

/**
 * AddMovieModal — searches TMDB through our backend proxy, then imports the
 * chosen film into our catalogue and adds it to the user's watchlist.
 */
export default function AddMovieModal({ open, onClose, onAdded, showToast }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [adding,  setAdding]  = useState(null) // externalId being added
  const [mediaType, setMediaType] = useState('')      // '' | 'film' | 'tv'

  // Lets a newer keystroke cancel the request the previous one fired.
  const abortRef = useRef(null)

  // Debounced search. All state changes happen inside the timer rather than
  // the effect body — synchronous setState in an effect cascades renders.
  useEffect(() => {
    if (!open) return

    const q = query.trim()

    const timer = setTimeout(async () => {
      if (!q) {
        setResults([])
        setLoading(false)
        return
      }

      setLoading(true)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await searchMovies(q, mediaType || undefined, { signal: controller.signal })
        setResults(res.data?.data ?? [])
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        showToast(errorMessage(err, 'Search failed.'), 'error')
        setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, mediaType, open]) // eslint-disable-line

  // Reset on the way out, so the modal opens clean next time. Done here rather
  // than in an effect keyed on `open` for the same cascading-render reason.
  const handleClose = () => {
    abortRef.current?.abort()
    setQuery('')
    setResults([])
    setAdding(null)
    setMediaType('')
    setLoading(false)
    onClose()
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }) // no dep array: handleClose is re-created each render

  const handleAdd = async (film) => {
    setAdding(film.externalId)
    try {
      // Resolve the TMDB id to a row in our own catalogue first — /watchlist
      // keys off our uuid, not TMDB's id.
      const imported = await importMovie(film.externalId, film.type)
      const movie = imported.data?.data?.movie

      await addToWatchlist({ movieId: movie.id, status: 'PLANNED' })
      showToast(`"${movie.title}" added to your watchlist!`, 'success')
      onAdded()
      handleClose()
    } catch (err) {
      showToast(errorMessage(err, 'Could not add movie.'), 'error')
    } finally {
      setAdding(null)
    }
  }

  if (!open) return null

  const q = query.trim()

  return (
    <div className="modal-overlay" id="add-movie-overlay" onClick={handleClose}>
      <div className={`modal-card ${styles.card}`} id="add-movie-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.heading}>Add to Watchlist</h3>
          <button className="icon-btn" onClick={handleClose} id="add-movie-close" aria-label="Close">✕</button>
        </div>

        {/* Type filter. Empty string means both, interleaved by TMDB's own
            popularity ordering — the common case is not knowing which it is. */}
        <div className={styles.typeTabs}>
          {[['', 'All'], ['film', 'Films'], ['tv', 'TV']].map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={`${styles.typeTab} ${mediaType === value ? styles.typeTabOn : ''}`}
              onClick={() => setMediaType(value)}
              id={`add-type-${label.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            className="form-input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search films and shows…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            id="add-movie-search"
          />
        </div>

        {/* Results */}
        <div className={styles.results}>
          {loading && (
            <div className={styles.center}><div className="spinner" /></div>
          )}

          {!loading && !q && (
            <p className={styles.empty}>Start typing to search films and shows.</p>
          )}

          {!loading && q && results.length === 0 && (
            <p className={styles.empty}>Nothing matching &ldquo;{q}&rdquo;</p>
          )}

          {!loading && results.map((film) => (
            <div key={`${film.type}-${film.externalId}`} className={styles.resultRow} id={`movie-result-${film.externalId}`}>
              {film.posterUrl ? (
                <img src={film.posterUrl} alt="" className={styles.poster} loading="lazy" />
              ) : (
                <div className={styles.posterFallback} aria-hidden="true">◆</div>
              )}

              <div className={styles.resultInfo}>
                <p className={styles.resultTitle}>{film.title}</p>
                <p className={styles.resultSub}>
                  <span className={styles.typeBadge}>{TYPE_LABEL[film.type] ?? film.type}</span>
                  {' · '}{film.releaseYear ?? 'TBA'}
                  {film.overview ? ` · ${film.overview.slice(0, 60)}…` : ''}
                </p>
              </div>

              <button
                className="btn-primary"
                style={{ padding: '6px 14px', fontSize: '12.5px', flexShrink: 0 }}
                onClick={() => handleAdd(film)}
                disabled={adding === film.externalId}
                id={`add-movie-btn-${film.tmdbId}`}
              >
                {adding === film.externalId ? '…' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Controllers return { error }, but anything thrown lands in errorMiddleware
// which returns { message } — check both so real messages aren't swallowed.
function errorMessage(err, fallback) {
  const data = err.response?.data
  return data?.error ?? data?.message ?? fallback
}

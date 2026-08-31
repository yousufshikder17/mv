import { useState, useEffect, useRef } from 'react'
import { addToWatchlist, searchMovies, importMovie } from '../../services/watchlistService.js'
import styles from './AddMovieModal.module.css'
import { SearchIcon } from '../ui/Icon.jsx'

const DEBOUNCE_MS = 350

/**
 * AddMovieModal — searches TMDB through our backend proxy, then imports the
 * chosen film into our catalogue and adds it to the user's watchlist.
 */
export default function AddMovieModal({ open, onClose, onAdded, showToast }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [adding,  setAdding]  = useState(null) // tmdbId being added

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
        const res = await searchMovies(q, { signal: controller.signal })
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
  }, [query, open]) // eslint-disable-line

  // Reset on the way out, so the modal opens clean next time. Done here rather
  // than in an effect keyed on `open` for the same cascading-render reason.
  const handleClose = () => {
    abortRef.current?.abort()
    setQuery('')
    setResults([])
    setAdding(null)
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
    setAdding(film.tmdbId)
    try {
      // Resolve the TMDB id to a row in our own catalogue first — /watchlist
      // keys off our uuid, not TMDB's id.
      const imported = await importMovie(film.tmdbId)
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

        {/* Search */}
        <div className={styles.searchWrap}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            className="form-input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search for a film…"
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
            <p className={styles.empty}>Start typing to search films.</p>
          )}

          {!loading && q && results.length === 0 && (
            <p className={styles.empty}>No films matching &ldquo;{q}&rdquo;</p>
          )}

          {!loading && results.map((film) => (
            <div key={film.tmdbId} className={styles.resultRow} id={`movie-result-${film.tmdbId}`}>
              {film.posterUrl ? (
                <img src={film.posterUrl} alt="" className={styles.poster} loading="lazy" />
              ) : (
                <div className={styles.posterFallback} aria-hidden="true">◆</div>
              )}

              <div className={styles.resultInfo}>
                <p className={styles.resultTitle}>{film.title}</p>
                <p className={styles.resultSub}>
                  {film.releaseYear ?? 'TBA'}
                  {film.overview ? ` · ${film.overview.slice(0, 60)}…` : ''}
                </p>
              </div>

              <button
                className="btn-primary"
                style={{ padding: '6px 14px', fontSize: '12.5px', flexShrink: 0 }}
                onClick={() => handleAdd(film)}
                disabled={adding === film.tmdbId}
                id={`add-movie-btn-${film.tmdbId}`}
              >
                {adding === film.tmdbId ? '…' : '+ Add'}
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

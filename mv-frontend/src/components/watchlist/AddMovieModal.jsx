import { useState, useEffect } from 'react'
import { addToWatchlist, getAllMovies } from '../../services/watchlistService.js'
import styles from './AddMovieModal.module.css'

/**
 * AddMovieModal — searches movies from your PostgreSQL DB,
 * then posts to /watchlist to add the selected one.
 */
export default function AddMovieModal({ open, onClose, onAdded, showToast }) {
  const [movies,   setMovies]   = useState([])
  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [adding,   setAdding]   = useState(null) // movieId being added

  // Fetch full catalogue from DB on open
  useEffect(() => {
    if (!open) return
    setLoading(true)
    getAllMovies()
      .then((res) => setMovies(res.data ?? []))
      .catch(() => showToast('Could not load movies from server.', 'error'))
      .finally(() => setLoading(false))
  }, [open]) // eslint-disable-line

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const filtered = movies.filter((m) =>
    m.title?.toLowerCase().includes(query.toLowerCase())
  )

  const handleAdd = async (movie) => {
    setAdding(movie.id)
    try {
      await addToWatchlist({ movieId: movie.id, status: 'PLANNED' })
      showToast(`"${movie.title}" added to your watchlist!`, 'success')
      onAdded()
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Could not add movie.'
      showToast(msg, 'error')
    } finally {
      setAdding(null)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" id="add-movie-overlay" onClick={onClose}>
      <div className="modal-card" id="add-movie-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.heading}>Add to Watchlist</h3>
          <button className="icon-btn" onClick={onClose} id="add-movie-close" aria-label="Close">✕</button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className="form-input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search your movie catalogue…"
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
          {!loading && filtered.length === 0 && (
            <p className={styles.empty}>
              {query ? `No movies matching "${query}"` : 'No movies in your database yet.'}
            </p>
          )}
          {!loading && filtered.map((movie) => (
            <div key={movie.id} className={styles.resultRow} id={`movie-result-${movie.id}`}>
              <div className={styles.resultInfo}>
                <p className={styles.resultTitle}>{movie.title}</p>
                <p className={styles.resultSub}>
                  {movie.releaseYear}
                  {movie.runtime ? ` · ${movie.runtime}m` : ''}
                  {movie.genres?.length > 0 ? ` · ${movie.genres.slice(0,2).join(', ')}` : ''}
                </p>
              </div>
              <button
                className="btn-primary"
                style={{ padding: '6px 14px', fontSize: '12.5px', flexShrink: 0 }}
                onClick={() => handleAdd(movie)}
                disabled={adding === movie.id}
                id={`add-movie-btn-${movie.id}`}
              >
                {adding === movie.id ? '…' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

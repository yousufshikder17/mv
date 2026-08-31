import { useState, useEffect } from 'react'
import { getTrending, importMovie, addToWatchlist } from '../../services/watchlistService.js'
import Poster from '../ui/Poster.jsx'
import styles from './TrendingStrip.module.css'

/**
 * Trending-this-week row, shown when the vault has nothing in it yet.
 *
 * Exists so a new account is not a blank page. Deliberately NOT a public
 * browse surface: the endpoint is behind auth, and nothing enters our
 * catalogue until someone actually adds a title — which keeps TMDB's 6-month
 * cache expiry scoped to films somebody tracks (SPEC §3, §17).
 */
export default function TrendingStrip({ onAdded, showToast }) {
  const [films,  setFilms]  = useState([])
  const [adding, setAdding] = useState(null)

  useEffect(() => {
    let alive = true
    getTrending()
      .then((res) => { if (alive) setFilms((res.data?.data ?? []).slice(0, 12)) })
      // Silent: this is a suggestion strip, not something worth a toast if
      // TMDB is briefly unreachable. The empty state below still stands alone.
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const handleAdd = async (film) => {
    setAdding(film.tmdbId)
    try {
      // Same two-step as AddMovieModal: TMDB id -> our catalogue row -> list.
      const imported = await importMovie(film.tmdbId)
      const movie = imported.data?.data?.movie
      await addToWatchlist({ movieId: movie.id, status: 'PLANNED' })
      showToast(`"${movie.title}" added to your watchlist!`, 'success')
      onAdded()
    } catch {
      showToast('Could not add that film.', 'error')
    } finally {
      setAdding(null)
    }
  }

  if (!films.length) return null

  return (
    <section className={styles.wrap} aria-label="Trending this week">
      <div className={styles.head}>
        <p className={styles.eyebrow}>Trending this week</p>
        <p className={styles.hint}>Pick one to start your vault</p>
      </div>

      <div className={styles.row}>
        {films.map((f) => (
          <article key={f.tmdbId} className={styles.card}>
            <button
              className={styles.posterBtn}
              onClick={() => handleAdd(f)}
              disabled={adding === f.tmdbId}
              title={f.overview || f.title}
              aria-label={`Add ${f.title} to your watchlist`}
            >
              <Poster url={f.posterUrl} title={f.title} />
              <span className={styles.add}>{adding === f.tmdbId ? '…' : '+'}</span>
            </button>
            <p className={styles.title}>{f.title}</p>
            {f.releaseYear && <p className={styles.year}>{f.releaseYear}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

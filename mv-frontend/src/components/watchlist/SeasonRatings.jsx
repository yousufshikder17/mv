import { useState, useEffect } from 'react'
import StarRating from '../ui/StarRating.jsx'
import { getSeasonRatings, setSeasonRating } from '../../services/watchlistService.js'
import styles from './SeasonRatings.module.css'

/**
 * Per-season ratings for a tracked show.
 *
 * Loaded on open rather than with the watchlist: most rows are films, and
 * joining season ratings into every list response would be work done for the
 * few items that have them.
 */
export default function SeasonRatings({ itemId, seasonCount, showToast }) {
  const [ratings, setRatings] = useState({})   // seasonNumber -> rating
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getSeasonRatings(itemId)
      .then((res) => {
        if (!alive) return
        const map = {}
        for (const s of res.data?.data?.seasons ?? []) map[s.seasonNumber] = s.rating
        setRatings(map)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [itemId])

  const rate = async (n, rating) => {
    const before = ratings[n] ?? null
    setRatings((prev) => ({ ...prev, [n]: rating }))
    try {
      await setSeasonRating(itemId, n, { rating })
    } catch {
      showToast?.('Could not save that season rating.', 'error')
      setRatings((prev) => ({ ...prev, [n]: before }))
    }
  }

  if (!seasonCount) return null

  return (
    <div className={styles.wrap}>
      <p className={styles.label}>Seasons</p>
      {loading ? (
        <div className="spinner" />
      ) : (
        <ul className={styles.list}>
          {Array.from({ length: seasonCount }, (_, i) => i + 1).map((n) => (
            <li key={n} className={styles.row}>
              <span className={styles.season}>Season {n}</span>
              <StarRating value={ratings[n] ?? null} onChange={(r) => rate(n, r)} />
              <span className={styles.value}>{ratings[n] != null ? ratings[n] : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

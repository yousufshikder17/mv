import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { searchMovies, getTrending } from '../../services/watchlistService.js'
import Poster from '../ui/Poster.jsx'
import { SearchIcon } from '../ui/Icon.jsx'
import { TYPE_LABEL } from '../../lib/media.js'
import styles from './Discover.module.css'
import RawgCredit from '../layout/RawgCredit.jsx'

/**
 * Public discovery: search and trending, no account (M3).
 *
 * Results link to the item page rather than adding anything - the login
 * prompt belongs at the moment of saving, not on arrival. Nothing here writes
 * to the catalogue.
 *
 * Debounced at 350ms because these endpoints sit in front of somebody else's
 * quota. Every keystroke firing a request is exactly what the public rate
 * limiter would otherwise have to absorb.
 */
export default function Discover() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [results, setResults] = useState([])
  const [trending, setTrending] = useState([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const abortRef = useRef(null)

  useEffect(() => {
    getTrending()
      .then((res) => setTrending((res.data?.data ?? []).slice(0, 12)))
      // Silent: a trending strip that failed to load is not worth a toast on
      // a marketing page.
      .catch(() => {})
  }, [])

  useEffect(() => {
    const q = query.trim()
    // Nothing to clear: `shown` falls back to trending whenever the query is
    // empty, so stale results are never displayed.
    if (!q) return

    const timer = setTimeout(async () => {
      setLoading(true)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await searchMovies(q, type || undefined, { signal: controller.signal })
        setResults(res.data?.data ?? [])
        setFailed(false)
      } catch (err) {
        // An abort is normal - it means the user kept typing. Anything else
        // is a real failure, and silence made a rate limit or a TMDB outage
        // look identical to "no results", which is the wrong thing to tell
        // someone on a public page.
        if (err.code !== 'ERR_CANCELED') { setFailed(true); setResults([]) }
      } finally { setLoading(false) }
    }, 350)

    return () => clearTimeout(timer)
  }, [query, type])

  const shown = query.trim() ? results : trending

  return (
    <section className={styles.wrap} id="discover">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Browse</p>
        <h2 className={styles.heading}>Find anything. No account needed.</h2>

        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <SearchIcon size={16} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search anything..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              id="discover-search"
            />
          </div>

          <div className={styles.typeTabs}>
            {[['', 'All'], ['film', 'Films'], ['tv', 'TV'], ['game', 'Games'], ['book', 'Books'], ['album', 'Music']].map(([value, label]) => (
              <button
                key={label}
                type="button"
                className={`${styles.typeTab} ${type === value ? styles.typeTabOn : ''}`}
                onClick={() => setType(value)}
                id={`discover-type-${label.toLowerCase()}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.label}>
          {query.trim() ? (loading ? 'Searching...' : `${results.length} results`) : 'Trending this week'}
        </p>

        <div className={styles.grid}>
          {shown.map((r) => (
            <Link
              key={`${r.type}-${r.externalId}`}
              to={`/media/${r.type}/${r.externalId}`}
              className={styles.card}
              id={`discover-${r.externalId}`}
            >
              <Poster url={r.posterUrl} title={r.title} />
              <p className={styles.cardTitle}>{r.title}</p>
              <p className={styles.cardSub}>
                <span className={styles.badge}>{TYPE_LABEL[r.type] ?? r.type}</span>
                {r.releaseYear ? ` · ${r.releaseYear}` : ''}
              </p>
            </Link>
          ))}
        </div>

        {/* RAWG requires an active hyperlink on every page showing their
            data, so the credit follows the results rather than living in a
            footer. Only rendered when a game is actually on screen. */}
        {shown.some((r) => r.type === 'game') && <RawgCredit className={styles.credit} />}

        {query.trim() && !loading && failed && (
          <p className={styles.empty}>
            Search is unavailable right now. If you have been searching a lot,
            give it a minute and try again.
          </p>
        )}

        {query.trim() && !loading && !failed && results.length === 0 && (
          <p className={styles.empty}>Nothing matching that.</p>
        )}
      </div>
    </section>
  )
}

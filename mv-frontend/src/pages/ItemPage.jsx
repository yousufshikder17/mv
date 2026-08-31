import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getPublicDetails, importMovie, addToWatchlist } from '../services/watchlistService.js'
import { useAuth } from '../hooks/useAuth.js'
import Poster from '../components/ui/Poster.jsx'
import TmdbCredit from '../components/layout/TmdbCredit.jsx'
import { TYPE_LABEL } from '../lib/media.js'
import styles from './ItemPage.module.css'

/**
 * Public item page. No account required (M3).
 *
 * Reads through our cached TMDB proxy and creates no catalogue row - a
 * visitor clicking around must not cache TMDB content we would then have to
 * expire within six months (SPEC 3). A row appears only when someone adds it.
 */
export default function ItemPage({ showToast }) {
  const { type, externalId } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let alive = true

    const load = async () => {
      setLoading(true)
      setError(false)
      try {
        const res = await getPublicDetails(type, externalId)
        if (alive) setItem(res.data?.data?.item ?? null)
      } catch {
        if (alive) setError(true)
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => { alive = false }
  }, [type, externalId])

  // A public page that gets shared or bookmarked needs its own title. Without
  // this every item showed the same generic one, in the tab, in history, and
  // in anything that reads the title when a link is pasted.
  useEffect(() => {
    if (!item) return
    const year = item.releaseYear ? ` (${item.releaseYear})` : ''
    document.title = `${item.title}${year} — mv`
    return () => { document.title = 'mv — Personal media ledger' }
  }, [item])

  const handleAdd = async () => {
    // The prompt happens at the moment of saving, never on arrival. Reading
    // is free; keeping is what needs an account.
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/media/${type}/${externalId}` } })
      return
    }

    setAdding(true)
    try {
      const imported = await importMovie(externalId, type)
      const media = imported.data?.data?.movie
      await addToWatchlist({ movieId: media.id, status: 'PLANNED' })
      showToast?.(`"${media.title}" added to your watchlist!`, 'success')
      navigate('/watchlist')
    } catch {
      showToast?.('Could not add that title.', 'error')
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <main className={styles.page}><div className="spinner" /></main>

  if (error || !item) {
    return (
      <main className={styles.page}>
        <p className={styles.notFound}>We could not find that title.</p>
        <Link to="/" className="btn-ghost">Back to home</Link>
      </main>
    )
  }

  return (
    <main className={styles.page} id="item-page">
      <div className={styles.inner}>
        <div className={styles.posterCol}>
          <Poster url={item.posterUrl} title={item.title} />
          <button
            className={`btn-accent ${styles.addBtn}`}
            onClick={handleAdd}
            disabled={adding}
            id="item-add-btn"
          >
            {adding ? 'Adding...' : isAuthenticated ? '+ Add to watchlist' : 'Sign in to track this'}
          </button>
        </div>

        <div className={styles.detail}>
          <p className={styles.eyebrow}>
            {TYPE_LABEL[item.type] ?? item.type}
            {item.releaseYear ? ` · ${item.releaseYear}` : ''}
            {item.releaseStatus ? ` · ${item.releaseStatus}` : ''}
          </p>

          <h1 className={styles.title}>{item.title}</h1>

          {/* SPEC 4: a non-English user gets a materially worse product
              without the original title shown. */}
          {item.originalTitle && item.originalTitle !== item.title && (
            <p className={styles.original}>{item.originalTitle}</p>
          )}

          {item.genres?.length > 0 && (
            <div className={styles.genres}>
              {item.genres.map((g) => <span key={g} className={styles.genre}>{g}</span>)}
            </div>
          )}

          <div className={styles.facts}>
            {item.runtime && <span>{item.runtime} min{item.type === 'tv' ? ' per episode' : ''}</span>}
            {item.seasonCount != null && (
              <span>{item.seasonCount} season{item.seasonCount === 1 ? '' : 's'}</span>
            )}
            {item.episodeCount != null && <span>{item.episodeCount} episodes</span>}
          </div>

          {item.overview && <p className={styles.overview}>{item.overview}</p>}

          {item.creators?.length > 0 && (
            <p className={styles.creators}>
              <span className={styles.factLabel}>{item.type === 'tv' ? 'Created by' : 'Directed by'}</span>
              {item.creators.join(', ')}
            </p>
          )}

          {item.cast?.length > 0 && (
            <div className={styles.castWrap}>
              <p className={styles.factLabel}>Cast</p>
              <ul className={styles.cast}>
                {item.cast.map((c) => (
                  <li key={c.name} className={styles.castMember}>
                    <span className={styles.castName}>{c.name}</span>
                    {c.character && <span className={styles.castRole}>{c.character}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* TMDB requires attribution wherever their data is rendered (SPEC 3),
          and this page is public. */}
      <footer className={styles.attribution}><TmdbCredit /></footer>
    </main>
  )
}

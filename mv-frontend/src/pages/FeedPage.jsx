import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getFeed } from '../services/socialService.js'
import Spoiler from '../components/social/Spoiler.jsx'
import Poster from '../components/ui/Poster.jsx'
import { statusLabel } from '../lib/media.js'
import styles from './FeedPage.module.css'

const ago = (d) => {
  const mins = Math.round((Date.now() - new Date(d)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

/**
 * Activity from the people you follow (M8).
 *
 * Requires an account because it is built from *your* follow list, not
 * because reading is gated — the item pages it links to are public.
 */
export default function FeedPage() {
  const [activity, setActivity] = useState([])
  const [reason, setReason] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getFeed()
      .then((res) => {
        if (!alive) return
        setActivity(res.data?.data?.activity ?? [])
        setReason(res.data?.reason ?? null)
      })
      .catch(() => { if (alive) setReason('error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>Activity</h1>

      {loading && <p className={styles.muted}>Loading…</p>}

      {/* Honest empty state (SPEC 9): the feed says why it is empty rather
          than filling itself with strangers' activity. */}
      {!loading && activity.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyH}>
            {reason === 'error' ? 'Could not load your feed' : 'Nothing here yet'}
          </p>
          <p className={styles.muted}>
            {reason === 'follow_nobody_yet'
              ? 'This fills up when you follow someone. Open a profile from a review or a comment and follow them.'
              : reason === 'error'
                ? 'Try again in a moment.'
                : 'The people you follow have not tracked anything recently.'}
          </p>
          <Link to="/" className={styles.link}>Browse something instead</Link>
        </div>
      )}

      <ul className={styles.list}>
        {activity.map((a, i) => (
          <li key={`${a.kind}-${a.userId}-${a.itemId}-${i}`} className={styles.row}>
            <Link to={`/media/${a.type}/${a.externalId}`} className={styles.poster}>
              <Poster url={a.posterUrl} title={a.title} />
            </Link>

            <div className={styles.detail}>
              <p className={styles.line}>
                <Link to={`/u/${a.userId}`} className={styles.author}>{a.userName}</Link>
                {a.kind === 'reviewed' ? ' reviewed ' : ` ${statusLabel(a.type, a.status).toLowerCase()} `}
                <b className={styles.title}>{a.title}</b>
                {a.rating != null && <span className={styles.rating}>{a.rating}/10</span>}
                <span className={styles.when}>{ago(a.at)}</span>
              </p>

              {a.body && (
                a.hasSpoilers
                  ? <Spoiler><p className={styles.excerpt}>{a.body}</p></Spoiler>
                  : <p className={styles.excerpt}>{a.body}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}

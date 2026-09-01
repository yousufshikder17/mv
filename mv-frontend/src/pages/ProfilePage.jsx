import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import {
  getProfile, getProfileItems, followUser, unfollowUser,
  updatePrivacy, exportAccount, deleteAccount, signOutEverywhere,
} from '../services/socialService.js'
import Poster from '../components/ui/Poster.jsx'
import { TYPE_LABEL } from '../lib/media.js'
import styles from './ProfilePage.module.css'

const TYPE_ORDER = ['film', 'tv', 'game', 'book', 'album']

/**
 * Public profile (M8), and — when it is yours — the place your privacy
 * settings and data export live.
 *
 * Folded into one page on purpose: a settings page whose entire contents are
 * two toggles and a download button is a route nobody would find.
 */
export default function ProfilePage({ showToast }) {
  const { userId } = useParams()
  const { user, logout } = useAuth()

  const [profile, setProfile] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    // No setLoading(true) here: it starts true, and a reload after a follow
    // should refresh the numbers in place rather than blank the page.
    try {
      const [p, i] = await Promise.all([getProfile(userId), getProfileItems(userId)])
      setProfile(p.data?.data?.profile ?? null)
      setItems(i.data?.data?.items ?? [])
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Every setState in load() runs after an await, so nothing is set during
  // the render pass the rule below is guarding against.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!profile) return
    document.title = `${profile.name} — mv`
    return () => { document.title = 'mv — Personal media ledger' }
  }, [profile])

  const toggleFollow = async () => {
    setBusy(true)
    try {
      await (profile.isFollowing ? unfollowUser(userId) : followUser(userId))
      await load()
    } catch {
      showToast?.('Could not update that', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <main className={styles.page}><p className={styles.muted}>Loading…</p></main>

  // 404 covers "private" as well as "absent" — the backend deliberately does
  // not distinguish them, and neither should this page.
  if (!profile) {
    return (
      <main className={styles.page}>
        <h1 className={styles.notFoundH}>No profile here</h1>
        <p className={styles.muted}>
          This account does not exist, or its owner keeps it private.
        </p>
        <Link to="/" className={styles.link}>Back home</Link>
      </main>
    )
  }

  const { stats } = profile

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.name}>{profile.name}</h1>
          {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
          <p className={styles.meta}>
            <b>{profile.followers}</b> follower{profile.followers === 1 ? '' : 's'}
            <span className={styles.dot}>·</span>
            <b>{profile.following}</b> following
            {profile.isSelf && !profile.profilePublic && (
              <><span className={styles.dot}>·</span><span className={styles.private}>Private</span></>
            )}
          </p>
        </div>

        {user && !profile.isSelf && (
          <button
            className={profile.isFollowing ? 'btn-ghost' : 'btn-accent'}
            onClick={toggleFollow}
            disabled={busy}
            id="profile-follow-btn"
          >
            {profile.isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </header>

      <section className={styles.stats}>
        <Stat label="Tracked" value={stats.tracked} />
        <Stat label="Completed" value={stats.completed} />
        <Stat label="Completion" value={`${stats.completionRate}%`} />
        <Stat label="In progress" value={stats.inProgress} />
        <Stat label="Dropped" value={stats.dropped} />
        <Stat label="Avg rating" value={stats.averageRating ?? '—'} />
      </section>

      {stats.tracked > 0 && (
        <section className={styles.byType}>
          {TYPE_ORDER.filter((t) => stats.byType[t]).map((t) => (
            <span key={t} className={styles.typeChip}>
              {TYPE_LABEL[t] ?? t} <b>{stats.byType[t]}</b>
            </span>
          ))}
        </section>
      )}

      {profile.isSelf && (
        <SelfSettings profile={profile} reload={load} showToast={showToast} onSignedOut={logout} />
      )}

      <section>
        <h2 className={styles.h2}>
          {profile.isSelf ? 'Your library' : 'Library'}
          {profile.isSelf && <span className={styles.hint}>hidden items are shown to you only</span>}
        </h2>

        {items.length === 0 ? (
          // Honest empty state (SPEC 9) — nothing invented to fill the page.
          <p className={styles.muted}>
            {profile.isSelf
              ? <>Nothing tracked yet. <Link to="/" className={styles.link}>Find something</Link>.</>
              : 'Nothing public here yet.'}
          </p>
        ) : (
          <ul className={styles.grid}>
            {items.map((it) => (
              <li key={it.id} className={styles.card}>
                <Link to={`/media/${it.movie.type}/${it.movie.externalId}`} className={styles.cardLink}>
                  <Poster url={it.movie.posterUrl} title={it.movie.title} />
                  <p className={styles.cardTitle}>{it.movie.title}</p>
                </Link>
                <p className={styles.cardMeta}>
                  {it.rating != null && <span className={styles.rating}>{it.rating}</span>}
                  {it.hidden && <span className={styles.hiddenTag}>hidden</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

const Stat = ({ label, value }) => (
  <div className={styles.stat}>
    <span className={styles.statValue}>{value}</span>
    <span className={styles.statLabel}>{label}</span>
  </div>
)

/* ── Your own account ────────────────────────────────────────────── */

function SelfSettings({ profile, reload, showToast, onSignedOut }) {
  const [bio, setBio] = useState(profile.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  const setPublic = async (profilePublic) => {
    try {
      await updatePrivacy({ profilePublic })
      await reload()
      showToast?.(profilePublic ? 'Profile is public' : 'Profile is private', 'success')
    } catch {
      showToast?.('Could not change that', 'error')
    }
  }

  const saveBio = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updatePrivacy({ bio })
      await reload()
      showToast?.('Bio saved', 'success')
    } catch (err) {
      showToast?.(err.response?.data?.message ?? 'Could not save that', 'error')
    } finally {
      setSaving(false)
    }
  }

  const signOutAll = async () => {
    try {
      await signOutEverywhere()
      showToast?.('Signed out on every device', 'success')
      onSignedOut?.()
    } catch {
      showToast?.('Could not sign out everywhere', 'error')
    }
  }

  const confirmDelete = async (e) => {
    e.preventDefault()
    setDeleting(true)
    try {
      await deleteAccount(password)
      // No toast: the next thing to happen is a redirect to a logged-out page,
      // and a message about an account that no longer exists is noise.
      onSignedOut?.()
    } catch (err) {
      showToast?.(
        err.response?.status === 401
          ? 'That password is not correct'
          : 'Could not delete your account',
        'error',
      )
      setDeleting(false)
    }
  }

  // GDPR Article 20. Built in the browser from the JSON the API returns, so
  // there is no file sitting on a server waiting to leak.
  const download = async () => {
    try {
      const res = await exportAccount()
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = 'media-vault-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast?.('Could not build your export', 'error')
    }
  }

  return (
    <section className={styles.settings}>
      <h2 className={styles.h2}>Your account</h2>

      <div className={styles.settingRow}>
        <div>
          <p className={styles.settingLabel}>Public profile</p>
          <p className={styles.settingHelp}>
            Off hides your profile, reviews and comments from everyone else. Your
            price alerts are private either way.
          </p>
        </div>
        <button
          className={profile.profilePublic ? 'btn-ghost' : 'btn-accent'}
          onClick={() => setPublic(!profile.profilePublic)}
          id="privacy-toggle"
        >
          {profile.profilePublic ? 'Make private' : 'Make public'}
        </button>
      </div>

      <form className={styles.settingRow} onSubmit={saveBio}>
        <div className={styles.bioField}>
          <p className={styles.settingLabel}>Bio</p>
          <input
            className={styles.input}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            placeholder="A line about what you watch, play or read"
          />
        </div>
        <button type="submit" className="btn-ghost" disabled={saving || bio === (profile.bio ?? '')}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className={styles.settingRow}>
        <div>
          <p className={styles.settingLabel}>Export your data</p>
          <p className={styles.settingHelp}>
            Everything this account has created, as JSON. Excludes your password
            hash and push keys — those are credentials, not your data.
          </p>
        </div>
        <button className="btn-ghost" onClick={download} id="export-btn">Download</button>
      </div>

      <div className={styles.settingRow}>
        <div>
          <p className={styles.settingLabel}>Sign out everywhere</p>
          <p className={styles.settingHelp}>
            Ends every session on every device. Signing out normally only
            affects the browser you are using — this is the one to reach for if
            a phone or laptop has gone missing.
          </p>
        </div>
        <button className="btn-ghost" onClick={signOutAll} id="signout-all-btn">
          Sign out everywhere
        </button>
      </div>

      {/* Deletion last, and behind a confirmation. Everything above this is
          reversible; this is not. */}
      <div className={`${styles.settingRow} ${styles.dangerRow}`}>
        <div>
          <p className={styles.settingLabel}>Delete your account</p>
          <p className={styles.settingHelp}>
            Removes your tracked items, reviews, comments, lists, follows,
            alerts and subscriptions. Films and games themselves stay — they
            belong to nobody. This cannot be undone, so download your export
            first if you want it.
          </p>
        </div>
        {!confirming && (
          <button className={styles.dangerBtn} onClick={() => setConfirming(true)} id="delete-account-btn">
            Delete
          </button>
        )}
      </div>

      {confirming && (
        <form className={styles.confirmRow} onSubmit={confirmDelete}>
          <label className={styles.confirmLabel} htmlFor="delete-password">
            Type your password to confirm
          </label>
          <div className={styles.confirmActions}>
            <input
              id="delete-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            <button type="button" className="btn-ghost" onClick={() => { setConfirming(false); setPassword('') }}>
              Cancel
            </button>
            <button type="submit" className={styles.dangerBtn} disabled={deleting || !password}>
              {deleting ? 'Deleting…' : 'Delete for good'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

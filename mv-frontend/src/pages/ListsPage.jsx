import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { getMyLists, browseLists, createList } from '../services/listService.js'
import styles from './ListsPage.module.css'

/**
 * Lists (M9), public.
 *
 * Two sections and only one of them needs an account. Published lists from
 * anyone are the reason this is in the nav at all: a list is meant to be read
 * by people who did not make it, and gating the page hides the half of the
 * feature that faces outward.
 */
export default function ListsPage({ showToast }) {
  const { isAuthenticated } = useAuth()

  const [mine, setMine] = useState([])
  const [published, setPublished] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    // Independent: a logged-out visitor has no lists of their own, and a
    // failure to load one section should not blank the other.
    const [own, all] = await Promise.all([
      isAuthenticated ? getMyLists().catch(() => null) : Promise.resolve(null),
      browseLists().catch(() => null),
    ])
    setMine(own?.data?.data?.lists ?? [])
    setPublished(all?.data?.data?.lists ?? [])
    setLoaded(true)
  }, [isAuthenticated])

  // Every setState in load() runs after an await, so nothing is set during
  // the render pass the rule below is guarding against.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    document.title = 'Lists — mv'
    return () => { document.title = 'mv — Personal media ledger' }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await createList({ name: name.trim() })
      setName('')
      await load()
    } catch (err) {
      showToast?.(
        err.response?.status === 409
          ? 'You already have a list with that name'
          : err.response?.data?.message ?? 'Could not create that list',
        'error',
      )
    } finally {
      setCreating(false)
    }
  }

  // Your own lists appear in both queries once published. Showing them twice
  // on one page reads as a bug.
  const mineIds = new Set(mine.map((l) => l.id))
  const others = published.filter((l) => !mineIds.has(l.id))

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Lists</p>
        <h1 className={styles.h1}>Lists</h1>
        <p className={styles.sub}>
          Anything can go in a list, tracked or not — a list is what you would
          hand someone, not what you have got through.
        </p>
      </header>

      {isAuthenticated ? (
        <section className={styles.section}>
          <h2 className={styles.h2}>Yours</h2>

          <form className={styles.newList} onSubmit={submit}>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name a new list"
              maxLength={80}
              id="new-list-name"
            />
            <button type="submit" className="btn-accent" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>

          {loaded && mine.length === 0 && (
            <p className={styles.note}>
              No lists yet. They start private, so the first one is only yours
              until you decide otherwise.
            </p>
          )}

          <ListGrid lists={mine} showVisibility />
        </section>
      ) : (
        <p className={styles.note}>
          <Link to="/login" className={styles.link}>Sign in</Link> to make your own.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.h2}>
          Published
          <span className={styles.hint}>lists people have chosen to share</span>
        </h2>

        {loaded && others.length === 0 ? (
          // Honest empty state (SPEC 9): no invented lists to fill the page.
          <p className={styles.note}>
            Nobody has published a list yet.{' '}
            {isAuthenticated && 'Yours would be the first — make one and publish it.'}
          </p>
        ) : (
          <ListGrid lists={others} showOwner />
        )}
      </section>
    </main>
  )
}

function ListGrid({ lists, showOwner = false, showVisibility = false }) {
  if (!lists.length) return null

  return (
    <ul className={styles.grid}>
      {lists.map((l) => (
        <li key={l.id} className={styles.card}>
          <Link to={`/lists/${l.id}`} className={styles.cardLink}>
            <h3 className={styles.cardTitle}>{l.name}</h3>
            {l.description && <p className={styles.cardDesc}>{l.description}</p>}
          </Link>
          <p className={styles.cardMeta}>
            <span>{l.itemCount} item{l.itemCount === 1 ? '' : 's'}</span>
            {showOwner && l.owner && (
              <Link to={`/u/${l.owner.id}`} className={styles.owner}>{l.owner.name}</Link>
            )}
            {showVisibility && (
              <span className={l.isPublic ? styles.public : styles.private}>
                {l.isPublic ? 'Public' : 'Private'}
              </span>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getMyLists, createList } from '../services/listService.js'
import styles from './ListsPage.module.css'

/**
 * Your lists (M9). Account required — these are yours by definition.
 *
 * Lists are curation, separate from the watchlist ledger: ordered, named,
 * shareable, and the same film can sit in ten of them.
 */
export default function ListsPage({ showToast }) {
  const [lists, setLists] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await getMyLists()
      setLists(res.data?.data?.lists ?? [])
    } catch {
      setLists([])
    } finally {
      setLoaded(true)
    }
  }, [])

  // Every setState in load() runs after an await, so nothing is set during
  // the render pass the rule below is guarding against.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    document.title = 'Your lists — mv'
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

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Lists</p>
        <h1 className={styles.h1}>Your lists</h1>
        <p className={styles.sub}>
          Anything can go in a list, tracked or not — a list is what you would
          hand someone, not what you have got through.
        </p>
      </header>

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

      {loaded && lists.length === 0 && (
        // Honest empty state — nothing invented to fill the page.
        <p className={styles.note}>
          No lists yet. They start private, so the first one is only yours until
          you decide otherwise.
        </p>
      )}

      <ul className={styles.grid}>
        {lists.map((l) => (
          <li key={l.id} className={styles.card}>
            <Link to={`/lists/${l.id}`} className={styles.cardLink}>
              <h2 className={styles.cardTitle}>{l.name}</h2>
              {l.description && <p className={styles.cardDesc}>{l.description}</p>}
            </Link>
            <p className={styles.cardMeta}>
              <span>{l.itemCount} item{l.itemCount === 1 ? '' : 's'}</span>
              <span className={l.isPublic ? styles.public : styles.private}>
                {l.isPublic ? 'Public' : 'Private'}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getList, updateList, deleteList, updateListItem, removeListItem,
} from '../services/listService.js'
import Poster from '../components/ui/Poster.jsx'
import { TYPE_LABEL } from '../lib/media.js'
import styles from './ListDetailPage.module.css'

/**
 * One list (M9), public when its owner says so.
 *
 * Reordering is up/down buttons rather than drag-and-drop. Both compile down
 * to the same `moveAfter` call, and buttons work with a keyboard and on a
 * phone — dragging can arrive later without changing the API.
 */
export default function ListDetailPage({ showToast }) {
  const { listId } = useParams()
  const navigate = useNavigate()

  const [state, setState] = useState({ id: null, list: null, items: [] })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await getList(listId)
      setState({ id: listId, list: res.data?.data?.list ?? null, items: res.data?.data?.items ?? [] })
    } catch {
      setState({ id: listId, list: null, items: [] })
    }
  }, [listId])

  // Every setState in load() runs after an await, so nothing is set during
  // the render pass the rule below is guarding against.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const ready = state.id === listId
  const { list, items } = ready ? state : { list: null, items: [] }

  useEffect(() => {
    if (!list) return
    document.title = `${list.name} — mv`
    return () => { document.title = 'mv — Personal media ledger' }
  }, [list])

  const move = async (item, direction) => {
    const index = items.findIndex((i) => i.id === item.id)
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return

    // Up means "sit behind whatever is two above"; the front is null.
    const moveAfter = direction === 'up'
      ? (index - 2 >= 0 ? items[index - 2].id : null)
      : items[index + 1].id

    setBusy(true)
    try {
      await updateListItem(listId, item.id, { moveAfter })
      await load()
    } catch {
      showToast?.('Could not reorder that', 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (item) => {
    try {
      await removeListItem(listId, item.id)
      await load()
    } catch {
      showToast?.('Could not remove that', 'error')
    }
  }

  const setPublic = async (isPublic) => {
    try {
      await updateList(listId, { isPublic })
      await load()
      showToast?.(isPublic ? 'List is public' : 'List is private', 'success')
    } catch {
      showToast?.('Could not change that', 'error')
    }
  }

  const destroy = async () => {
    try {
      await deleteList(listId)
      showToast?.('List deleted', 'success')
      navigate('/lists')
    } catch {
      showToast?.('Could not delete that list', 'error')
    }
  }

  if (!ready) return <main className={styles.page}><p className={styles.note}>Loading…</p></main>

  // 404 covers "private" as well as "absent" — the API deliberately does not
  // distinguish them, and neither should this page.
  if (!list) {
    return (
      <main className={styles.page}>
        <h1 className={styles.h1}>No list here</h1>
        <p className={styles.note}>This list does not exist, or its owner keeps it private.</p>
        <Link to="/" className={styles.link}>Back home</Link>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>
          List by{' '}
          <Link to={`/u/${list.owner.id}`} className={styles.link}>{list.owner.name}</Link>
        </p>
        <h1 className={styles.h1}>{list.name}</h1>
        {list.description && <p className={styles.desc}>{list.description}</p>}

        {list.isOwner && (
          <div className={styles.ownerBar}>
            <button
              className={list.isPublic ? 'btn-ghost' : 'btn-accent'}
              onClick={() => setPublic(!list.isPublic)}
              id="list-visibility"
            >
              {list.isPublic ? 'Make private' : 'Publish'}
            </button>
            <span className={styles.hint}>
              {list.isPublic
                ? 'Anyone with the link can read this.'
                : 'Only you can see this.'}
            </span>
            <button className={styles.danger} onClick={destroy}>Delete list</button>
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <p className={styles.note}>
          {list.isOwner
            ? <>Nothing in here yet. Add things from any item page, or <Link to="/search" className={styles.link}>find something</Link>.</>
            : 'This list is empty.'}
        </p>
      ) : (
        <ol className={styles.items}>
          {items.map((item, i) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.rank}>{i + 1}</span>

              <Link to={`/media/${item.movie.type}/${item.movie.externalId}`} className={styles.thumb}>
                <Poster url={item.movie.posterUrl} title={item.movie.title} />
              </Link>

              <div className={styles.body}>
                <Link to={`/media/${item.movie.type}/${item.movie.externalId}`} className={styles.itemTitle}>
                  {item.movie.title}
                </Link>
                <p className={styles.itemMeta}>
                  <span className={styles.badge}>{TYPE_LABEL[item.movie.type] ?? item.movie.type}</span>
                  {item.movie.releaseYear ? ` · ${item.movie.releaseYear}` : ''}
                </p>
                {item.note && <p className={styles.itemNote}>{item.note}</p>}
              </div>

              {list.isOwner && (
                <div className={styles.itemActions}>
                  <button
                    className={styles.iconBtn}
                    onClick={() => move(item, 'up')}
                    disabled={busy || i === 0}
                    aria-label={`Move ${item.movie.title} up`}
                  >
                    ↑
                  </button>
                  <button
                    className={styles.iconBtn}
                    onClick={() => move(item, 'down')}
                    disabled={busy || i === items.length - 1}
                    aria-label={`Move ${item.movie.title} down`}
                  >
                    ↓
                  </button>
                  <button
                    className={styles.iconBtn}
                    onClick={() => remove(item)}
                    aria-label={`Remove ${item.movie.title}`}
                  >
                    ×
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}

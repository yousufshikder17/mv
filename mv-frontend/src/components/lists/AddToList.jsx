import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { getMyLists, createList, addListItem } from '../../services/listService.js'
import styles from './AddToList.module.css'

/**
 * "Add to list" for one catalogue item (M9).
 *
 * Lists are fetched when the menu opens rather than on mount: this renders on
 * every item page, and most visits never touch it.
 *
 * Only rendered once the item has a catalogue row — a list points at
 * media_item, and a page nobody has added yet has no row to point at.
 */
export default function AddToList({ mediaItemId, showToast }) {
  const { isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isAuthenticated) return null

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    try {
      const res = await getMyLists()
      setLists(res.data?.data?.lists ?? [])
    } catch {
      setLists([])
    }
  }

  const add = async (listId) => {
    setBusy(true)
    try {
      await addListItem(listId, { mediaItemId })
      setOpen(false)
      showToast?.('Added to list', 'success')
    } catch (err) {
      showToast?.(
        err.response?.status === 409
          ? 'That is already in this list'
          : 'Could not add that',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await createList({ name: name.trim() })
      await addListItem(res.data.data.list.id, { mediaItemId })
      setName('')
      setOpen(false)
      showToast?.(`Added to ${res.data.data.list.name}`, 'success')
    } catch (err) {
      showToast?.(
        err.response?.status === 409
          ? 'You already have a list with that name'
          : 'Could not create that list',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <button className={`btn-ghost ${styles.trigger}`} onClick={toggle} id="add-to-list">
        + Add to list
      </button>

      {open && (
        <div className={styles.panel}>
          {lists === null && <p className={styles.note}>Loading…</p>}

          {lists?.length === 0 && (
            <p className={styles.note}>No lists yet — name one below.</p>
          )}

          {lists?.map((l) => (
            <button
              key={l.id}
              type="button"
              className={styles.row}
              onClick={() => add(l.id)}
              disabled={busy}
            >
              <span className={styles.rowName}>{l.name}</span>
              <span className={styles.rowMeta}>{l.itemCount}</span>
            </button>
          ))}

          <form className={styles.newForm} onSubmit={createAndAdd}>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New list…"
              maxLength={80}
            />
            <button type="submit" className={styles.newBtn} disabled={busy || !name.trim()}>
              Create
            </button>
          </form>

          <Link to="/lists" className={styles.manage} onClick={() => setOpen(false)}>
            Manage lists →
          </Link>
        </div>
      )}
    </div>
  )
}

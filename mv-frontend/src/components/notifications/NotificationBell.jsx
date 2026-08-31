import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getNotifications, markNotificationsRead, getVapidKey, subscribePush,
} from '../../services/watchlistService.js'
import styles from './NotificationBell.module.css'

/**
 * The in-app inbox.
 *
 * This is the channel that always works: the backend writes a notification
 * row for every alert before it tries email or push, so a price drop is
 * waiting here even when the mail provider is down or the browser never
 * granted permission.
 */

// Web Push wants the VAPID public key as raw bytes; the server sends base64url.
// Browsers have no built-in conversion between the two.
const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  // Read once at mount rather than set from an effect: Notification.permission
  // is a synchronous property, so an effect would only cause a second render
  // to arrive at the value we already had.
  const [pushState, setPushState] = useState(() => {
    if (typeof window === 'undefined') return 'unsupported'
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
    return Notification.permission === 'granted' ? 'on' : 'off'
  })
  const panelRef = useRef(null)

  const load = async () => {
    try {
      const res = await getNotifications()
      setItems(res.data?.data?.notifications ?? [])
      setUnread(res.data?.unread ?? 0)
    } catch { /* signed out or server down - the bell just stays quiet */ }
  }

  useEffect(() => {
    // Polled, not pushed: a websocket for an inbox that changes once a day is
    // a connection kept alive for nothing.
    const timer = setInterval(load, 5 * 60 * 1000)
    // Deferred by a tick so the first fetch is not part of the mount render.
    const first = setTimeout(load, 0)
    return () => { clearInterval(timer); clearTimeout(first) }
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const enablePush = async () => {
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushState('off'); return }

      const reg = await navigator.serviceWorker.register('/sw.js')
      const { data } = await getVapidKey()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.data.publicKey),
      })
      await subscribePush(sub.toJSON())
      setPushState('on')
    } catch {
      setPushState('off')
    }
  }

  const openItem = async (n) => {
    await markNotificationsRead(n.id)
    setUnread((u) => Math.max(0, u - (n.readAt ? 0 : 1)))
    setOpen(false)
    if (n.url) navigate(n.url)
  }

  const readAll = async () => {
    await markNotificationsRead()
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
  }

  return (
    <div className={styles.wrap} ref={panelRef}>
      <button
        className={styles.bell}
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        id="notification-bell"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a6 6 0 0 0-6 6v3.6l-1.7 3.1a1 1 0 0 0 .87 1.5h13.66a1 1 0 0 0 .87-1.5L18 11.6V8a6 6 0 0 0-6-6Z" />
          <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0Z" />
        </svg>
        {unread > 0 && <span className={styles.dot}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className={styles.panel} id="notification-panel">
          <div className={styles.head}>
            <span className={styles.title}>Notifications</span>
            {unread > 0 && (
              <button className={styles.readAll} onClick={readAll}>Mark all read</button>
            )}
          </div>

          {pushState === 'off' && (
            <button className={styles.enablePush} onClick={enablePush}>
              Get these on your phone and desktop
            </button>
          )}

          {items.length === 0 ? (
            <p className={styles.empty}>
              Nothing yet. Set a price alert on a game and we will tell you when it drops.
            </p>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    className={`${styles.item} ${n.readAt ? '' : styles.unreadItem}`}
                    onClick={() => openItem(n)}
                  >
                    <span className={styles.itemTitle}>{n.title}</span>
                    <span className={styles.itemBody}>{n.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

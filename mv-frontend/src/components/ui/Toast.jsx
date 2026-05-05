import styles from './Toast.module.css'

export default function Toast({ message, type = 'default' }) {
  if (!message) return null
  return (
    <div
      className={`toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''} ${styles.toast}`}
      role="status"
      aria-live="polite"
      id="global-toast"
    >
      {message}
    </div>
  )
}

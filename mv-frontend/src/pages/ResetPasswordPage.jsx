import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { resetPassword } from '../services/authService.js'
import styles from './PasswordPage.module.css'

const MIN_LENGTH = 8

/**
 * Choose a new password, using the token from the emailed link.
 *
 * The token stays in the query string and is never written to storage: it is a
 * temporary password, and it should stop existing on this device the moment it
 * is spent.
 */
export default function ResetPasswordPage({ showToast }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    document.title = 'Choose a new password — mv'
    return () => { document.title = 'mv — Personal media ledger' }
  }, [])

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && password !== confirm
  const ready = password.length >= MIN_LENGTH && password === confirm

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password)
      // Every existing session is now revoked, including any the attacker had
      // if this reset happened because somebody else knew the password.
      showToast?.('Password changed. Sign in again.', 'success')
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Could not reset your password')
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.h1}>That link is incomplete</h1>
          <p className={styles.body}>
            Open the link from the email exactly as it was sent, or{' '}
            <Link to="/forgot-password" className={styles.link}>ask for a new one</Link>.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Password</p>
        <h1 className={styles.h1}>Choose a new password</h1>
        <p className={styles.body}>
          This signs you out everywhere. Any other device will need the new
          password.
        </p>

        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label} htmlFor="new-password">New password</label>
          <input
            id="new-password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            autoFocus
          />
          {tooShort && <p className={styles.hint}>At least {MIN_LENGTH} characters.</p>}

          <label className={styles.label} htmlFor="confirm-password">Confirm</label>
          <input
            id="confirm-password"
            className={styles.input}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {mismatch && <p className={styles.hint}>Those do not match.</p>}

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className="btn-accent" disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>

        <p className={styles.foot}>
          <Link to="/login" className={styles.link}>Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}

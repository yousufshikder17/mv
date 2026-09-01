import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../services/authService.js'
import styles from './PasswordPage.module.css'

/**
 * Request a reset link.
 *
 * The confirmation is deliberately identical whether or not the address has an
 * account, because the API answers identically — saying "no account with that
 * address" here would rebuild the enumeration oracle the backend avoids.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Reset your password — mv'
    return () => { document.title = 'mv — Personal media ledger' }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await forgotPassword(email.trim())
    } catch {
      // Same outcome either way: a failure here must not reveal whether the
      // address exists.
    } finally {
      setSent(true)
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Password</p>
        <h1 className={styles.h1}>Reset your password</h1>

        {sent ? (
          <>
            <p className={styles.body}>
              If that address has an account, a reset link is on its way. It
              works once and expires in an hour.
            </p>
            <p className={styles.body}>
              Nothing arrived? Check spam, then{' '}
              <button type="button" className={styles.linkBtn} onClick={() => setSent(false)}>
                try another address
              </button>.
            </p>
          </>
        ) : (
          <>
            <p className={styles.body}>
              Enter the address you signed up with and we will send a link to
              choose a new password.
            </p>

            <form className={styles.form} onSubmit={submit}>
              <label className={styles.label} htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
              <button type="submit" className="btn-accent" disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className={styles.foot}>
          <Link to="/login" className={styles.link}>Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}

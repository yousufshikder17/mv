import { useState, useEffect } from 'react'
import { getItemPrices, setAlert } from '../../services/watchlistService.js'
import { useAuth } from '../../hooks/useAuth.js'
import styles from './PricePanel.module.css'

const SYMBOL = { USD: '$', GBP: '£', EUR: '€' }
const money = (cents, currency = 'USD') =>
  `${SYMBOL[currency] ?? ''}${(cents / 100).toFixed(2)}`

/**
 * A sparkline of what our own polling has observed.
 *
 * Inline SVG rather than a charting library: this is one polyline over a few
 * hundred points, and a dependency for that is a dependency to maintain,
 * update, and ship to every visitor.
 */
function Sparkline({ points, currency }) {
  if (points.length < 2) return null

  const W = 260, H = 48, PAD = 3
  const values = points.map((p) => p.priceCents)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat line would divide by zero and render pinned to the top.
  const span = max - min || 1

  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - (p.priceCents - min) / span) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.spark} aria-hidden="true">
        <polyline points={coords.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className={styles.chartScale}>
        <span>{money(min, currency)}</span>
        <span>{points.length} days observed</span>
        <span>{money(max, currency)}</span>
      </div>
    </div>
  )
}

/**
 * Current prices, ITAD history lows, and the alert control.
 *
 * The lows come from ITAD and are labelled as theirs. Our own observations
 * are shown separately and never presented as an all-time low: we have only
 * been watching since the poller started, and claiming otherwise would be
 * inventing history we do not have (SPEC 7).
 */
export default function PricePanel({ type, externalId, mediaItemId, showToast }) {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await getItemPrices(type, externalId)
        if (alive) setData(res.data?.data ?? null)
      } catch {
        if (alive) setData(null)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [type, externalId])

  const saveAlert = async () => {
    const value = Number.parseFloat(threshold)
    if (!Number.isFinite(value) || value < 0) return
    setSaving(true)
    try {
      // Cents, because every price in this system is an integer.
      await setAlert({ mediaItemId, thresholdCents: Math.round(value * 100) })
      showToast?.(`We will tell you when it drops below ${money(Math.round(value * 100))}.`, 'success')
      setThreshold('')
    } catch (err) {
      showToast?.(err.response?.data?.error ?? 'Could not set that alert.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className={styles.wrap}><div className="spinner" /></div>
  if (!data || (!data.deals.length && !data.historyLow)) return null

  const best = data.deals[0]
  const low = data.historyLow
  const isAllTimeLow = best && low?.allTimeCents != null && best.priceCents <= low.allTimeCents

  return (
    <section className={styles.wrap} id="price-panel">
      <p className={styles.label}>Prices</p>

      {best && (
        <div className={styles.headline}>
          <span className={styles.price}>{money(best.priceCents, best.currency)}</span>
          <span className={styles.store}>at {best.platform}</span>
          {isAllTimeLow && <span className={styles.badge}>Lowest ever</span>}
          {best.discountPercent > 0 && !isAllTimeLow && (
            <span className={styles.cut}>-{best.discountPercent}%</span>
          )}
        </div>
      )}

      {low && (
        <ul className={styles.lows}>
          {low.allTimeCents != null && <li><span>All-time low</span><b>{money(low.allTimeCents, low.currency)}</b></li>}
          {low.year1Cents != null && <li><span>1-year low</span><b>{money(low.year1Cents, low.currency)}</b></li>}
          {low.month3Cents != null && <li><span>3-month low</span><b>{money(low.month3Cents, low.currency)}</b></li>}
        </ul>
      )}

      <Sparkline points={data.observed ?? []} currency={best?.currency} />

      {data.deals.length > 1 && (
        <ul className={styles.stores}>
          {data.deals.slice(0, 5).map((d) => (
            <li key={d.platform}>
              <a href={d.url} target="_blank" rel="noopener noreferrer">{d.platform}</a>
              <b>{money(d.priceCents, d.currency)}</b>
            </li>
          ))}
        </ul>
      )}

      {isAuthenticated && mediaItemId && (
        <div className={styles.alertRow}>
          <label htmlFor="alert-threshold">Tell me when it drops below</label>
          <div className={styles.alertInput}>
            <input
              id="alert-threshold"
              type="number"
              min="0"
              step="0.01"
              placeholder="20.00"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <button className="btn-ghost" onClick={saveAlert} disabled={saving || !threshold}>
              {saving ? 'Saving...' : 'Watch'}
            </button>
          </div>
        </div>
      )}

      <p className={styles.credit}>
        Price data from{' '}
        <a href="https://isthereanydeal.com" target="_blank" rel="noopener noreferrer">IsThereAnyDeal</a>.
        The lows are theirs; the chart is only what we have observed since we started watching.
      </p>
    </section>
  )
}

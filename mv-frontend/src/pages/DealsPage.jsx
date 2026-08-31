import { useState, useEffect, useCallback } from 'react'
import { getDeals, getDealPlatforms, voteDeal } from '../services/watchlistService.js'
import { useAuth } from '../hooks/useAuth.js'
import Poster from '../components/ui/Poster.jsx'
import TmdbCredit from '../components/layout/TmdbCredit.jsx'
import RawgCredit from '../components/layout/RawgCredit.jsx'
import ItadCredit from '../components/layout/ItadCredit.jsx'
import { SearchIcon } from '../components/ui/Icon.jsx'
import { TYPE_LABEL } from '../lib/media.js'
import styles from './DealsPage.module.css'

const SYMBOL = { USD: '$', GBP: '£', EUR: '€' }
const money = (cents, currency) =>
  (SYMBOL[currency] || '') + (cents / 100).toFixed(2)

/**
 * The deal feed. Public - no account (M7).
 *
 * A deal is a link: you look at it and click through to the store. There is
 * nothing to sign up for, which is why this is a route in the existing app
 * rather than a second frontend with its own user table.
 */
export default function DealsPage({ showToast }) {
  const { isAuthenticated } = useAuth()
  const [deals, setDeals] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [loading, setLoading] = useState(true)
  const [voted, setVoted] = useState({})

  const [query, setQuery] = useState('')
  // Debounced separately so typing does not fire a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [type, setType] = useState('')
  const [minDiscount, setMinDiscount] = useState(0)
  const [platform, setPlatform] = useState('')
  const [expiring, setExpiring] = useState(false)
  const [sort, setSort] = useState('score')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDeals({
        q: debouncedQuery || undefined,
        type: type || undefined,
        minDiscount: minDiscount || undefined,
        platform: platform || undefined,
        expiring: expiring ? 'true' : undefined,
        sort,
      })
      setDeals(res.data?.data?.deals ?? [])
    } catch {
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, type, minDiscount, platform, expiring, sort])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  // 300ms. Long enough that a normal typing speed produces one request,
  // short enough that the list does not feel stuck.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    getDealPlatforms()
      .then((res) => setPlatforms(res.data?.data?.platforms ?? []))
      .catch(() => {})
  }, [])

  const vote = async (deal) => {
    if (!isAuthenticated) {
      // The prompt belongs at the moment of writing, never on arrival.
      showToast?.('Sign in to vote on deals.', 'default')
      return
    }
    const next = voted[deal.mediaItemId] ? 0 : 1
    setVoted((v) => ({ ...v, [deal.mediaItemId]: next }))
    try {
      await voteDeal(deal.mediaItemId, 1)
    } catch {
      setVoted((v) => ({ ...v, [deal.mediaItemId]: next ? 0 : 1 }))
    }
  }

  const sourcesShown = new Set(deals.map((d) => d.source))

  return (
    <main className={styles.page} id="deals-page">
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Deals</p>
          <h1 className={styles.title}>Price drops, ranked by how good they actually are.</h1>
          <p className={styles.sub}>
            Scored against each item&rsquo;s own price history, not just the discount on the label.
            {' '}<a className={styles.rss} href="/deals/rss">RSS</a>
          </p>
        </div>
      </section>

      <div className={styles.filters}>
        {/* Searches what is actually on sale, not the whole catalogue - a
            result you cannot buy is not a deal. */}
        <div className={styles.searchWrap}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search deals..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            id="deal-search"
          />
          {query && (
            <button className={styles.clear} onClick={() => setQuery('')} aria-label="Clear search">
              &#215;
            </button>
          )}
        </div>

        <div className={styles.filterGroup}>
          {[['', 'All'], ['game', 'Games'], ['book', 'Books'], ['album', 'Music']].map(([v, label]) => (
            <button
              key={label}
              className={type === v ? styles.chipOn : styles.chip}
              onClick={() => setType(v)}
              id={'deal-type-' + label.toLowerCase()}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.filterGroup}>
          {[0, 25, 50, 75].map((d) => (
            <button
              key={d}
              className={minDiscount === d ? styles.chipOn : styles.chip}
              onClick={() => setMinDiscount(d)}
            >
              {d === 0 ? 'Any discount' : d + '%+'}
            </button>
          ))}
        </div>

        <button
          className={expiring ? styles.chipOn : styles.chip}
          onClick={() => setExpiring((e) => !e)}
          id="deal-expiring"
        >
          Ending within 24h
        </button>

        {platforms.length > 1 && (
          <select className={styles.select} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All stores</option>
            {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="score">Best deals</option>
          <option value="discount">Biggest discount</option>
          <option value="price">Cheapest</option>
          <option value="newest">Newest</option>
          <option value="votes">Most upvoted</option>
        </select>
      </div>

      <div className={styles.feed}>
        {loading && <div className={styles.center}><div className="spinner" /></div>}

        {!loading && deals.length === 0 && (
          <p className={styles.empty}>
            {debouncedQuery
              ? `Nothing on sale matching "${debouncedQuery}". Only titles currently
                 discounted appear here - try clearing the filters.`
              : `No deals match those filters right now. Prices are collected daily,
                 so this changes as sales come and go.`}
          </p>
        )}

        {!loading && deals.map((deal) => (
          <article key={deal.mediaItemId} className={styles.deal}>
            <div className={styles.posterWrap}>
              <Poster url={deal.posterUrl} title={deal.title} />
            </div>

            <div className={styles.body}>
              <p className={styles.meta}>
                <span className={styles.badge}>{TYPE_LABEL[deal.type] ?? deal.type}</span>
                {' · '}{deal.platform}
                {deal.hoursLeft != null && deal.hoursLeft <= 24 && (
                  <span className={styles.urgent}>{' · '}{deal.hoursLeft}h left</span>
                )}
              </p>

              <h2 className={styles.dealTitle}>{deal.title}</h2>

              <div className={styles.priceRow}>
                <span className={styles.price}>{money(deal.priceCents, deal.currency)}</span>
                {deal.originalPriceCents > deal.priceCents && (
                  <span className={styles.was}>{money(deal.originalPriceCents, deal.currency)}</span>
                )}
                {/* The reason, never a bare number - the same rule as
                    recommendations. A score with no explanation is a score
                    nobody trusts. */}
                <span className={deal.score >= 90 ? styles.reasonStrong : styles.reason}>
                  {deal.reason}
                </span>
              </div>
            </div>

            <div className={styles.actions}>
              <a className="btn-accent" href={deal.url} target="_blank" rel="noopener noreferrer">
                View deal
              </a>
              <button
                className={voted[deal.mediaItemId] ? styles.voteOn : styles.vote}
                onClick={() => vote(deal)}
                aria-label="Upvote this deal"
              >
                {'▲ '}{deal.votes + (voted[deal.mediaItemId] ?? 0)}
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Credit whichever sources are actually on screen. RAWG requires the
          link on every page displaying their data. */}
      <footer className={styles.attribution}>
        {/* Every price here is ITAD's, so this is unconditional. The others
            depend on which sources supplied the covers on screen. */}
        <ItadCredit />
        {sourcesShown.has('tmdb') && <TmdbCredit />}
        {sourcesShown.has('rawg') && <RawgCredit />}
      </footer>
    </main>
  )
}

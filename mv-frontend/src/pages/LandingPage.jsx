import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import TmdbCredit from '../components/layout/TmdbCredit.jsx'
import Discover from '../components/discover/Discover.jsx'
import { getVariety } from '../services/watchlistService.js'
import { ClapperIcon } from '../components/ui/Icon.jsx'
import styles from './LandingPage.module.css'

// Nine covers, three columns.
const ART = 9

const FEATURES = [
  {
    icon: <ClapperIcon size={26} />,
    title: 'Track Everything',
    body: 'Films, shows, games, books and albums in one ledger — with the progress that suits each: seasons, episodes, pages, playtime.',
  },
  {
    icon: '★',
    title: 'Rate & Review',
    body: 'Score anything out of 10, review it at length, and keep private notes nobody else sees.',
  },
  {
    icon: '◎',
    title: 'Watch Prices',
    body: 'Know when something hits a genuine low — measured against its real price history, not a launch price nobody paid.',
  },
]

const STEPS = [
  { num: '01', title: 'Create your vault', body: 'Sign up in seconds. No credit card, no noise.' },
  { num: '02', title: 'Add anything',      body: 'Search five catalogues at once and add what you find in a click.' },
  { num: '03', title: 'Track your taste',  body: 'Rate, review, set status, and watch what it costs.' },
]

export default function LandingPage() {
  const [variety, setVariety] = useState([])

  useEffect(() => {
    let alive = true
    // Silent: a discovery row that did not load is not worth a toast on a
    // marketing page, and the hero simply renders without its art.
    getVariety()
      .then((res) => { if (alive) setVariety(res.data?.data ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // The art wall is the catalogue itself rather than a hardcoded poster list.
  // It costs no extra request, it is never stale, and on a page whose whole
  // claim is "everything in one place" it actually shows five media types
  // instead of nine films.
  const art = variety.filter((i) => i.posterUrl).slice(0, ART)

  return (
    <main className={styles.page} id="landing-page">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className={styles.hero} id="hero">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Personal media ledger</p>
          <h1 className={styles.headline}>
            Everything you've<br />
            <em>ever</em> watched,<br />
            played and <em>read.</em>
          </h1>
          <p className={styles.subheadline}>
            mv is the quiet, beautiful place to log every film, show, game,<br className="hide-mobile" />
            book and album — and to know what they cost.
          </p>
          <div className={styles.heroCta}>
            <Link to="/register" className="btn-accent" id="hero-cta-register">
              Start for free →
            </Link>
            <Link to="/login" className="btn-ghost" id="hero-cta-login">
              Sign in
            </Link>
          </div>
          {/* Stats strip */}
          <div className={styles.stats}>
            {[['5', 'Media types'],['★ 10', 'Rating scale'],['∞', 'Things to track']].map(([v, l]) => (
              <div key={l} className={styles.stat}>
                <span className={styles.statVal}>{v}</span>
                <span className={styles.statLbl}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative. The grid below is the accessible copy of this. */}
        <div className={styles.heroArt} aria-hidden="true">
          {art.map((item, i) => (
            <div key={`${item.type}-${item.externalId}`} className={styles.artCell} style={{ animationDelay: `${i * .12}s` }}>
              <img
                src={item.posterUrl}
                alt=""
                loading={i < 6 ? 'eager' : 'lazy'}
                decoding="async"
                draggable="false"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Discover (public, no account) ────────────────────────── */}
      <Discover items={variety} />

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className={styles.section} id="features">
        <div className={styles.sectionInner}>
          <p className={styles.sectionEyebrow}>Why mv</p>
          <h2 className={styles.sectionTitle}>Everything you need.<br />Nothing you don't.</h2>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard} id={`feature-${f.title.toLowerCase().replace(/\s/g,'-')}`}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className={`${styles.section} ${styles.howSection}`} id="how-it-works">
        <div className={styles.sectionInner}>
          <p className={styles.sectionEyebrow}>How it works</p>
          <h2 className={styles.sectionTitle}>Up and running<br />in three steps.</h2>
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div key={s.num} className={styles.step} id={`step-${i+1}`}>
                <span className={styles.stepNum}>{s.num}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner (affiliate-ready slot) ───────────────────── */}
      <section className={styles.ctaBanner} id="cta-banner">
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Your vault is waiting.</h2>
          <p className={styles.ctaBody}>
            Free forever for personal use. Start logging today.
          </p>
          {/* Affiliate link placeholder — replace href with partner URL */}
          <div className={styles.ctaActions}>
            <Link to="/register" className="btn-accent" id="cta-register-btn">
              Create your vault →
            </Link>
            {/* Affiliate slot — hidden until an account is approved. The tag
                then lives in .env, never here: SPEC §1/§2, a committed tag on
                a forked public repo is what gets an Associates account banned
                permanently. Un-comment when there is a real URL to point at.
            <a
              href="#"
              className="btn-ghost"
              id="cta-affiliate-link"
              data-slot="affiliate"
              aria-label="Sponsored link"
            >
              Explore film gear ↗
            </a>
            */}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className={styles.footer} id="landing-footer">
        <div className={styles.footerInner}>
          <span className={styles.footerLogo}>◆ <em>mv</em></span>
          <p className={styles.footerNote}>Personal media ledger — films, shows, games, books and music.</p>
          <TmdbCredit />
          {/* Ad slot — SPEC §1: NOT BUILT. Ads would make the project
              commercial under TMDB's terms and trigger the $149/mo tier, on a
              page that is serving TMDB posters. Do not un-comment without
              resolving §3 first.
          <div className={styles.adSlot} id="footer-ad-slot" data-slot="ad">
            <span>Ad slot</span>
          </div>
          */}
        </div>
      </footer>
    </main>
  )
}

import { Link } from 'react-router-dom'
import TmdbCredit from '../components/layout/TmdbCredit.jsx'
import styles from './LandingPage.module.css'

const FEATURES = [
  {
    icon: '🎬',
    title: 'Track Everything',
    body: 'Log every film you\'ve watched, are watching, or plan to watch. Your complete personal cinema history.',
  },
  {
    icon: '★',
    title: 'Rate & Review',
    body: 'Give each film a score out of 10. Add private notes, thoughts, and tags that only you can see.',
  },
  {
    icon: '◎',
    title: 'Set Goals',
    body: 'Define watching goals — genres to explore, directors to complete, annual counts to hit. Stay intentional.',
  },
]

const STEPS = [
  { num: '01', title: 'Create your vault', body: 'Sign up in seconds. No credit card, no noise.' },
  { num: '02', title: 'Add your films',    body: 'Search your personal DB and add titles with one click.' },
  { num: '03', title: 'Track your taste',  body: 'Rate, review, set status, and build your film identity.' },
]

export default function LandingPage() {
  return (
    <main className={styles.page} id="landing-page">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className={styles.hero} id="hero">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Personal film ledger</p>
          <h1 className={styles.headline}>
            Every film you've<br />
            <em>ever</em> watched,<br />
            in one <em>vault.</em>
          </h1>
          <p className={styles.subheadline}>
            mv is the quiet, beautiful place to log every film,<br className="hide-mobile" />
            track your goals, and understand your taste.
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
            {[['∞', 'Films to track'],['★ 10', 'Rating scale'],['4', 'Status tiers']].map(([v, l]) => (
              <div key={l} className={styles.stat}>
                <span className={styles.statVal}>{v}</span>
                <span className={styles.statLbl}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative film grid */}
        <div className={styles.heroArt} aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={styles.artCell} style={{ animationDelay: `${i * .12}s` }} />
          ))}
        </div>
      </section>

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
            {/* Affiliate slot */}
            <a
              href="#"
              className="btn-ghost"
              id="cta-affiliate-link"
              data-slot="affiliate"
              aria-label="Sponsored link"
            >
              Explore film gear ↗
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className={styles.footer} id="landing-footer">
        <div className={styles.footerInner}>
          <span className={styles.footerLogo}>◆ <em>mv</em></span>
          <p className={styles.footerNote}>Personal film ledger — built for cinephiles.</p>
          <TmdbCredit />
          {/* Ad slot placeholder */}
          <div className={styles.adSlot} id="footer-ad-slot" data-slot="ad">
            <span>Ad slot</span>
          </div>
        </div>
      </footer>
    </main>
  )
}

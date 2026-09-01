import { Link } from 'react-router-dom'
import { ClapperIcon } from '../ui/Icon.jsx'
import SourceCredit from './SourceCredit.jsx'
import styles from './Pitch.module.css'

// Three cards, three icons, in order. The copy varies per page; the marks do
// not — they are decoration, and inventing a new glyph per media type would
// make six pages look like six products.
const ICONS = [<ClapperIcon key="c" size={26} />, '★', '◎']

/**
 * Everything below the fold: features, how it works, the CTA banner and the
 * footer. Shared by home and all five type pages.
 *
 * Extracted rather than copied because it is four sections deep. Six copies
 * would be six places to update a licensing notice, which is exactly the kind
 * of thing that gets missed in five of them.
 */
export default function Pitch({ label, features, cta, footerNote, type = null }) {
  const [ctaTitle, ctaBody] = cta
  const noun = label.toLowerCase()

  const steps = [
    ['01', 'Create your vault', 'Sign up in seconds. No credit card, no noise.'],
    ['02', `Add your ${noun}`, `Search ${noun} and add what you find in a click.`],
    ['03', 'Track your taste', 'Rate, review, set status, and pick up where you left off.'],
  ]

  return (
    <>
      <section className={styles.section} id="features">
        <div className={styles.inner}>
          <p className={styles.eyebrow}>Why mv</p>
          <h2 className={styles.title}>Everything you need.<br />Nothing you don't.</h2>

          <div className={styles.featureGrid}>
            {features.map(([title, body], i) => (
              <div key={title} className={styles.featureCard} id={`feature-${i + 1}`}>
                <span className={styles.featureIcon}>{ICONS[i]}</span>
                <h3 className={styles.featureTitle}>{title}</h3>
                <p className={styles.featureBody}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.howSection}`} id="how-it-works">
        <div className={styles.inner}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 className={styles.title}>Up and running<br />in three steps.</h2>

          <div className={styles.steps}>
            {steps.map(([num, title, body]) => (
              <div key={num} className={styles.step} id={`step-${num}`}>
                <span className={styles.stepNum}>{num}</span>
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepBody}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ctaBanner} id="cta-banner">
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>{ctaTitle}</h2>
          <p className={styles.ctaBody}>{ctaBody}</p>
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
              Explore gear ↗
            </a>
            */}
          </div>
        </div>
      </section>

      <footer className={styles.footer} id="landing-footer">
        <div className={styles.footerInner}>
          <span className={styles.footerLogo}>◆ <em>mv</em></span>
          <p className={styles.footerNote}>{footerNote}</p>
          {/* Credits the source this page actually used, not a fixed list. */}
          <SourceCredit type={type} />
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
    </>
  )
}

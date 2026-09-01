import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Hero from '../components/marketing/Hero.jsx'
import Pitch from '../components/marketing/Pitch.jsx'
import Discover from '../components/discover/Discover.jsx'
import { getVariety } from '../services/watchlistService.js'
import { HOME_ART } from '../lib/media.js'
import styles from './LandingPage.module.css'

// Nine covers, three columns.
const ART = 9

const FEATURES = [
  ['Track Everything', 'Films, shows, games, books and albums in one ledger — each with the progress that suits it: seasons, episodes, pages, playtime.'],
  ['Rate & Review', 'Score anything out of 10, review it at length, flag spoilers, and keep private notes nobody else sees.'],
  ['Watch Prices', 'Know when something hits a genuine low — measured against its real price history, not a launch price nobody paid.'],
]

/**
 * Home, public (M3).
 *
 * The one page that shows all five media types at once — which is why the
 * mixed row is the only row it carries. A film chart lives on /films, where
 * it does not have to pretend to speak for games and books too.
 */
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

  // Curated, and its own set - no cover here appears on a type page.
  //
  // Filled from the catalogue at first, which sounded principled and looked
  // wrong: 25 seeded games against two films produced a wall of game art on
  // the page whose whole claim is that it holds five kinds of thing. Then it
  // borrowed from the type walls, which made home read as a summary of the
  // other pages. It is now its own curation. The row underneath is still live.
  const art = HOME_ART.slice(0, ART)

  return (
    <main className={styles.page} id="landing-page">
      <Hero
        eyebrow="Personal media ledger"
        headline={<>Everything you've<br /><em>ever</em> watched,<br />played and <em>read.</em></>}
        sub="mv is the quiet, beautiful place to log every film, show, game, book and album — and to know what they cost."
        stats={[['5', 'Media types'], ['★ 10', 'Rating scale'], ['∞', 'Things to track']]}
        art={art}
        actions={
          <>
            <Link to="/register" className="btn-accent" id="hero-cta-register">Start for free →</Link>
            <Link to="/login" className="btn-ghost" id="hero-cta-login">Sign in</Link>
          </>
        }
      />

      <Discover items={variety} />

      <Pitch
        label="media"
        features={FEATURES}
        cta={['Your vault is waiting.', 'Free forever for personal use. Start logging today.']}
        footerNote="Personal media ledger — films, shows, games, books and music."
      />
    </main>
  )
}

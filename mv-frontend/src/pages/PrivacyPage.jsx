import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import styles from './PrivacyPage.module.css'

/**
 * Privacy policy.
 *
 * Written from the schema rather than from a template: every table that holds
 * personal data is named here, and so is every third party a request can
 * reach. A policy that describes a different product than the one running is
 * worse than none, because it is a claim rather than an omission.
 *
 * Kept as a page rather than a markdown file so it is reachable from the
 * footer, which is where anyone actually looks for it.
 */
export default function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy — mv'
    return () => { document.title = 'mv — Personal media ledger' }
  }, [])

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Privacy</p>
        <h1 className={styles.h1}>What mv stores, and why</h1>
        <p className={styles.updated}>Last updated 1 September 2026</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.h2}>What an account holds</h2>
        <p>
          Your name, email address and a bcrypt hash of your password. The
          password itself is never stored and cannot be recovered from the
          hash — a reset replaces it.
        </p>
        <p>Everything else is what you create by using the site:</p>
        <ul className={styles.list}>
          <li>Tracked items, with status, rating, progress and private notes</li>
          <li>Per-season ratings for television</li>
          <li>Reviews, comments and votes you cast on other people's reviews</li>
          <li>Lists, their contents, and the note you attach to each entry</li>
          <li>Who you follow</li>
          <li>Price alerts, and the notifications sent against them</li>
          <li>Push subscriptions, if you turn on browser notifications</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>What other people can see</h2>
        <p>
          Privacy is layered, and every layer defaults to the more private
          option where a default exists at all:
        </p>
        <ul className={styles.list}>
          <li>
            <b>Your profile</b> is public by default and can be made private,
            which hides it, your reviews and your comments from everyone else.
          </li>
          <li>
            <b>Individual tracked items</b> can be hidden. A hidden item never
            appears on your profile, in anyone's activity feed, or in the
            statistics shown to other people.
          </li>
          <li>
            <b>Lists</b> are private until you publish them, and a published
            list stops being visible if you later make your profile private.
          </li>
          <li>
            <b>Price alerts and private notes are never public.</b> There is no
            setting that exposes them, because there is no code path that
            reads them for anyone but you.
          </li>
        </ul>
        <p>
          Your email address is never shown on a profile or returned by any
          public endpoint.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Third parties</h2>
        <p>
          mv fetches metadata and prices from other services. Browsing sends
          them a request for the title you are looking at; it does not send
          them anything about you.
        </p>
        <ul className={styles.list}>
          <li><b>TMDB</b> — film and television metadata and images</li>
          <li><b>RAWG</b> — game metadata and images</li>
          <li><b>Open Library</b> — book metadata and covers</li>
          <li><b>Google Books</b> — book prices</li>
          <li><b>MusicBrainz</b> and <b>ListenBrainz</b> — album metadata and listening figures</li>
          <li><b>Cover Art Archive</b> and <b>iTunes Search</b> — album artwork</li>
          <li><b>IsThereAnyDeal</b> — game prices and price history</li>
          <li><b>Resend</b> — sends alert emails, and therefore receives your email address</li>
        </ul>
        <p>
          Of these, only Resend receives anything personal, and only when an
          alert you set actually fires. There is no analytics, no advertising
          and no third-party tracking on this site.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Cookies and local storage</h2>
        <p>
          One cookie, named <code>jwt</code>, holding your session token. It is
          <code>HttpOnly</code> and <code>SameSite=Strict</code>, and it is
          served over HTTPS only in production. Your browser also keeps that
          token and your display name in <code>localStorage</code> so a reload
          does not sign you out, along with your theme choice.
        </p>
        <p>
          None of it is used for tracking, and there are no third-party
          cookies, so there is nothing to consent to beyond staying signed in.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>How long things are kept</h2>
        <p>
          What you create is kept until you delete it or close your account.
          Raw price quotes are pruned after <b>90 days</b>; the summarised
          history behind an alert outlives them. Cached metadata from TMDB is
          refreshed at least every 30 days, as their terms require.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Your data, on demand</h2>
        <p>
          <b>Export.</b> Your profile has a download button that returns
          everything the account has created, as JSON, immediately — no
          queue and no waiting on a request. It excludes your password hash and
          push encryption keys, which are credentials rather than your data,
          and the file says so in its own <code>note</code> field.
        </p>
        <p>
          <b>Deletion.</b> Deleting your account removes your tracked items,
          reviews, comments, lists, follows, alerts and subscriptions. Shared
          catalogue rows — the film itself, not your opinion of it — remain,
          because they belong to nobody.
        </p>
        <p>
          <b>Correction.</b> Everything you have written is editable from the
          page it appears on.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Security</h2>
        <p>
          Passwords are hashed with bcrypt. Sessions are signed JSON web tokens
          with an expiry. The API sets HSTS, frame and content-type protections
          and a content security policy that permits images only from the
          sources listed above. Requests are rate limited per address.
        </p>
        <p>
          No system is beyond compromise. If you find a problem here, please
          report it rather than test it against other people's accounts.
        </p>
      </section>

      <footer className={styles.foot}>
        <Link to="/" className={styles.link}>Back home</Link>
      </footer>
    </main>
  )
}

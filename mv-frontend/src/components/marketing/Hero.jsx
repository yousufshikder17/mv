import styles from './Hero.module.css'

/**
 * The hero, shared by home and all five type pages.
 *
 * One implementation rather than six: the headline, the art and the optional
 * stats strip differ, the structure does not. Six copies would be six places
 * to fix a layout bug and six heroes to keep in sync.
 *
 * `art` is a list of cover URLs. It is decorative — the grid further down the
 * page is the accessible version of the same thing — so the wall is hidden
 * from assistive tech entirely rather than described badly.
 */
export default function Hero({ eyebrow, headline, sub, actions, stats, art = [] }) {
  return (
    <section className={styles.hero} id="hero">
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.content}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.sub}>{sub}</p>

        <div className={styles.actions}>{actions}</div>

        {stats && (
          <div className={styles.stats}>
            {stats.map(([value, label]) => (
              <div key={label} className={styles.stat}>
                <span className={styles.statVal}>{value}</span>
                <span className={styles.statLbl}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.art} aria-hidden="true">
        {art.map((src, i) => (
          <div key={src} className={styles.cell} style={{ animationDelay: `${i * 0.12}s` }}>
            <img src={src} alt="" loading={i < 6 ? 'eager' : 'lazy'} decoding="async" draggable="false" />
          </div>
        ))}
      </div>
    </section>
  )
}

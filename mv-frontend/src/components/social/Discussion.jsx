import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import {
  getReviews, saveReview, deleteReview, voteReview,
  getComments, addComment, deleteComment,
} from '../../services/socialService.js'
import Spoiler from './Spoiler.jsx'
import styles from './Discussion.module.css'

const when = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Reviews and discussion for one catalogue item (M8).
 *
 * Reading needs no account; writing does. Only rendered when the item has a
 * catalogue row — reviews are keyed by our uuid, and a page nobody has added
 * yet has no uuid to key them to.
 */
export default function Discussion({ mediaItemId, showToast }) {
  const { isAuthenticated, user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([getReviews(mediaItemId), getComments(mediaItemId)])
      setReviews(r.data?.data?.reviews ?? [])
      setComments(c.data?.data?.comments ?? [])
    } catch {
      // A failed discussion load must not blank the item page around it.
      setReviews([])
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [mediaItemId])

  // Every setState in load() runs after an await, so nothing is set during
  // the render pass the rule below is guarding against.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const mine = reviews.find((r) => r.author?.id === user?.id) ?? null

  if (loading) return <section className={styles.wrap}><p className={styles.muted}>Loading discussion…</p></section>

  return (
    <section className={styles.wrap}>
      <ReviewBlock
        mediaItemId={mediaItemId}
        reviews={reviews}
        mine={mine}
        me={user}
        isAuthenticated={isAuthenticated}
        showToast={showToast}
        reload={load}
      />
      <CommentBlock
        mediaItemId={mediaItemId}
        comments={comments}
        me={user}
        isAuthenticated={isAuthenticated}
        showToast={showToast}
        reload={load}
      />
    </section>
  )
}

/* ── Reviews ─────────────────────────────────────────────────────── */

function ReviewBlock({ mediaItemId, reviews, mine, me, isAuthenticated, showToast, reload }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [spoilers, setSpoilers] = useState(false)
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setBody(mine?.body ?? '')
    setSpoilers(mine?.hasSpoilers ?? false)
    setOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      await saveReview(mediaItemId, { body: body.trim(), hasSpoilers: spoilers })
      setOpen(false)
      await reload()
      showToast?.(mine ? 'Review updated' : 'Review posted', 'success')
    } catch (err) {
      showToast?.(err.response?.data?.message ?? 'Could not save that review', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await deleteReview(mine.id)
      await reload()
      showToast?.('Review deleted', 'success')
    } catch {
      showToast?.('Could not delete that review', 'error')
    }
  }

  const vote = async (id, helpful) => {
    try {
      await voteReview(id, helpful)
      await reload()
    } catch (err) {
      showToast?.(err.response?.data?.error ?? 'Could not register that vote', 'error')
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <h2 className={styles.h}>Reviews</h2>
        {isAuthenticated && !open && (
          <button className="btn-ghost" onClick={startEdit} id="review-write-btn">
            {mine ? 'Edit your review' : 'Write a review'}
          </button>
        )}
      </div>

      {open && (
        <form className={styles.form} onSubmit={submit}>
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What did you make of it?"
            maxLength={10000}
            rows={6}
            autoFocus
          />
          <div className={styles.formRow}>
            <label className={styles.check}>
              <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} />
              Contains spoilers
            </label>
            <span className={styles.count}>{body.length} / 10000</span>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-accent" disabled={saving || !body.trim()}>
              {saving ? 'Saving…' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {reviews.length === 0 && !open && (
        // Honest empty state (SPEC 9): say it is empty, do not invent a review.
        <p className={styles.muted}>
          No reviews yet.{isAuthenticated ? ' Yours would be the first.' : ' '}
          {!isAuthenticated && <Link to="/login" className={styles.link}>Sign in to write one.</Link>}
        </p>
      )}

      <ul className={styles.list}>
        {reviews.map((r) => (
          <li key={r.id} className={styles.review}>
            <div className={styles.byline}>
              <Link to={`/u/${r.author.id}`} className={styles.author}>{r.author.name}</Link>
              <span className={styles.date}>{when(r.updatedAt ?? r.createdAt)}</span>
              {r.author.id === me?.id && (
                <button className={styles.textBtn} onClick={remove}>Delete</button>
              )}
            </div>

            {r.hasSpoilers
              ? <Spoiler><p className={styles.body}>{r.body}</p></Spoiler>
              : <p className={styles.body}>{r.body}</p>}

            <div className={styles.votes}>
              <button
                className={styles.voteBtn}
                onClick={() => vote(r.id, true)}
                disabled={r.author.id === me?.id || !me}
                title={r.author.id === me?.id ? 'You cannot vote on your own review' : 'Helpful'}
              >
                ▲ Helpful {r.helpful > 0 && <b>{r.helpful}</b>}
              </button>
              <button
                className={styles.voteBtn}
                onClick={() => vote(r.id, false)}
                disabled={r.author.id === me?.id || !me}
              >
                ▼ {r.unhelpful > 0 && <b>{r.unhelpful}</b>}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Discussion ──────────────────────────────────────────────────── */

function CommentBlock({ mediaItemId, comments, me, isAuthenticated, showToast, reload }) {
  const [replyTo, setReplyTo] = useState(null)
  const [body, setBody] = useState('')
  const [spoilers, setSpoilers] = useState(false)
  const [saving, setSaving] = useState(false)

  const post = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      await addComment(mediaItemId, { body: body.trim(), hasSpoilers: spoilers, parentId: replyTo })
      setBody('')
      setSpoilers(false)
      setReplyTo(null)
      await reload()
    } catch (err) {
      showToast?.(err.response?.data?.message ?? 'Could not post that', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    try {
      await deleteComment(id)
      await reload()
    } catch {
      showToast?.('Could not delete that comment', 'error')
    }
  }

  const line = (c, isReply) => (
    <li key={c.id} className={isReply ? styles.reply : styles.comment}>
      <div className={styles.byline}>
        <Link to={`/u/${c.author.id}`} className={styles.author}>{c.author.name}</Link>
        <span className={styles.date}>{when(c.createdAt)}</span>
        {isAuthenticated && !isReply && (
          <button className={styles.textBtn} onClick={() => setReplyTo(c.id)}>Reply</button>
        )}
        {c.author.id === me?.id && (
          <button className={styles.textBtn} onClick={() => remove(c.id)}>Delete</button>
        )}
      </div>

      {c.hasSpoilers
        ? <Spoiler><p className={styles.body}>{c.body}</p></Spoiler>
        : <p className={styles.body}>{c.body}</p>}

      {c.replies?.length > 0 && (
        <ul className={styles.replies}>{c.replies.map((r) => line(r, true))}</ul>
      )}
    </li>
  )

  return (
    <div className={styles.block}>
      <h2 className={styles.h}>Discussion</h2>

      {comments.length === 0 && <p className={styles.muted}>Nothing here yet.</p>}
      <ul className={styles.list}>{comments.map((c) => line(c, false))}</ul>

      {isAuthenticated ? (
        <form className={styles.form} onSubmit={post}>
          {replyTo && (
            <p className={styles.replyingTo}>
              Replying to a comment
              <button type="button" className={styles.textBtn} onClick={() => setReplyTo(null)}>cancel</button>
            </p>
          )}
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add to the discussion"
            maxLength={2000}
            rows={3}
          />
          <div className={styles.formRow}>
            <label className={styles.check}>
              <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} />
              Contains spoilers
            </label>
            <button type="submit" className="btn-accent" disabled={saving || !body.trim()}>
              {saving ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.muted}>
          <Link to="/login" className={styles.link}>Sign in</Link> to join the discussion.
        </p>
      )}
    </div>
  )
}

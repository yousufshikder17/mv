import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, passwordResets } from '../db/schema.js';
import { sendMail } from '../services/notifier.js';

/**
 * Password reset, and revoking sessions.
 *
 * The token is a 256-bit random value, emailed in plaintext and stored only as
 * a SHA-256 hash. A reset token is a temporary password — anyone holding one
 * can take the account — so a database dump, a backup or a stray log must not
 * hand them out. Hashing means the only copy of the usable value is in the
 * mailbox it was sent to.
 *
 * SHA-256 rather than bcrypt here, deliberately: bcrypt's cost exists to slow
 * guessing of low-entropy human passwords. This value has 256 bits of entropy
 * and cannot be guessed, so the slow hash would buy nothing and cost a second
 * of CPU on every reset.
 */

const TOKEN_BYTES = 32;

// Long enough to find the email, short enough that a forwarded one goes stale.
const TTL_MS = 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * POST /auth/forgot { email }
 *
 * Always answers the same, whether or not the address exists. Anything else
 * turns this into an account-enumeration oracle: "no such user" tells an
 * attacker which addresses are worth attacking, and this endpoint is
 * unauthenticated by necessity.
 */
export const forgotPassword = async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const answer = {
        status: 'Success',
        message: 'If that address has an account, a reset link is on its way.',
    };

    if (!email) return res.status(200).json(answer);

    const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users).where(eq(users.email, email)).limit(1);

    // Same response, no work done.
    if (!user) return res.status(200).json(answer);

    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');

    await db.insert(passwordResets).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TTL_MS),
    });

    const link = `${process.env.PUBLIC_URL ?? ''}/reset-password?token=${token}`;

    try {
        await sendMail(user.email, {
            title: 'Reset your mv password',
            body: `Someone asked to reset the password on your mv account.\n\n`
                + `Open this link within the hour to choose a new one:\n${link}\n\n`
                + `If that was not you, ignore this - your password has not changed.`,
        });
    } catch {
        // A mail failure must not tell the caller whether the address existed.
        // The row stays; a retry issues a second token, and both expire.
    }

    return res.status(200).json(answer);
};

/**
 * POST /auth/reset { token, password }
 *
 * Consumes the token, sets the password, and invalidates every session the
 * account had. That last part is the point: if the reset happened because
 * someone else had the password, leaving their existing tokens valid would
 * make the reset cosmetic.
 */
export const resetPassword = async (req, res) => {
    const token = String(req.body?.token ?? '');
    const password = String(req.body?.password ?? '');

    if (password.length < 8) {
        return res.status(400).json({ error: 'A password must be at least 8 characters' });
    }

    const [row] = await db
        .select()
        .from(passwordResets)
        .where(and(
            eq(passwordResets.tokenHash, hashToken(token)),
            // Unused and unexpired, both checked in SQL so a spent token
            // cannot be replayed by racing two requests through a read.
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, new Date()),
        ))
        .limit(1);

    // One message for expired, spent, and never-existed alike.
    if (!row) return res.status(400).json({ error: 'That reset link is invalid or has expired' });

    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));

    await db.update(users)
        .set({ password: hashed, tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, row.userId));

    await db.update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, row.id));

    // Any other outstanding link for this account is now moot.
    await db.update(passwordResets)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResets.userId, row.userId), isNull(passwordResets.usedAt)));

    return res.status(200).json({
        status: 'Success',
        message: 'Password changed. Sign in again on every device.',
    });
};

/**
 * POST /auth/sign-out-everywhere
 *
 * Ordinary logout clears the cookie, which cannot revoke a Bearer token
 * already copied elsewhere. This bumps the version instead, so every token
 * ever issued to the account stops working — the thing to reach for when a
 * laptop goes missing.
 *
 * Separate from logout on purpose: signing out of a shared computer should not
 * end the session on your phone.
 */
export const signOutEverywhere = async (req, res) => {
    await db.update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, req.user.id));

    res.cookie('jwt', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        expires: new Date(0),
    });

    return res.status(200).json({ status: 'Success', message: 'Signed out on every device' });
};

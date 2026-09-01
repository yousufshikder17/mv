import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users } from '../db/schema.js';

/**
 * Attaches req.user when a valid token is present, and does nothing otherwise.
 *
 * Distinct from authMiddleware, which rejects. Public social routes need this:
 * a profile is visible to anyone, but its owner should see their own private
 * profile and their own hidden items, and a viewer should see whether they
 * already follow someone.
 *
 * A bad or expired token is treated as no token rather than an error - these
 * routes are public, so the worst outcome of an unreadable token is seeing
 * the page as a stranger would.
 */
export const optionalAuth = async (req, res, next) => {
    const header = req.headers.authorization || '';
    // `jwt`, matching generateToken and authMiddleware. This read `cookies.token`,
    // a name nothing sets, so the cookie fallback never fired: a signed-in
    // viewer without a Bearer header was treated as a stranger on every public
    // route - their own private profile 404'd, their hidden items vanished and
    // follow state came back false. It failed closed, so nothing leaked, but it
    // silently defeated the whole purpose of this middleware.
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.jwt;
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [user] = await db
            .select({
                id: users.id, name: users.name, email: users.email,
                tokenVersion: users.tokenVersion,
            })
            .from(users)
            .where(eq(users.id, decoded.id))
            .limit(1);
        // Same revocation check as authMiddleware. A revoked token must not
        // grant a viewer their own private profile here either.
        if (user && (decoded.v ?? 0) === user.tokenVersion) req.user = user;
    } catch {
        // Public route: carry on as a stranger.
    }

    return next();
};

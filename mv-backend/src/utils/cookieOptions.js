/**
 * The session cookie's attributes, defined once.
 *
 * They were duplicated across four call sites, and that is not hypothetical
 * harm: logout was clearing the cookie with a different set than login wrote
 * it with, so the browser kept two cookies and the session survived the
 * logout. One definition removes the whole class.
 *
 * `secure` fails CLOSED. It used to read `NODE_ENV === 'production'`, which
 * means an unset or misspelled variable silently downgrades the cookie to one
 * that travels over plain HTTP - and nothing anywhere reports it. Inverting the
 * test makes the insecure case the one you have to ask for: only an explicit
 * `development` turns it off, which is exactly where it needs to be off,
 * because a Secure cookie is rejected over http://localhost.
 *
 * Note this deliberately differs from the error-detail checks in
 * authMiddleware and errorMiddleware. Those read `=== 'development'` and are
 * correct as they are: unset means no stack traces, which already fails closed.
 */
const isDevelopment = () => process.env.NODE_ENV === 'development';

/** Shared by every write, so clearing always matches setting. */
const base = () => ({
    httpOnly: true,
    secure: !isDevelopment(),
    sameSite: 'Strict',
});

/** Options for issuing the session cookie. */
export const sessionCookie = (maxAgeMs) => ({ ...base(), maxAge: maxAgeMs });

/**
 * Options for clearing it.
 *
 * A cookie is identified by name AND its attributes, so these have to match
 * what `sessionCookie` wrote or the browser stores a second one and leaves the
 * original alive.
 */
export const clearedCookie = () => ({ ...base(), expires: new Date(0) });

import jwt from 'jsonwebtoken';

// These tokens are stateless, so the expiry is the outer bound on a leaked
// one. Keep it short.
//
// The `v` claim is the inner bound: it carries the account's tokenVersion, and
// every request checks it against the database. Incrementing that column
// invalidates every token already issued - which is what makes a password
// reset, or a "sign out everywhere", mean something for a stateless token.
const DEFAULT_EXPIRY = '1d';

export const generateToken = (userId, res, tokenVersion = 0) => {
    const payload = { id: userId, v: tokenVersion };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        // Falling through to undefined here would omit the exp claim entirely
        // and mint a token that never expires.
        expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRY,
    })

    // Derive the cookie lifetime from the token's own exp claim rather than
    // hardcoding one, so the two can never disagree.
    const { exp } = jwt.decode(token);

    res.cookie("jwt", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: exp * 1000 - Date.now(),
    })
    return token;
}

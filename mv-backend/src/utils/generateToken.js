import jwt from 'jsonwebtoken';

// These tokens are stateless — logout clears the cookie but cannot revoke a
// token already copied elsewhere, so this expiry is the only bound on a leaked
// one. Keep it short.
const DEFAULT_EXPIRY = '1d';

export const generateToken = (userId, res) => {
    const payload = { id: userId };
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

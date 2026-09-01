import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { users as usersTable } from "../db/schema.js";
// Read token from the request
// Check whether the token is valid
export const authMiddleware = async (req, res, next) => {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.jwt) {
        token = req.cookies.jwt;
    }

    if (!token) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Using Drizzle syntax for consistency
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, decoded.id)).limit(1);

        if (!user) {
            return res.status(401).json({ message: "Unauthorized: User not found" });
        }

        // A token minted before the account's version was bumped is revoked:
        // the password was reset, or every session was signed out. Tokens
        // issued before this claim existed decode `v` as undefined, which is
        // treated as version 0 - the default every existing row carries.
        if ((decoded.v ?? 0) !== user.tokenVersion) {
            return res.status(401).json({ message: "Unauthorized: Session expired" });
        }

        req.user = user;
        next();
    } catch (error) {
        // Detail stays server-side. Telling a caller *why* verification failed
        // ("invalid signature" vs "jwt expired") is a hint we don't owe them,
        // and there is no identity to authorise here — verification is what
        // just failed — so this can't be gated by role.
        console.error("Auth failure:", error.message);

        return res.status(401).json({
            message: "Unauthorized: Invalid or expired token",
            ...(process.env.NODE_ENV === "development" && { detail: error.message }),
        });
    }
}
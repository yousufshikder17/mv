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

        req.user = user;
        next();
    } catch (error) {
        //return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
        // This will tell you if it's "invalid signature", "jwt expired", etc.
        console.log("FULL AUTH ERROR:", error);
        return res.status(401).json({
            message: "Debug Error",
            detail: error.message
        });
    }
}
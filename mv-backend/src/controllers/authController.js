import { db } from "../config/db.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateToken } from "../utils/generateToken.js";
import bcrypt from "bcryptjs";

const register = async (req, res) => {
    const { name, email, password } = req.body;

    //Check if user already exists
    const [userexists] = await db.select().from(users).where(eq(users.email, email));

    if (userexists) {
        return res.
            status(400).
            json({ error: "User already exists with this email" });
    }

    //Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    //Create user
    const [newUser] = await db.insert(users).values({
        name,
        email,
        password: hashedPassword
    }).returning(); // Returning is required to get the id back

    //Generate JWT token
    const token = generateToken(newUser.id, res);

    res.status(201).json({
        user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
        },
        token,
    });

};

const login = async (req, res) => {
    const { email, password } = req.body;
    //check if user email exists in table
    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
        return res.
            status(401).
            json({ error: "Invalid Email or Password" });
    }
    //verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid Email or Password" });
    }

    //Generate JWT token
    const token = generateToken(user.id, res);

    res.status(201).json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
        token,
    });
};

const logout = async (req, res) => {
    res.cookie("jwt", "", {
        httpOnly: true,
        expires: new Date(0),
    });
    res.status(200).json({
        status: "sucess",
        message: "Logged out successfully",
    });
};

export { register, login, logout };
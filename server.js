import express from "express";
import cookieParser from "cookie-parser";
import { config } from "dotenv";
import path from "path";
import * as discord from "./discord.js";
import * as storage from "./storage.js";
import { MongoClient } from "mongodb";

config();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.static("public"));
app.use(express.json());

const client = new MongoClient(process.env.DATABASE_URI);
const dbName = "test"; // The database name
const collectionName = "users"; // The collection name

/**
 * Connect to MongoDB
 */
async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("✅ Connected to MongoDB");
    } catch (err) {
        console.error("❌ Error connecting to MongoDB:", err);
        throw new Error("Failed to connect to MongoDB");
    }
}

/**
 * Fetch user EXP from MongoDB
 * @param {string} userId - The ID of the user
 * @returns {number} - The user's EXP, or 0 if not found
 */
async function getUserExp(userId) {
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    try {
        const userData = await collection.findOne({ userId: userId });

        if (!userData) {
            console.warn(`⚠️ No user data found for ID: ${userId}`);
            return 0;
        }

        console.log(`📥 Loaded EXP Data for ${userId}:`, userData);
        return userData.exp ?? 0;
    } catch (e) {
        console.error(
            `❌ Error fetching user data from MongoDB for ${userId}:`,
            e
        );
        return 0;
    }
}

/**
 * Updates the Discord metadata for the user.
 * @param {string} userId - The ID of the user.
 */
async function updateMetadata(userId) {
    const tokens = await storage.getDiscordTokens(userId);
    if (!tokens) {
        console.error(`No tokens found for user ${userId}`);
        return;
    }

    try {
        const userExp = await getUserExp(userId);
        const metadata = { exp_level: String(userExp), class: true };

        console.log(`📡 Pushing metadata for ${userId}:`, metadata);
        await discord.pushMetadata(userId, tokens, metadata);

        const updatedMetadata = await discord.getMetadata(userId, tokens);
        console.log(
            `✅ Confirmed metadata on Discord for ${userId}:`,
            updatedMetadata
        );
    } catch (e) {
        console.error(`❌ Error updating metadata for ${userId}:`, e);
    }
}

app.get("/", (req, res) => res.send("👋"));

app.get("/linked-role", async (req, res) => {
    const { url, state } = discord.getOAuthUrl();
    res.cookie("clientState", state, { maxAge: 1000 * 60 * 5, signed: true });
    res.redirect(url);
});

app.get("/discord-oauth-callback", async (req, res) => {
    try {
        const code = req.query["code"];
        const discordState = req.query["state"];
        const { clientState } = req.signedCookies;

        if (clientState !== discordState) {
            console.error("State verification failed.");
            return res.sendStatus(403);
        }

        const tokens = await discord.getOAuthTokens(code);
        const meData = await discord.getUserData(tokens);
        const userId = meData.user.id;
        await storage.storeDiscordTokens(userId, {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: Date.now() + tokens.expires_in * 1000,
        });

        await updateMetadata(userId);
        res.sendFile(path.resolve(__dirname, "discord-oauth-callback.html"));
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post("/update-metadata", async (req, res) => {
    try {
        const userId = req.body.userId;
        await updateMetadata(userId);
        res.sendStatus(204);
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    // Ensure MongoDB is connected before starting the server
    connectToMongoDB().catch((err) => {
        console.error("❌ Error starting the server:", err);
        process.exit(1); // Exit if MongoDB connection fails
    });
});

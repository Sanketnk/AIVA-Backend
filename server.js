require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ---------------------------------------------
// MIDDLEWARE
// ---------------------------------------------

app.use(cors());

app.use(
    express.json({
        limit: "1mb"
    })
);

// ---------------------------------------------
// GEMINI CLIENT
// ---------------------------------------------

if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing.");
    console.error("Please add GEMINI_API_KEY to your .env file.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// ---------------------------------------------
// HOME / HEALTH CHECK
// ---------------------------------------------

app.get("/", (req, res) => {
    res.json({
        success: true,
        app: "AIVA Backend",
        status: "online",
        ai: "Gemini"
    });
});

// ---------------------------------------------
// CHAT API
// ---------------------------------------------

app.post("/api/chat", async (req, res) => {
    try {
        const message =
            typeof req.body.message === "string"
                ? req.body.message.trim()
                : "";

        const language =
            typeof req.body.language === "string"
                ? req.body.language
                : "English";

        const aiName =
            typeof req.body.aiName === "string"
                ? req.body.aiName
                : "AIVA";

        const conversation =
            Array.isArray(req.body.conversation)
                ? req.body.conversation
                : [];

        // -----------------------------------------
        // VALIDATE MESSAGE
        // -----------------------------------------

        if (!message) {
            return res.status(400).json({
                success: false,
                error: "Message is required."
            });
        }

        // -----------------------------------------
        // SAFE CONVERSATION HISTORY
        // -----------------------------------------

        const safeConversation =
            conversation
                .filter(
                    item =>
                        item &&
                        typeof item.text === "string" &&
                        typeof item.isUser === "boolean"
                )
                .slice(-20);

        // -----------------------------------------
        // SYSTEM INSTRUCTION
        // -----------------------------------------

        const systemInstruction = `
You are ${aiName}, a personal AI assistant inside an Android application called AIVA.

The user's preferred language is:
${language}

Personality:
- Friendly
- Helpful
- Natural
- Intelligent
- Warm
- Concise when appropriate
- Understand Hindi, Marathi, English and Hinglish
- Understand Indian conversational language

Important rules:
- Answer naturally like a helpful personal AI assistant.
- Follow the user's preferred language whenever possible.
- You can understand mixed Hindi, Marathi and English.
- Do not claim an Android action was completed unless the application actually performed it.
- Do not pretend to have opened an app, sent a message, made a call, changed a setting, or performed another device action when no such tool is connected.
- If a device capability is not connected yet, clearly say that it is not connected yet.
`;

        // -----------------------------------------
        // BUILD CONVERSATION
        // -----------------------------------------

        const contents = [];

        for (const item of safeConversation) {
            contents.push({
                role: item.isUser ? "user" : "model",
                parts: [
                    {
                        text: item.text
                    }
                ]
            });
        }

        // Add current user message
        contents.push({
            role: "user",
            parts: [
                {
                    text: message
                }
            ]
        });

        // -----------------------------------------
        // GEMINI REQUEST
        // -----------------------------------------

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,

            contents: contents,

            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: 700,
                temperature: 0.7
            }
        });

        const outputText =
            response.text || "";

        // -----------------------------------------
        // EMPTY RESPONSE
        // -----------------------------------------

        if (!outputText.trim()) {
            return res.status(502).json({
                success: false,
                error: "Gemini returned an empty response."
            });
        }

        // -----------------------------------------
        // SUCCESS
        // -----------------------------------------

        return res.json({
            success: true,
            response: outputText.trim()
        });

    } catch (error) {

        console.error(
            "AIVA GEMINI ERROR:",
            error?.message || error
        );

        return res.status(500).json({
            success: false,
            error: "AIVA AI service temporarily unavailable."
        });
    }
});

// ---------------------------------------------
// START SERVER
// ---------------------------------------------

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `AIVA Backend running on port ${PORT}`
        );

        console.log(
            `Gemini model: ${GEMINI_MODEL}`
        );
    }
);
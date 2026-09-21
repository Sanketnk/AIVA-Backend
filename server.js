require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

app.use(cors());

app.use(
    express.json({
        limit: "1mb"
    })
);

// --------------------------------------------------
// API KEY CHECK
// --------------------------------------------------

if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// --------------------------------------------------
// LANGUAGE HINT
// --------------------------------------------------

function detectLanguageHint(message, preferredLanguage) {
    const text = message.trim();

    // Devanagari script
    if (/[\u0900-\u097F]/.test(text)) {
        if (preferredLanguage === "Marathi") {
            return "Marathi";
        }

        if (preferredLanguage === "Hindi") {
            return "Hindi";
        }

        return "Devanagari Indian language";
    }

    const lower = text.toLowerCase();

    // Common Hinglish/Hindi words written in English
    const hinglishWords = [
        "kya",
        "kaise",
        "kaisa",
        "mujhe",
        "mera",
        "meri",
        "mere",
        "tum",
        "aap",
        "hai",
        "hain",
        "karna",
        "karo",
        "kar",
        "chahiye",
        "batao",
        "bata",
        "kyun",
        "kab",
        "kahan",
        "ka",
        "ki",
        "ke"
    ];

    const isHinglish = hinglishWords.some(word =>
        new RegExp(`\\b${word}\\b`, "i").test(lower)
    );

    if (isHinglish) {
        return "Hinglish";
    }

    // English
    if (/[a-zA-Z]/.test(text)) {
        return "English";
    }

    return preferredLanguage || "English";
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/", (req, res) => {
    res.json({
        success: true,
        app: "AIVA Backend",
        status: "online",
        ai: "Gemini",
        model: GEMINI_MODEL
    });
});

// --------------------------------------------------
// CHAT API
// --------------------------------------------------

app.post("/api/chat", async (req, res) => {
    try {
        const message =
            typeof req.body.message === "string"
                ? req.body.message.trim()
                : "";

        const preferredLanguage =
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

        if (!message) {
            return res.status(400).json({
                success: false,
                error: "Message is required."
            });
        }

        // Detect language from CURRENT question
        const languageHint =
            detectLanguageHint(
                message,
                preferredLanguage
            );

        // Keep history smaller for faster requests
        const safeConversation =
            conversation
                .filter(
                    item =>
                        item &&
                        typeof item.text === "string" &&
                        typeof item.isUser === "boolean"
                )
                .slice(-10);

        // --------------------------------------------------
        // AIVA SYSTEM INSTRUCTION
        // --------------------------------------------------

        const systemInstruction = `
You are ${aiName}, the personal AI assistant inside an Android application called AIVA.

USER PREFERRED LANGUAGE:
${preferredLanguage}

CURRENT MESSAGE LANGUAGE HINT:
${languageHint}

VERY IMPORTANT LANGUAGE RULE:

Always answer in the SAME LANGUAGE as the user's LATEST MESSAGE.

The latest user message has higher priority than the saved preferred language.

Examples:

- User asks in Hindi Devanagari → answer in Hindi Devanagari.
- User asks in Marathi Devanagari → answer in Marathi Devanagari.
- User asks in English → answer in English.
- User asks in Hinglish → answer in natural Hinglish.
- User mixes Hindi + English → answer naturally in Hinglish.
- User writes Marathi using English/Roman letters → understand Marathi and answer in natural Marathi/Roman Marathi when appropriate.
- Do NOT blindly use the preferred language if the latest message is clearly written in another language.

Do not translate the user's question unless they ask for translation.

PERSONALITY:
- Friendly
- Natural
- Helpful
- Intelligent
- Warm
- Conversational
- Concise
- Like a modern personal AI assistant

RESPONSE STYLE:
- Give the direct answer first.
- Avoid unnecessary long explanations.
- For simple questions, keep the answer short.
- For complex questions, explain clearly with useful details.
- Understand Hindi, Marathi, English and Hinglish.
- Understand normal Indian conversational language.

IMPORTANT ACTION RULE:
Do not claim that an Android action was completed unless the application actually performed that action.

For example:
- Do not say "YouTube opened" unless the app actually opened YouTube.
- Do not say "I sent the message" unless a connected tool actually sent it.
- Do not say "I made the call" unless the application actually made the call.
- Do not pretend to control the phone.

If a device capability is not connected yet, clearly say that the capability is not connected yet.

CURRENT USER MESSAGE:
${message}
`;

        // --------------------------------------------------
        // CONVERSATION
        // --------------------------------------------------

        const contents = [];

        for (const item of safeConversation) {
            contents.push({
                role: item.isUser
                    ? "user"
                    : "model",

                parts: [
                    {
                        text: item.text
                    }
                ]
            });
        }

        contents.push({
            role: "user",
            parts: [
                {
                    text: message
                }
            ]
        });

        // --------------------------------------------------
        // GEMINI REQUEST
        // --------------------------------------------------

        const response =
            await ai.models.generateContent({
                model: GEMINI_MODEL,

                contents: contents,

                config: {
                    systemInstruction:
                        systemInstruction,

                    maxOutputTokens: 400,

                    temperature: 0.6
                }
            });

        const outputText =
            response.text
                ? response.text.trim()
                : "";

        if (!outputText) {
            return res.status(502).json({
                success: false,
                error: "Gemini returned an empty response."
            });
        }

        return res.json({
            success: true,
            response: outputText
        });

    } catch (error) {

        console.error(
            "AIVA GEMINI ERROR:",
            error?.message || error
        );

        return res.status(500).json({
            success: false,
            error:
                "AIVA AI service temporarily unavailable."
        });
    }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

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
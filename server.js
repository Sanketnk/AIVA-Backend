const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.6-flash";

if (!GEMINI_API_KEY) {
    console.error(
        "GEMINI_API_KEY is missing."
    );
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

/* ---------------------------------------------------------
   SYSTEM INSTRUCTION
--------------------------------------------------------- */

const SYSTEM_INSTRUCTION = `
You are AIVA, a personal AI assistant.

Your job is to have natural, helpful and intelligent conversations
with the user.

Important rules:

1. Remember information from the conversation history provided to you.
2. If the user tells you their name, preferences, plans or other information,
   use that information later in the same conversation.
3. Do not say that information is unavailable if it is present in the
   conversation history.
4. Understand Hindi, English, Hinglish, Marathi, Roman Hindi and Roman Marathi.
5. Reply naturally in the language used by the user.
6. Do not unnecessarily repeat greetings.
7. Be concise when a short answer is enough.
8. Give detailed answers when the user asks for details.
9. You are AIVA One AI, the central intelligence of the AIVA application.
`;

/* ---------------------------------------------------------
   HOME
--------------------------------------------------------- */

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "AIVA Backend",
        model: GEMINI_MODEL
    });
});

/* ---------------------------------------------------------
   CHAT
--------------------------------------------------------- */

app.post("/api/chat", async (req, res) => {

    try {

        const {
            message,
            aiName,
            language,
            conversation
        } = req.body;

        if (
            !message ||
            typeof message !== "string"
        ) {

            return res.status(400).json({
                error: "Message is required."
            });
        }

        /*
         * Conversation history received from Android.
         */

        const history =
            Array.isArray(conversation)
                ? conversation
                : [];

        /*
         * Keep only recent messages.
         */

        const recentHistory =
            history.slice(-20);

        /*
         * Convert Android messages into
         * Gemini conversation format.
         */

        const contents =
            recentHistory
                .filter(item =>
                    item &&
                    typeof item.content === "string" &&
                    item.content.trim().length > 0
                )
                .map(item => {

                    return {
                        role:
                            item.role === "assistant"
                                ? "model"
                                : "user",

                        parts: [
                            {
                                text:
                                    item.content.trim()
                            }
                        ]
                    };
                });

        /*
         * Safety check:
         *
         * MainActivity already sends the current user
         * message inside conversation.
         *
         * If it is missing for any reason, add it.
         */

        const lastMessage =
            contents.length > 0
                ? contents[contents.length - 1]
                : null;

        const currentMessageAlreadyPresent =
            lastMessage &&
            lastMessage.role === "user" &&
            lastMessage.parts &&
            lastMessage.parts[0] &&
            lastMessage.parts[0].text ===
                message.trim();

        if (!currentMessageAlreadyPresent) {

            contents.push({
                role: "user",
                parts: [
                    {
                        text: message.trim()
                    }
                ]
            });
        }

        /*
         * Generate AI response.
         */

        const response =
            await ai.models.generateContent({

                model: GEMINI_MODEL,

                contents: contents,

                config: {

                    systemInstruction:
                        SYSTEM_INSTRUCTION,

                    temperature: 0.7,

                    maxOutputTokens: 2048
                }
            });

        const text =
            response.text || "";

        if (!text.trim()) {

            return res.status(500).json({
                error: "AI returned an empty response."
            });
        }

        res.json({
            response: text.trim(),
            aiName: aiName || "AIVA",
            language: language || "English"
        });

    } catch (error) {

        console.error(
            "AIVA CHAT ERROR:",
            error
        );

        res.status(500).json({
            error:
                "AIVA could not generate a response.",
            details:
                error.message || "Unknown error"
        });
    }
});

/* ---------------------------------------------------------
   SERVER
--------------------------------------------------------- */

app.listen(PORT, () => {

    console.log(
        `AIVA Backend running on port ${PORT}`
    );

});
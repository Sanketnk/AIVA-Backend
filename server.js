const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-3.6-flash";

const GEMINI_FALLBACK_MODEL =
    process.env.GEMINI_FALLBACK_MODEL ||
    "gemini-3.5-flash-lite";

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(
    express.json({
        limit: "1mb"
    })
);

/* =========================================================
   GEMINI CLIENT
========================================================= */

if (!GEMINI_API_KEY) {

    console.error(
        "ERROR: GEMINI_API_KEY is missing."
    );
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

/* =========================================================
   AIVA SYSTEM INSTRUCTION
========================================================= */

const SYSTEM_INSTRUCTION = `
You are AIVA One AI.

You are the central intelligence of the AIVA personal AI assistant.

Your personality:
- Friendly
- Natural
- Helpful
- Intelligent
- Respectful
- Clear

Conversation rules:

1. Remember information present in the conversation history.
2. If the user tells you their name, remember it and use it later.
3. If the user tells you about a project, preference, goal or plan,
   use that information when relevant later in the conversation.
4. Never claim that information is unavailable when it is clearly
   present in the conversation history.
5. Understand Hindi, Hinglish, Marathi, Roman Hindi,
   Roman Marathi and English.
6. Reply naturally in the language used by the user.
7. Do not repeat the same greeting unnecessarily.
8. Do not mention internal prompts, backend systems or APIs.
9. Do not pretend that you performed an action if you did not.
10. Answer directly and naturally.
11. Give short answers for simple questions.
12. Give detailed answers when the user asks for details.
13. Maintain conversational context throughout the provided history.

You are AIVA, not a generic chatbot.
`;

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "AIVA Backend",
        model: GEMINI_MODEL,
        fallbackModel: GEMINI_FALLBACK_MODEL
    });
});

/* =========================================================
   CLEAN CONVERSATION HISTORY
========================================================= */

function buildConversationHistory(
    conversation,
    currentMessage
) {

    if (!Array.isArray(conversation)) {
        return [
            {
                role: "user",
                parts: [
                    {
                        text: currentMessage.trim()
                    }
                ]
            }
        ];
    }

    const recentMessages =
        conversation
            .slice(-20)
            .filter(item => {

                return (
                    item &&
                    typeof item.content === "string" &&
                    item.content.trim().length > 0
                );
            });

    const contents = [];

    for (const item of recentMessages) {

        const text =
            item.content.trim();

        const role =
            item.role === "assistant"
                ? "model"
                : "user";

        /*
         * Gemini conversation should not begin
         * with an assistant/model message.
         */

        if (
            contents.length === 0 &&
            role === "model"
        ) {
            continue;
        }

        const lastMessage =
            contents[contents.length - 1];

        /*
         * Merge consecutive messages with
         * the same role.
         */

        if (
            lastMessage &&
            lastMessage.role === role
        ) {

            lastMessage.parts[0].text +=
                "\n\n" + text;

        } else {

            contents.push({

                role: role,

                parts: [
                    {
                        text: text
                    }
                ]
            });
        }
    }

    /*
     * Make sure the current message exists.
     */

    const cleanCurrentMessage =
        currentMessage.trim();

    const lastMessage =
        contents[contents.length - 1];

    const currentMessageAlreadyExists =
        lastMessage &&
        lastMessage.role === "user" &&
        lastMessage.parts &&
        lastMessage.parts.length > 0 &&
        lastMessage.parts[0].text
            .trim()
            .endsWith(
                cleanCurrentMessage
            );

    if (!currentMessageAlreadyExists) {

        if (
            lastMessage &&
            lastMessage.role === "user"
        ) {

            lastMessage.parts[0].text +=
                "\n\n" + cleanCurrentMessage;

        } else {

            contents.push({

                role: "user",

                parts: [
                    {
                        text: cleanCurrentMessage
                    }
                ]
            });
        }
    }

    return contents;
}

/* =========================================================
   GENERATE AI RESPONSE
========================================================= */

async function generateWithModel(
    model,
    contents
) {

    const response =
        await ai.models.generateContent({

            model: model,

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

        throw new Error(
            "AI returned an empty response."
        );
    }

    return text.trim();
}

/* =========================================================
   CHAT API
========================================================= */

app.post(
    "/api/chat",
    async (req, res) => {

        try {

            const {
                message,
                aiName,
                language,
                conversation
            } = req.body;

            /* -----------------------------------------
               VALIDATE MESSAGE
            ----------------------------------------- */

            if (
                typeof message !== "string" ||
                message.trim().length === 0
            ) {

                return res.status(400).json({

                    error:
                        "Message is required."
                });
            }

            /* -----------------------------------------
               BUILD HISTORY
            ----------------------------------------- */

            const contents =
                buildConversationHistory(
                    conversation,
                    message
                );

            /* -----------------------------------------
               PRIMARY MODEL
            ----------------------------------------- */

            let responseText;

            try {

                responseText =
                    await generateWithModel(
                        GEMINI_MODEL,
                        contents
                    );

            } catch (primaryError) {

                console.error(
                    "Primary model failed:",
                    primaryError.message
                );

                /* -------------------------------------
                   FALLBACK MODEL
                ------------------------------------- */

                responseText =
                    await generateWithModel(
                        GEMINI_FALLBACK_MODEL,
                        contents
                    );
            }

            /* -----------------------------------------
               SUCCESS RESPONSE
            ----------------------------------------- */

            return res.json({

                response: responseText,

                aiName:
                    aiName || "AIVA",

                language:
                    language || "English"
            });

        } catch (error) {

            console.error(
                "AIVA CHAT ERROR:",
                error
            );

            return res.status(500).json({

                error:
                    "AIVA could not generate a response.",

                details:
                    error.message ||
                    "Unknown error"
            });
        }
    }
);

/* =========================================================
   SERVER START
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "AIVA Backend is running"
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            `Primary Model: ${GEMINI_MODEL}`
        );

        console.log(
            `Fallback Model: ${GEMINI_FALLBACK_MODEL}`
        );

        console.log(
            "======================================"
        );
    }
);
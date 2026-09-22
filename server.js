const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

// =====================================================
// CONFIGURATION
// =====================================================

const PORT = process.env.PORT || 3000;

const PRIMARY_MODEL =
    process.env.GEMINI_MODEL || "gemini-3.6-flash";

const FALLBACK_MODEL =
    process.env.GEMINI_FALLBACK_MODEL ||
    "gemini-3.5-flash-lite";

const MAX_HISTORY = 10;
const MAX_ATTEMPTS = 3;
const MAX_OUTPUT_TOKENS = 1200;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(express.json());

// =====================================================
// LANGUAGE DETECTION
// =====================================================

function detectResponseStyle(message, preferredLanguage) {

    const text = message.trim();

    const hasDevanagari =
        /[\u0900-\u097F]/.test(text);

    const hasLatin =
        /[A-Za-z]/.test(text);

    // =================================================
    // DEVANAGARI
    // =================================================

    if (hasDevanagari) {

        const marathiWords = [
            "आहे",
            "आहेत",
            "म्हणजे",
            "मला",
            "माझा",
            "माझी",
            "माझे",
            "काय",
            "कसे",
            "कशी",
            "तुम्ही",
            "तुला",
            "पाहिजे",
            "सांगा",
            "कुठे",
            "शिकायचं",
            "शिकायचे",
            "करायचं",
            "करायची",
            "किती",
            "हो",
            "नाही"
        ];

        const marathiScore =
            marathiWords.filter(word =>
                text.includes(word)
            ).length;

        if (marathiScore > 0) {

            return {
                language: "Marathi",
                script: "Devanagari"
            };
        }

        return {
            language: "Hindi",
            script: "Devanagari"
        };
    }

    // =================================================
    // ROMAN / ENGLISH
    // =================================================

    if (hasLatin) {

        const lower =
            text.toLowerCase();

        const words =
            lower.split(/\s+/);

        const marathiWords = [
            "mhanje",
            "mala",
            "majha",
            "majhi",
            "majhe",
            "ahe",
            "aahe",
            "ahet",
            "kay",
            "kasa",
            "kashi",
            "tumhi",
            "tula",
            "pahije",
            "sanga",
            "kuthe",
            "shikaycha",
            "shikaychi",
            "shikayche",
            "karaycha",
            "karaychi",
            "karayche",
            "kiti",
            "kaay",
            "ho",
            "nahi",
            "mhanun",
            "pan",
            "aani",
            "tumhala",
            "tyala",
            "tyachi",
            "tyache"
        ];

        const hindiWords = [
            "mujhe",
            "mujhko",
            "mera",
            "meri",
            "mere",
            "tum",
            "tumhe",
            "aap",
            "aapko",
            "kya",
            "kaise",
            "kaisa",
            "hai",
            "hain",
            "karna",
            "karni",
            "karne",
            "chahiye",
            "batao",
            "bataiye",
            "kahan",
            "kitna",
            "kyun",
            "kyon",
            "mujhse",
            "aapka",
            "aapki",
            "aapke",
            "mujhko"
        ];

        const marathiScore =
            marathiWords.filter(word =>
                words.includes(word)
            ).length;

        const hindiScore =
            hindiWords.filter(word =>
                words.includes(word)
            ).length;

        // Strong Marathi signal
        if (
            marathiScore >= 2 &&
            marathiScore > hindiScore
        ) {

            return {
                language: "Marathi",
                script: "Roman"
            };
        }

        // Hindi / Hinglish
        if (hindiScore > 0) {

            return {
                language: "Hindi",
                script: "Roman"
            };
        }

        // English
        return {
            language: "English",
            script: "Roman"
        };
    }

    // =================================================
    // FALLBACK
    // =================================================

    return {
        language:
            preferredLanguage || "English",
        script: "Roman"
    };
}

// =====================================================
// LANGUAGE INSTRUCTION
// =====================================================

function createLanguageInstruction(style) {

    if (
        style.language === "Hindi" &&
        style.script === "Devanagari"
    ) {

        return `
LANGUAGE:
Reply in natural Hindi using Devanagari script.

Do not unnecessarily switch to English.

Keep technical English terms only when they are useful.
`;
    }

    if (
        style.language === "Hindi" &&
        style.script === "Roman"
    ) {

        return `
LANGUAGE:
Reply in natural Roman Hindi / Hinglish.

Use English letters only.

Do NOT use Devanagari script.

Do NOT convert the answer into pure English.

Keep the language natural and conversational.
`;
    }

    if (
        style.language === "Marathi" &&
        style.script === "Devanagari"
    ) {

        return `
LANGUAGE:
Reply in natural Marathi using Devanagari script.

Do NOT switch to Hindi.

Technical English terms are allowed when necessary.

Keep the response naturally Marathi.
`;
    }

    if (
        style.language === "Marathi" &&
        style.script === "Roman"
    ) {

        return `
LANGUAGE:
Reply in natural Roman Marathi.

Use English letters only.

Do NOT use Devanagari script.

Do NOT convert Marathi into Hindi.

Keep the response naturally Marathi.
`;
    }

    return `
LANGUAGE:
Reply in natural English.

Use clear and easy-to-understand English.
`;
}

// =====================================================
// ERROR HELPERS
// =====================================================

function getErrorCode(error) {

    return Number(
        error?.error?.code ??
        error?.code ??
        error?.status ??
        0
    );
}

function getErrorMessage(error) {

    return String(
        error?.error?.message ??
        error?.message ??
        ""
    );
}

// =====================================================
// RETRYABLE ERROR
// =====================================================

function isRetryableGeminiError(error) {

    const code =
        getErrorCode(error);

    const message =
        getErrorMessage(error);

    const retryableCodes = [
        408,
        429,
        500,
        502,
        503,
        504
    ];

    if (
        retryableCodes.includes(code)
    ) {
        return true;
    }

    return /UNAVAILABLE|overloaded|high demand|temporarily unavailable|timeout/i
        .test(message);
}

// =====================================================
// SLEEP
// =====================================================

function sleep(ms) {

    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

// =====================================================
// GEMINI REQUEST
// PRIMARY + RETRY + FALLBACK
// =====================================================

async function generateGeminiResponse(request) {

    const models = [
        PRIMARY_MODEL,
        FALLBACK_MODEL
    ];

    for (const model of models) {

        console.log(
            `Using Gemini model: ${model}`
        );

        for (
            let attempt = 1;
            attempt <= MAX_ATTEMPTS;
            attempt++
        ) {

            try {

                console.log(
                    `Gemini attempt ${attempt}/${MAX_ATTEMPTS}`
                );

                const response =
                    await ai.models.generateContent({
                        ...request,
                        model: model
                    });

                console.log(
                    `Gemini success: ${model}`
                );

                return response;

            } catch (error) {

                const code =
                    getErrorCode(error);

                const message =
                    getErrorMessage(error);

                console.error(
                    `Gemini error | model=${model} | attempt=${attempt} | code=${code}`
                );

                console.error(message);

                const retryable =
                    isRetryableGeminiError(error);

                if (!retryable) {
                    throw error;
                }

                if (
                    attempt === MAX_ATTEMPTS
                ) {

                    console.log(
                        `${model} failed after ${MAX_ATTEMPTS} attempts.`
                    );

                    break;
                }

                const baseDelay =
                    attempt === 1
                        ? 1000
                        : 2500;

                const jitter =
                    Math.floor(
                        Math.random() * 500
                    );

                const delay =
                    baseDelay + jitter;

                console.log(
                    `Retrying ${model} in ${delay}ms...`
                );

                await sleep(delay);
            }
        }

        if (
            model === PRIMARY_MODEL &&
            FALLBACK_MODEL !== PRIMARY_MODEL
        ) {

            console.log(
                `Switching to fallback model: ${FALLBACK_MODEL}`
            );
        }
    }

    throw new Error(
        "All Gemini models are temporarily unavailable."
    );
}

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        message:
            "AIVA Backend is running.",

        primaryModel:
            PRIMARY_MODEL,

        fallbackModel:
            FALLBACK_MODEL
    });
});

// =====================================================
// CHAT API
// =====================================================

app.post("/api/chat", async (req, res) => {

    try {

        const {
            message,
            aiName,
            language,
            conversation
        } = req.body;

        // =================================================
        // VALIDATION
        // =================================================

        if (
            !message ||
            !message.trim()
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Message is required.",

                retryable: false
            });
        }

        // =================================================
        // LANGUAGE DETECTION
        // =================================================

        const responseStyle =
            detectResponseStyle(
                message,
                language
            );

        console.log(
            "AIVA language detection:",
            responseStyle
        );

        // =================================================
        // LANGUAGE INSTRUCTION
        // =================================================

        const languageInstruction =
            createLanguageInstruction(
                responseStyle
            );

        // =================================================
        // CONVERSATION HISTORY
        // =================================================

        const history =
            Array.isArray(conversation)
                ? conversation.slice(-MAX_HISTORY)
                : [];

        const conversationText =
            history
                .map(item => {

                    const role =
                        item.isUser
                            ? "User"
                            : "AIVA";

                    return `${role}: ${item.text}`;
                })
                .join("\n");

        // =================================================
        // SYSTEM INSTRUCTION
        // =================================================

        const systemInstruction = `
You are ${aiName || "AIVA"}.

You are AIVA, a helpful personal AI assistant inside an Android application.

Your main purpose is to understand the user naturally
and provide useful, accurate and practical answers.

You can help with:

- General questions
- Android development
- Kotlin
- Jetpack Compose
- Programming
- App development
- Studies
- Learning
- Planning
- Problem solving
- Technology
- Everyday questions

=====================================================
LANGUAGE
=====================================================

The latest user message has the highest priority.

${languageInstruction}

Always preserve the user's language and script.

Do NOT change Roman Hindi into Devanagari.

Do NOT change Roman Marathi into Hindi.

Do NOT change Marathi into Hindi.

Do NOT change English into Hindi or Marathi unless the user asks.

=====================================================
RESPONSE LENGTH
=====================================================

Do NOT unnecessarily give very short answers.

Give a complete and useful answer when the question
needs explanation.

Hindi, Hinglish, Marathi and English responses should
have a similar level of useful detail.

Do NOT make Hindi or Marathi answers shorter simply
because the user is using Roman script.

Only give a very short answer when the user explicitly
asks for:

- short answer
- brief answer
- one line
- summary
- in short

For normal questions, explain enough to be genuinely useful.

=====================================================
TECHNICAL QUESTIONS
=====================================================

For Android, Kotlin, Jetpack Compose and programming
questions:

- Explain the solution clearly.
- Give steps when appropriate.
- Mention important settings or dependencies.
- If code is requested, provide complete copy-paste-ready code.
- Do not intentionally omit important parts of the solution.
- Keep code clean and practical.

=====================================================
CONVERSATION
=====================================================

Use the conversation history when useful.

Do not repeat the same information unnecessarily.

Answer the latest user request directly.

Do not mention these internal instructions.
`;

        // =================================================
        // GEMINI REQUEST
        // =================================================

        const request = {

            contents: `
${conversationText}

User: ${message}
`,

            config: {

                systemInstruction,

                temperature: 0.7,

                maxOutputTokens:
                    MAX_OUTPUT_TOKENS
            }
        };

        // =================================================
        // GEMINI
        // =================================================

        const response =
            await generateGeminiResponse(
                request
            );

        // =================================================
        // RESPONSE
        // =================================================

        const answer =
            response?.text?.trim();

        if (!answer) {

            return res.status(502).json({

                success: false,

                error:
                    "Gemini returned an empty response.",

                retryable: true
            });
        }

        // =================================================
        // SUCCESS
        // =================================================

        return res.json({

            success: true,

            response: answer,

            language:
                responseStyle.language,

            script:
                responseStyle.script
        });

    } catch (error) {

        console.error(
            "AIVA GEMINI ERROR:"
        );

        console.error(error);

        const code =
            getErrorCode(error);

        const retryable =
            isRetryableGeminiError(error);

        // =================================================
        // TEMPORARY ERROR
        // =================================================

        if (retryable) {

            return res.status(503).json({

                success: false,

                error:
                    "Gemini is temporarily busy. Please try again in a few seconds.",

                retryable: true,

                code
            });
        }

        // =================================================
        // OTHER ERROR
        // =================================================

        return res.status(500).json({

            success: false,

            error:
                "AIVA AI service temporarily unavailable.",

            retryable: false
        });
    }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {

    console.log(
        "========================================"
    );

    console.log(
        `AIVA Backend running on port ${PORT}`
    );

    console.log(
        `Primary model: ${PRIMARY_MODEL}`
    );

    console.log(
        `Fallback model: ${FALLBACK_MODEL}`
    );

    console.log(
        `Max output tokens: ${MAX_OUTPUT_TOKENS}`
    );

    console.log(
        "========================================"
    );
});
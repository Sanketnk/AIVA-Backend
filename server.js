require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL =
    process.env.GEMINI_MODEL || "gemini-3.6-flash";


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

app.use(
    express.json({
        limit: "1mb"
    })
);


// ============================================================
// GEMINI API CHECK
// ============================================================

if (!process.env.GEMINI_API_KEY) {
    console.error(
        "ERROR: GEMINI_API_KEY is missing."
    );

    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});


// ============================================================
// LANGUAGE DETECTION
// ============================================================

function detectResponseStyle(
    message,
    preferredLanguage
) {

    const text =
        message
            .trim()
            .toLowerCase();

    // --------------------------------------------------------
    // Empty message
    // --------------------------------------------------------

    if (!text) {
        return {
            language: preferredLanguage || "English",
            script: "default"
        };
    }


    // --------------------------------------------------------
    // Devanagari
    // --------------------------------------------------------

    if (/[\u0900-\u097F]/.test(text)) {

        // Strong Marathi words
        const marathiWords = [
            "आहे",
            "आहेत",
            "म्हणजे",
            "काय",
            "मला",
            "माझे",
            "माझा",
            "माझी",
            "तुम्ही",
            "तू",
            "कसे",
            "कशी",
            "कसा",
            "करायचे",
            "करायचं",
            "पाहिजे",
            "हवे",
            "सांगा",
            "कुठे",
            "का"
        ];

        const hasMarathiWords =
            marathiWords.some(word =>
                text.includes(word)
            );

        if (hasMarathiWords) {
            return {
                language: "Marathi",
                script: "Devanagari"
            };
        }


        // Hindi
        return {
            language: "Hindi",
            script: "Devanagari"
        };
    }


    // --------------------------------------------------------
    // Roman Marathi detection
    // --------------------------------------------------------

    const marathiRomanWords = [
        "mhanje",
        "mala",
        "majha",
        "majhi",
        "majhe",
        "mala",
        "ahe",
        "aahe",
        "ahet",
        "kay",
        "kasa",
        "kashi",
        "kase",
        "tumhi",
        "tula",
        "tujha",
        "tujhi",
        "karaycha",
        "karaychi",
        "karayche",
        "karaych",
        "pahije",
        "havay",
        "hava",
        "havi",
        "sanga",
        "sang",
        "kuthe",
        "kadhi",
        "ka",
        "shikaycha",
        "shikaychi",
        "shikav",
        "banvaycha",
        "banvaychi",
        "karu",
        "karto",
        "karte",
        "kartoy",
        "kartes",
        "aapan"
    ];


    const hindiRomanWords = [
        "mujhe",
        "mujhko",
        "mera",
        "meri",
        "mere",
        "mujhse",
        "tum",
        "tumhara",
        "tumhari",
        "aap",
        "aapka",
        "aapki",
        "kya",
        "kaise",
        "kaisa",
        "kaisi",
        "hai",
        "hain",
        "tha",
        "thi",
        "the",
        "karna",
        "karni",
        "karne",
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
        "ke",
        "mera",
        "mujhe",
        "sakta",
        "sakti",
        "sakte"
    ];


    const words =
        text
            .replace(
                /[^a-zA-Z\s]/g,
                " "
            )
            .split(/\s+/)
            .filter(Boolean);


    let marathiScore = 0;
    let hindiScore = 0;


    for (const word of words) {

        if (marathiRomanWords.includes(word)) {
            marathiScore++;
        }

        if (hindiRomanWords.includes(word)) {
            hindiScore++;
        }
    }


    // --------------------------------------------------------
    // Roman Marathi
    // --------------------------------------------------------

    if (marathiScore >= 2 &&
        marathiScore > hindiScore) {

        return {
            language: "Marathi",
            script: "Roman"
        };
    }


    // Strong Marathi single-word signals
    if (
        words.includes("mhanje") ||
        words.includes("ahe") ||
        words.includes("aahe") ||
        words.includes("ahet") ||
        words.includes("tumhi") ||
        words.includes("majha") ||
        words.includes("majhi") ||
        words.includes("mala") &&
        words.includes("kay")
    ) {

        if (marathiScore >= hindiScore) {

            return {
                language: "Marathi",
                script: "Roman"
            };
        }
    }


    // --------------------------------------------------------
    // Roman Hindi / Hinglish
    // --------------------------------------------------------

    if (hindiScore > 0) {

        return {
            language: "Hindi",
            script: "Roman"
        };
    }


    // --------------------------------------------------------
    // English
    // --------------------------------------------------------

    if (/[a-zA-Z]/.test(text)) {

        return {
            language: "English",
            script: "Latin"
        };
    }


    // --------------------------------------------------------
    // Preferred language fallback
    // --------------------------------------------------------

    return {
        language:
            preferredLanguage || "English",

        script: "default"
    };
}


// ============================================================
// LANGUAGE INSTRUCTION
// ============================================================

function createLanguageInstruction(
    style
) {

    if (
        style.language === "Hindi" &&
        style.script === "Devanagari"
    ) {

        return `
The user is writing Hindi in Devanagari script.

Answer in natural Hindi using Devanagari script.

Do NOT convert the answer to Roman Hindi.
Do NOT answer in Marathi.
Do NOT answer in English unless a technical term naturally needs English.
`;
    }


    if (
        style.language === "Hindi" &&
        style.script === "Roman"
    ) {

        return `
The user is writing Hindi/Hinglish using Roman/English letters.

Answer in NATURAL ROMAN HINDI / HINGLISH.

IMPORTANT:
- Use English letters.
- Do NOT switch to Devanagari Hindi.
- Do NOT suddenly answer in Marathi.
- English technical words are allowed naturally.
- Keep the same casual conversational style.

Example:

User:
"Mujhe Android app banana hai"

Good:
"Bilkul, main tumhe Android app step-by-step banana sikha sakti hoon."

Bad:
"बिल्कुल, मैं आपको Android app..."
`;
    }


    if (
        style.language === "Marathi" &&
        style.script === "Devanagari"
    ) {

        return `
The user is writing Marathi in Devanagari script.

Answer in natural Marathi using Devanagari script.

Do NOT switch to Hindi.
Do NOT convert Marathi into Roman script.
Use English technical terms only when naturally useful.
`;
    }


    if (
        style.language === "Marathi" &&
        style.script === "Roman"
    ) {

        return `
The user is writing Marathi using Roman/English letters.

Answer in NATURAL ROMAN MARATHI.

IMPORTANT:
- Use English/Roman letters.
- Do NOT switch to Devanagari Marathi.
- Do NOT switch to Hindi.
- Do NOT use Roman Hindi.
- Preserve Marathi vocabulary and sentence structure.

Example:

User:
"AI mhanje kay?"

Good:
"AI mhanje Artificial Intelligence. Hi ek technology aahe ji machines na data samjun..."

Bad:
"AI kya hai?"
`;
    }


    return `
The user is writing English.

Answer in natural English.

Do not unnecessarily translate the answer into Hindi or Marathi.
`;
}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        app: "AIVA Backend",

        status: "online",

        ai: "Gemini",

        model: GEMINI_MODEL

    });
});


// ============================================================
// CHAT API
// ============================================================

app.post(
    "/api/chat",
    async (req, res) => {

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
                Array.isArray(
                    req.body.conversation
                )
                    ? req.body.conversation
                    : [];


            // ------------------------------------------------
            // Validate message
            // ------------------------------------------------

            if (!message) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Message is required."

                });
            }


            // ------------------------------------------------
            // Detect CURRENT message language
            // ------------------------------------------------

            const responseStyle =
                detectResponseStyle(
                    message,
                    preferredLanguage
                );


            const languageInstruction =
                createLanguageInstruction(
                    responseStyle
                );


            console.log(
                "AIVA language detection:",
                responseStyle
            );


            // ------------------------------------------------
            // Conversation history
            // ------------------------------------------------

            const safeConversation =
                conversation
                    .filter(
                        item =>
                            item &&
                            typeof item.text ===
                                "string" &&
                            typeof item.isUser ===
                                "boolean"
                    )
                    .slice(-10);


            // ------------------------------------------------
            // System instruction
            // ------------------------------------------------

            const systemInstruction = `

You are ${aiName}, the personal AI assistant
inside an Android application called AIVA.

==================================================
CURRENT USER LANGUAGE
==================================================

${responseStyle.language}

CURRENT SCRIPT:
${responseStyle.script}

USER PREFERRED LANGUAGE:
${preferredLanguage}

==================================================
MOST IMPORTANT LANGUAGE RULE
==================================================

The user's LATEST MESSAGE has the highest priority.

Always answer in the same language AND writing style
used by the latest user message.

Never blindly follow the saved preferred language.

${languageInstruction}

==================================================
IMPORTANT
==================================================

If the user writes Hindi using English/Roman letters,
reply using English/Roman letters.

If the user writes Marathi using English/Roman letters,
reply using English/Roman letters.

Do NOT automatically convert Roman Hindi/Hinglish
into Devanagari.

Do NOT automatically convert Roman Marathi
into Devanagari.

Preserve the user's conversational style.

==================================================
PERSONALITY
==================================================

- Friendly
- Natural
- Helpful
- Intelligent
- Warm
- Conversational
- Personal AI assistant
- Understand Indian conversational language
- Understand Hindi, Marathi, English and Hinglish

==================================================
RESPONSE LENGTH
==================================================

For simple questions:
Give a short and useful answer.

For normal questions:
Give a clear explanation.

For complex questions:
Give structured details.

Avoid unnecessary repetition.

==================================================
ANDROID ACTION SAFETY
==================================================

Do not claim an Android action was completed
unless the application actually performed it.

Do not pretend to:

- Open an app
- Send a message
- Make a call
- Change a phone setting
- Lock/unlock the device
- Play music
- Create a reminder

unless an actual connected tool performed that action.

==================================================
CURRENT USER MESSAGE
==================================================

${message}

`;


            // ------------------------------------------------
            // Gemini conversation
            // ------------------------------------------------

            const contents = [];


            for (
                const item
                of safeConversation
            ) {

                contents.push({

                    role:
                        item.isUser
                            ? "user"
                            : "model",

                    parts: [
                        {
                            text: item.text
                        }
                    ]

                });
            }


            // Current message

            contents.push({

                role: "user",

                parts: [
                    {
                        text: message
                    }
                ]

            });


            // ------------------------------------------------
            // Gemini request
            // ------------------------------------------------

            const response =
                await ai.models.generateContent({

                    model: GEMINI_MODEL,

                    contents: contents,

                    config: {

                        systemInstruction:
                            systemInstruction,

                        maxOutputTokens: 500,

                        temperature: 0.5

                    }

                });


            // ------------------------------------------------
            // Response
            // ------------------------------------------------

            const outputText =
                response.text
                    ? response.text.trim()
                    : "";


            if (!outputText) {

                return res.status(502).json({

                    success: false,

                    error:
                        "Gemini returned an empty response."

                });
            }


            return res.json({

                success: true,

                response:
                    outputText

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
    }
);


// ============================================================
// START SERVER
// ============================================================

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
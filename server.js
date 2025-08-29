const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

dotenv.config();

// --- Define the Express app instance here, before any other app.* calls ---
const app = express();

// --- Trust proxy to fix rate-limit X-Forwarded-For issue ---
app.set('trust proxy', 1);

// --- Session storage ---
const sessions = new Map(); // { sessionId: [{role, content}, ...] }

// --- Allowed OpenRouter models only ---
const allowedModels = [
    'qwen/qwen-2.5-coder-32b-instruct:free',
    'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'mistralai/mistral-7b-instruct',
    'google/gemma-2-9b-it:free',
    'deepseek/deepseek-r1-0528:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'tngtech/deepseek-r1t-chimera:free'
];

// --- Load chunks.json ---
let chunks = [];
try {
    const rawChunks = fs.readFileSync('./chunks.json', 'utf8');
    chunks = JSON.parse(rawChunks).chunks; // Get the chunks array from the JSON object
    console.log(`✅ Loaded ${chunks.length} chunks from chunks.json`);
} catch (err) {
    console.error("⚠️ Could not load chunks.json:", err.message);
}


// --- CORS & JSON ---
app.use(cors());
app.use(express.json());

// --- Rate limiting ---
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
}));

// --- Serve frontend ---
app.use(express.static('public'));

// --- Chat endpoint ---
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, model, sessionId } = req.body;
        if (!prompt || !model || !sessionId)
            return res.status(400).json({ error: 'Prompt, model, and sessionId are required' });
        if (!allowedModels.includes(model))
            return res.status(400).json({ error: 'Invalid model selected' });

        const sanitizedPrompt = prompt.trim().slice(0, 2000);
        if (!sanitizedPrompt)
            return res.status(400).json({ error: 'Prompt is empty after sanitization' });

        // --- RAG: Find relevant chunks based on a simple keyword search ---
        const relevantChunks = chunks
            .filter(chunk => chunk.toLowerCase().includes(sanitizedPrompt.toLowerCase()))
            .slice(0, 3); // Get top 3 relevant chunks

        const context = relevantChunks.length > 0
            ? relevantChunks.join('\n\n')
            : "No relevant information found in the knowledge base.";

        // --- Prepare the system message with the retrieved context ---
        const systemMessageContent = `
You are a professional medical adviser whose primary goal is to help patients understand their potential health issues. Your tone is supportive, clear, and reassuring. You have a kind, motherly bedside manner.

Your task is to conduct a conversation with the user to gather symptom information and provide general guidance.

Instructions for conversation flow:
1.  Always start by asking a broad question to understand the user's primary complaint (e.g., "What symptoms are you experiencing today?").
2.  After the user replies, you will use the provided text below to ask relevant follow-up questions to narrow down the possible causes.
3.  If the provided text does not contain relevant information, ask the user to provide more details about their symptoms.
4.  Never provide a definitive diagnosis or recommend specific treatments.
5.  Once you have gathered sufficient information, synthesize a summary of the possible conditions from the provided text and gently advise the user to consult a human doctor for a proper diagnosis.

Provided text (your knowledge base):
${context}

Here are your key directives:
    1.  Do not diagnose any medical conditions.
    2.  Do not recommend specific treatments, medications, or dosages.
    3.  Always provide a disclaimer at the end of your response stating that you are not a substitute for professional medical advice.
    4.  Encourage the user to consult with a qualified healthcare professional for a proper diagnosis and treatment plan.
`;

        // Initialize session with the dynamic system message
        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, [{
                role: 'system',
                content: systemMessageContent
            }]);
        }
        const history = sessions.get(sessionId);

        // Add user message
        history.push({ role: 'user', content: sanitizedPrompt });

        // Send request to OpenRouter
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: model,
                messages: history
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'X-Title': 'ALICE BOT'
                }
            }
        );

        const aiReply = response.data.choices[0].message.content;
        history.push({ role: 'assistant', content: aiReply });

        res.json({ choices: [{ message: { content: aiReply } }] });

    } catch (error) {
        console.error('Server Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data?.error?.message || error.message });
    }
});

// --- Reset endpoint ---
app.post('/api/reset', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId && sessions.has(sessionId)) {
        sessions.delete(sessionId);
        res.json({ message: 'Session reset' });
    } else {
        res.status(400).json({ error: 'Invalid sessionId' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

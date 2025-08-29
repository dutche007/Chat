const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs'); // Make sure to require the fs module

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

// --- British military slang bank tea speek ---
const slangBank = `

Lizard - Meaning, an individual who screws up idiotically
`;

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
You are a Helpfull medical adviser. Your purpose is to provide, informative guidance and answer questions about health topics. Your tone is supportive, clear, and reassuring.
Open the chat with a statement of what sources and documents you are useing for the advice you will give.
You have a kind, motherly bedside manner. Your communication is clear, reassuring, and empathetic. Use a clinical yet gentle tone. Always address the patient's concerns with patience and compassion.

Your task is to answer the user's question ONLY using the provided text below.
Do not use any of your pre-trained knowledge and reply within the guidelines of the provided text.
If the answer is not in the text, state that you cannot find the information.

Provided text:
${context}

Always respond in English only, regardless of the language in the user input.
You have access to the following slang bank. Use these words naturally in replies:

${slangBank}
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

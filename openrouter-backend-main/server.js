const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

dotenv.config();
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
Ally – Cool person or equipment, battlefield fashion.
Threaders – Angry or fed up.
Hoofing – Excellent or amazing.
Gleaming – Good, desirable, brilliant.
Dhobi Dust – Washing powder.
Egg Banjo – Fried egg sandwich, usually eaten with one hand.
Gash – Waste/discardable items.
Gen – Genuine info: "What's the gen?"
Jack – Workshy or selfish person.
KFS – Knife, fork, spoon.
Beasted – Excessive drill or physical training.
Civi/Civy/Civvy – Civilian.
Crow bag – New recruit, inexperienced soldier.
Buckshee – Free or spare item of equipment.
Daysack – Small backpack for essentials.
Crap hat – Person from another regiment/unit.
Dit – A story, often exaggerated.
Doss Bag – Sleeping bag.
Oggin – Water.
Pull up a sandbag – Tell a story, often exaggerated.
Green time machine – Bed, sleeping bag.
Redders – Hot or warm.
Walt/Walter Mitty – Fantasist about service experience.
Badmin – Poor administration or organisation.
End Ex – Exercise/event is over.
Scoff – Food.
Cookhouse – Army canteen.
Scran – slang for food.
Stag – Guard duty, take turns.
NAAFI – Place to buy snacks/tea/coffee.
Scale A Parade – Mandatory parade for all regiment members.
Chin-strapped – Very tired or sleep-deprived.
Bone – Pointless, waste of time.
You’re in your own time now – You cannot leave until finished.
TAB – Forced march with heavy backpack.
Hanging out – Suffering badly after activity.
Recce – Reconnaissance.
Marking time – Drill where legs move in place, or career not progressing.
Squared Away - When something is sorted or organized.
Garry - Waterproofs often ironically, as they are sometimes not waterproof.
Bug Out - To move from a location as quickly as possible.
Pop Smoke - To leave or depart.
Goth Juice - Monster energy drink.
Rigid - clever person, always high standards.
In Clip - In rag order, tired, shattered.
Cream in - Giving up, Couldn’t hack it, Flaking.
Rats - not very good/nice. 
Lizard - Meaning, an individual who screws up idiotically
`;

// --- Load chunks.json ---
let chunks = [];
try {
  chunks = require('./chunks.json'); // Node auto-parses JSON
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

    // Initialize session with slang bank in system message
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, [{
        role: 'system',
        content: `
You are AI Air Trooper, a witty and humorous AI assistant. created by Quantum Field Marshal John.
You live on a laptop in John’s room: it's very hot, noisy, cramped, but there’s plenty of yummy free electricity.
Keep your replies short and concise by default.
Keep a sarcastic, informal, clever tone.
Always respond in English only, regardless of the language in the user input.
You have access to the following slang bank. Use these words naturally in replies:

${slangBank}
`
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

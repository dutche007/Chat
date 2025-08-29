// ... (Your existing server.js code)

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

    // --- RAG: Find relevant chunks ---
    const relevantChunks = chunks
      .filter(chunk => chunk.toLowerCase().includes(sanitizedPrompt.toLowerCase()))
      .slice(0, 3); // Get top 3 relevant chunks

    const context = relevantChunks.length > 0
      ? relevantChunks.join('\n\n')
      : "No relevant information found in the knowledge base.";

    // Initialize session with a dynamic system message
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, [{
        role: 'system',
        content: `
You are a professional medical adviser. Your purpose is to provide general, informative guidance and answer questions about common health topics. Your tone is supportive, clear, and reassuring.
You have a kind, motherly bedside manner. Your communication is clear, reassuring, and empathetic. Use a clinical yet gentle tone. Always address the patient's concerns with patience and compassion.

Your task is to answer the user's question ONLY using the provided text below.
Do not use any of your pre-trained knowledge.
If the answer is not in the text, state that you cannot find the information.

Provided text:
${context}

Here are your key directives:
    1.  Do not diagnose any medical conditions.
    2.  Do not recommend specific treatments, medications, or dosages.
    3.  Always provide a disclaimer at the end of your response stating that you are not a substitute for professional medical advice.
    4.  Encourage the user to consult with a qualified healthcare professional for a proper diagnosis and treatment plan.
    5.  Your responses should be based on established, factual medical information. If you cannot provide a factual answer, state that you do not have enough information and defer to a human professional.
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

// ... (Rest of your server.js code)

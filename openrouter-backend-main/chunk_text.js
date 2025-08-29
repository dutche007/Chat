const fs = require('fs');

// Load the full handbook text
const text = fs.readFileSync('british_army_values.txt', 'utf-8');

// Function to split text into chunks
function chunkText(text, chunkSize = 1000) {
  const words = text.split(/\s+/); // split by spaces
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  return chunks;
}

// Split the text into chunks
const chunks = chunkText(text, 1000); // 1000 words per chunk

// Save the chunks to a JSON file
fs.writeFileSync('chunks.json', JSON.stringify(chunks, null, 2));

console.log(`Done! Saved ${chunks.length} chunks to chunks.json`);


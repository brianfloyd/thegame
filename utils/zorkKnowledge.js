/**
 * ZORK Knowledge Base - Embedding Utilities
 * 
 * Handles embedding generation using OpenAI API for semantic search
 */

require('dotenv').config();
const OpenAI = require('openai');

// Initialize OpenAI client
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('[ZORK Knowledge] WARNING: OPENAI_API_KEY not set. Embedding generation will fail.');
}

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding vector for a text string
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector (1536 dimensions)
 */
async function generateEmbedding(text) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY environment variable.');
  }
  
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text must be a non-empty string');
  }
  
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim(),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('[ZORK Knowledge] Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
async function generateEmbeddingBatch(texts) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY environment variable.');
  }
  
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Texts must be a non-empty array');
  }
  
  // Filter out empty texts
  const validTexts = texts.filter(t => t && typeof t === 'string' && t.trim().length > 0);
  
  if (validTexts.length === 0) {
    throw new Error('No valid texts to embed');
  }
  
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: validTexts.map(t => t.trim()),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    
    return response.data.map(item => item.embedding);
  } catch (error) {
    console.error('[ZORK Knowledge] Error generating batch embeddings:', error.message);
    throw error;
  }
}

/**
 * Prepare knowledge text for embedding
 * Combines title and content into a single string for embedding
 * @param {string} title - Knowledge chunk title
 * @param {string} content - Knowledge chunk content
 * @returns {string} - Formatted text for embedding
 */
function prepareKnowledgeForEmbedding(title, content) {
  const titleText = title ? `${title}\n\n` : '';
  const contentText = content || '';
  return `${titleText}${contentText}`.trim();
}

/**
 * Store knowledge with automatically generated embedding
 * @param {Object} db - Database module with addZorkKnowledge function
 * @param {string} category - Knowledge category
 * @param {string} subcategory - Knowledge subcategory (optional)
 * @param {string} title - Knowledge title
 * @param {string} content - Knowledge content
 * @param {number} priority - Priority level (0-2)
 * @param {string} source - Source ('system', 'zork', 'cursor')
 * @param {string} addedBy - User/player who added this (optional)
 * @returns {Promise<Object>} - Created knowledge chunk
 */
async function storeKnowledgeWithEmbedding(db, category, subcategory, title, content, priority = 0, source = 'system', addedBy = null) {
  // Prepare text for embedding
  const textToEmbed = prepareKnowledgeForEmbedding(title, content);
  
  // Generate embedding
  let embedding = null;
  try {
    embedding = await generateEmbedding(textToEmbed);
  } catch (error) {
    console.error('[ZORK Knowledge] Failed to generate embedding, storing without embedding:', error.message);
    // Continue without embedding - will use keyword search fallback
  }
  
  // Store in database
  // For PostgreSQL vector type, we pass the array directly - pg will handle conversion
  const knowledge = await db.addZorkKnowledge(
    category,
    subcategory || null,
    title,
    content,
    embedding, // Pass array directly - PostgreSQL vector type accepts arrays
    priority,
    source,
    addedBy
  );
  
  return knowledge;
}

module.exports = {
  generateEmbedding,
  generateEmbeddingBatch,
  prepareKnowledgeForEmbedding,
  storeKnowledgeWithEmbedding,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
};


/**
 * Knowledge Tools - MCP tools for RAG knowledge base access
 * 
 * Provides Cursor with the same knowledge access as ZORK:
 * - Semantic search over knowledge base
 * - Add/update/delete knowledge
 * - List knowledge by category
 * 
 * Uses the same database and embedding utilities as ZORK.
 */

import * as verifier from '../src/StateVerifier.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize OpenAI for embeddings
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding for text
 */
async function generateEmbedding(text) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY environment variable.');
  }
  
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
    dimensions: EMBEDDING_DIMENSIONS,
  });
  
  return response.data[0].embedding;
}

export const knowledgeTools = [
  {
    name: 'knowledge_search',
    description: 'Semantic search over the knowledge base. Returns relevant knowledge chunks based on query meaning.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query - what you want to find or understand',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 5)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (core_identity, command_knowledge, world_lore, interaction_patterns, learned_context, system_docs, game_design, technical)',
        },
        threshold: {
          type: 'number',
          description: 'Similarity threshold 0-1 (default: 0.6, lower = more results)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge_list',
    description: 'List knowledge chunks, optionally filtered by category and/or priority.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category',
        },
        priority: {
          type: 'number',
          description: 'Filter by priority (0=contextual, 1=important, 2=always-include)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20)',
        },
      },
    },
  },
  {
    name: 'knowledge_get',
    description: 'Get a specific knowledge chunk by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Knowledge chunk ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'knowledge_add',
    description: 'Add new knowledge to the database. Automatically generates embedding for semantic search.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Brief descriptive title for the knowledge',
        },
        content: {
          type: 'string',
          description: 'The knowledge content to store',
        },
        category: {
          type: 'string',
          description: 'Category: core_identity, command_knowledge, world_lore, interaction_patterns, learned_context, system_docs, game_design, technical',
        },
        subcategory: {
          type: 'string',
          description: 'Optional subcategory for organization',
        },
        priority: {
          type: 'number',
          description: 'Priority: 0=contextual (semantic search), 1=important (keyword-triggered), 2=always-include',
        },
      },
      required: ['title', 'content', 'category'],
    },
  },
  {
    name: 'knowledge_update',
    description: 'Update an existing knowledge chunk. Can update title, content, category, or priority.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Knowledge chunk ID to update',
        },
        title: {
          type: 'string',
          description: 'New title (optional)',
        },
        content: {
          type: 'string',
          description: 'New content (optional, will regenerate embedding)',
        },
        category: {
          type: 'string',
          description: 'New category (optional)',
        },
        subcategory: {
          type: 'string',
          description: 'New subcategory (optional)',
        },
        priority: {
          type: 'number',
          description: 'New priority (optional)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'knowledge_delete',
    description: 'Soft-delete a knowledge chunk (sets active=false).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Knowledge chunk ID to delete',
        },
      },
      required: ['id'],
    },
  },
];

export async function handleKnowledgeTool(name, args) {
  try {
    switch (name) {
      case 'knowledge_search': {
        const { query, limit = 5, category = null, threshold = 0.6 } = args;
        
        // Check if embedding column exists
        const columnCheck = await verifier.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'`
        );
        const hasEmbedding = columnCheck.length > 0;
        
        let results;
        
        if (hasEmbedding && openai) {
          // Generate embedding for query
          const queryEmbedding = await generateEmbedding(query);
          const embeddingStr = `[${queryEmbedding.join(',')}]`;
          
          // Semantic search
          let sql = `
            SELECT id, category, subcategory, title, content, priority, source, added_by,
                   1 - (embedding <=> $1::vector) as similarity
            FROM zork_knowledge
            WHERE active = TRUE
          `;
          const params = [embeddingStr];
          let paramIndex = 2;
          
          if (category) {
            sql += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
          }
          
          sql += ` AND 1 - (embedding <=> $1::vector) > $${paramIndex}`;
          params.push(threshold);
          paramIndex++;
          
          sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
          params.push(limit);
          
          results = await verifier.query(sql, params);
        } else {
          // Fallback to keyword search
          let sql = `
            SELECT id, category, subcategory, title, content, priority, source, added_by
            FROM zork_knowledge
            WHERE active = TRUE AND (title ILIKE $1 OR content ILIKE $1)
          `;
          const params = [`%${query}%`];
          let paramIndex = 2;
          
          if (category) {
            sql += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
          }
          
          sql += ` LIMIT $${paramIndex}`;
          params.push(limit);
          
          results = await verifier.query(sql, params);
        }
        
        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} results:\n\n${results.map(r => 
              `[${r.id}] ${r.category}/${r.subcategory || 'general'} (priority ${r.priority})\n` +
              `**${r.title}**\n${r.content}\n` +
              (r.similarity ? `Similarity: ${(r.similarity * 100).toFixed(1)}%` : '')
            ).join('\n\n---\n\n')}`,
          }],
        };
      }
      
      case 'knowledge_list': {
        const { category = null, priority = null, limit = 20 } = args;
        
        let sql = 'SELECT id, category, subcategory, title, priority, source, added_by, created_at FROM zork_knowledge WHERE active = TRUE';
        const params = [];
        let paramIndex = 1;
        
        if (category) {
          sql += ` AND category = $${paramIndex}`;
          params.push(category);
          paramIndex++;
        }
        
        if (priority !== null) {
          sql += ` AND priority = $${paramIndex}`;
          params.push(priority);
          paramIndex++;
        }
        
        sql += ` ORDER BY category, priority DESC, created_at DESC LIMIT $${paramIndex}`;
        params.push(limit);
        
        const results = await verifier.query(sql, params);
        
        return {
          content: [{
            type: 'text',
            text: `Knowledge chunks (${results.length}):\n\n${results.map(r =>
              `[${r.id}] ${r.category}/${r.subcategory || 'general'} (P${r.priority}) - ${r.title}`
            ).join('\n')}`,
          }],
        };
      }
      
      case 'knowledge_get': {
        const { id } = args;
        
        const result = await verifier.queryOne(
          'SELECT * FROM zork_knowledge WHERE id = $1',
          [id]
        );
        
        if (!result) {
          return {
            content: [{ type: 'text', text: `Knowledge chunk ${id} not found.` }],
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: `Knowledge Chunk #${result.id}\n` +
              `Category: ${result.category}/${result.subcategory || 'general'}\n` +
              `Priority: ${result.priority}\n` +
              `Source: ${result.source}\n` +
              `Added by: ${result.added_by || 'system'}\n` +
              `Active: ${result.active}\n` +
              `Created: ${new Date(parseInt(result.created_at)).toISOString()}\n\n` +
              `**${result.title}**\n\n${result.content}`,
          }],
        };
      }
      
      case 'knowledge_add': {
        const { 
          title, 
          content, 
          category, 
          subcategory = null, 
          priority = 0 
        } = args;
        
        // Generate embedding if OpenAI is available
        let embedding = null;
        if (openai) {
          try {
            embedding = await generateEmbedding(`${title}\n\n${content}`);
          } catch (error) {
            console.warn('Failed to generate embedding:', error.message);
          }
        }
        
        // Check if embedding column exists
        const columnCheck = await verifier.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'`
        );
        const hasEmbeddingColumn = columnCheck.length > 0;
        
        let result;
        const now = Date.now();
        
        if (hasEmbeddingColumn && embedding) {
          const embeddingStr = `[${embedding.join(',')}]`;
          result = await verifier.query(
            `INSERT INTO zork_knowledge 
             (category, subcategory, title, content, embedding, priority, source, added_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::vector, $6, 'cursor', 'Cursor AI', $7, $8)
             RETURNING id, title, category`,
            [category, subcategory, title, content, embeddingStr, priority, now, now]
          );
        } else {
          result = await verifier.query(
            `INSERT INTO zork_knowledge 
             (category, subcategory, title, content, priority, source, added_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'cursor', 'Cursor AI', $6, $7)
             RETURNING id, title, category`,
            [category, subcategory, title, content, priority, now, now]
          );
        }
        
        return {
          content: [{
            type: 'text',
            text: `Knowledge added successfully!\n` +
              `ID: ${result[0].id}\n` +
              `Title: ${result[0].title}\n` +
              `Category: ${result[0].category}\n` +
              `Embedding: ${embedding ? 'Generated' : 'Not available'}`,
          }],
        };
      }
      
      case 'knowledge_update': {
        const { id, title, content, category, subcategory, priority } = args;
        
        // Build dynamic update
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (title !== undefined) {
          updates.push(`title = $${paramIndex}`);
          values.push(title);
          paramIndex++;
        }
        if (content !== undefined) {
          updates.push(`content = $${paramIndex}`);
          values.push(content);
          paramIndex++;
        }
        if (category !== undefined) {
          updates.push(`category = $${paramIndex}`);
          values.push(category);
          paramIndex++;
        }
        if (subcategory !== undefined) {
          updates.push(`subcategory = $${paramIndex}`);
          values.push(subcategory);
          paramIndex++;
        }
        if (priority !== undefined) {
          updates.push(`priority = $${paramIndex}`);
          values.push(priority);
          paramIndex++;
        }
        
        if (updates.length === 0) {
          return {
            content: [{ type: 'text', text: 'No fields to update.' }],
          };
        }
        
        // Regenerate embedding if content changed
        if (content !== undefined && openai) {
          try {
            const columnCheck = await verifier.query(
              `SELECT column_name FROM information_schema.columns 
               WHERE table_name = 'zork_knowledge' AND column_name = 'embedding'`
            );
            
            if (columnCheck.length > 0) {
              // Get title for embedding
              const existing = await verifier.queryOne('SELECT title FROM zork_knowledge WHERE id = $1', [id]);
              const titleForEmbedding = title || existing?.title || '';
              const embedding = await generateEmbedding(`${titleForEmbedding}\n\n${content}`);
              const embeddingStr = `[${embedding.join(',')}]`;
              updates.push(`embedding = $${paramIndex}::vector`);
              values.push(embeddingStr);
              paramIndex++;
            }
          } catch (error) {
            console.warn('Failed to regenerate embedding:', error.message);
          }
        }
        
        updates.push(`updated_at = $${paramIndex}`);
        values.push(Date.now());
        paramIndex++;
        
        values.push(id);
        
        const result = await verifier.query(
          `UPDATE zork_knowledge SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, title, category`,
          values
        );
        
        if (result.length === 0) {
          return {
            content: [{ type: 'text', text: `Knowledge chunk ${id} not found.` }],
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: `Knowledge updated!\nID: ${result[0].id}\nTitle: ${result[0].title}`,
          }],
        };
      }
      
      case 'knowledge_delete': {
        const { id } = args;
        
        const result = await verifier.query(
          `UPDATE zork_knowledge SET active = FALSE, updated_at = $1 WHERE id = $2 RETURNING id, title`,
          [Date.now(), id]
        );
        
        if (result.length === 0) {
          return {
            content: [{ type: 'text', text: `Knowledge chunk ${id} not found.` }],
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: `Knowledge deleted (soft delete).\nID: ${result[0].id}\nTitle: ${result[0].title}`,
          }],
        };
      }
      
      default:
        return {
          content: [{ type: 'text', text: `Unknown knowledge tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Knowledge tool error: ${error.message}` }],
      isError: true,
    };
  }
}



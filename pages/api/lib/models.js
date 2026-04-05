// Centralized model configuration
// Change here or override via environment variables in Railway

export const MODEL_OPUS = process.env.CLAUDE_MODEL_OPUS || "claude-opus-4-6";
export const MODEL_SONNET = process.env.CLAUDE_MODEL_SONNET || "claude-sonnet-4-6";
export const MODEL_HAIKU = process.env.CLAUDE_MODEL_HAIKU || "claude-haiku-4-5-20251001";

// Fine-tuned Magen model (OpenAI GPT-4o-mini) — set MAGEN_OPENAI_MODEL to enable
// When set, main chat responses use this model + RAG instead of Claude
export const MODEL_MAGEN = process.env.MAGEN_OPENAI_MODEL || null;

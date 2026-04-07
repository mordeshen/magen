// Centralized model configuration
// Change here or override via environment variables in Railway

export const MODEL_OPUS = process.env.CLAUDE_MODEL_OPUS || "claude-opus-4-6";
export const MODEL_SONNET = process.env.CLAUDE_MODEL_SONNET || "claude-sonnet-4-6";
export const MODEL_HAIKU = process.env.CLAUDE_MODEL_HAIKU || "claude-haiku-4-5-20251001";

// DEPRECATED: old OpenAI fine-tuned path, replaced by knowledge-provider.js
// The future fine-tuned model (Gemma 4) will be wired through knowledge-provider.js,
// not via this MODEL_MAGEN constant. Kept as null to preserve existing imports
// without breaking anything; do not set MAGEN_OPENAI_MODEL anymore.
export const MODEL_MAGEN = process.env.MAGEN_OPENAI_MODEL || null;

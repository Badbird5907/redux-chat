// Model configuration - easily replaceable
export interface ModelConfig {
  id: string
  name: string
  provider: string
  allowedFileTypes: string[]
  maxFiles?: number
}

// Define your models here - replace with your own implementation
export const MODELS: ModelConfig[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    allowedFileTypes: ["image/*", ".pdf", ".txt", ".doc", ".docx"],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    allowedFileTypes: ["image/*", ".pdf", ".txt", ".doc", ".docx"],
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    allowedFileTypes: ["image/*", ".pdf", ".txt"],
  },
  {
    id: "gemini-pro",
    name: "Gemini Pro",
    provider: "Google",
    allowedFileTypes: ["image/*", "video/*", ".pdf"],
  },
  {
    id: "llama-3-70b",
    name: "Llama 3 70B",
    provider: "Meta",
    allowedFileTypes: [], // No file uploads
  },
]

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODELS.find((m) => m.id === modelId)
}

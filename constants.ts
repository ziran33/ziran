import { LLMConfig } from './types';

export const DEFAULT_MODELS: LLMConfig[] = [
  { 
    id: 'default-gemini-flash', 
    userId: 'system',
    name: 'Gemini 2.5 Flash (Official)', 
    provider: 'gemini', 
    modelId: 'gemini-2.5-flash' 
  },
  { 
    id: 'default-gemini-pro-2.5', 
    userId: 'system',
    name: 'Gemini 2.5 Pro (Official)', 
    provider: 'gemini', 
    modelId: 'gemini-2.5-pro-preview-09-2025' 
  },
  { 
    id: 'default-gemini-pro', 
    userId: 'system',
    name: 'Gemini 3.0 Pro (Official)', 
    provider: 'gemini', 
    modelId: 'gemini-3-pro-preview' 
  },
  { 
    id: 'default-gemini-lite', 
    userId: 'system',
    name: 'Gemini Flash Lite (Official)', 
    provider: 'gemini', 
    modelId: 'gemini-2.5-flash-lite-latest' 
  },
];

export const DEFAULT_MODEL_ID = 'default-gemini-flash';
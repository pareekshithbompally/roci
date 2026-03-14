/**
 * Audio Transcription Validator Service
 * 
 * Background service that validates if a model supports audio transcription endpoints.
 * Checks provider capabilities and throws appropriate errors/success messages.
 */

import type { ModelProvider } from '@/types/modelProviders';

export type ValidationResult = {
  success: boolean;
  message: string;
  provider: string;
  modelId: string;
  supportsAudio: boolean;
  supportsWhisper: boolean;
  endpoint?: string;
};

/**
 * Provider-specific audio transcription capabilities
 * Maps provider names to their audio transcription support
 */
const PROVIDER_AUDIO_CAPABILITIES: Record<string, {
  supportsAudio: boolean;
  supportsWhisper: boolean;
  endpoint?: string;
  requiresSpecificModel?: boolean;
  audioModels?: string[];
  whisperModels?: string[];
  notes?: string;
}> = {
  'openai': {
    supportsAudio: true, // OpenAI has audio-capable models
    supportsWhisper: true,
    endpoint: '/audio/transcriptions',
    audioModels: ['gpt-audio', 'gpt-audio-mini', 'gpt-4o-audio', 'gpt-4o-mini-audio', 'gpt-realtime', 'gpt-realtime-mini'],
    whisperModels: ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe-diarize'],
    notes: 'OpenAI supports audio via native audio models (gpt-audio) and dedicated transcription models (Whisper/transcribe)'
  },
  'azure': {
    supportsAudio: false,
    supportsWhisper: true,
    endpoint: '/audio/transcriptions',
    requiresSpecificModel: true,
    notes: 'Requires Whisper deployment in Azure'
  },
  'gemini': {
    supportsAudio: true,
    supportsWhisper: false,
    endpoint: '/models.generateContent',
    notes: 'Gemini models support native audio input via inline data'
  },
  'anthropic': {
    supportsAudio: false,
    supportsWhisper: false,
    notes: 'Claude models do not support audio transcription'
  },
  'cohere': {
    supportsAudio: false,
    supportsWhisper: false,
    notes: 'Cohere models do not support audio transcription'
  },
  'openrouter': {
    supportsAudio: false,
    supportsWhisper: false,
    notes: 'OpenRouter does not support audio transcription endpoints'
  },
  'mistral': {
    supportsAudio: false,
    supportsWhisper: false,
    notes: 'Mistral models do not support audio transcription'
  },
  'groq': {
    supportsAudio: false,
    supportsWhisper: true,
    endpoint: '/audio/transcriptions',
    whisperModels: ['whisper-large-v3', 'distil-whisper-large-v3-en'],
    notes: 'Groq supports Whisper models for transcription'
  },
  'huggingface': {
    supportsAudio: false,
    supportsWhisper: false,
    requiresSpecificModel: true,
    notes: 'Some Hugging Face models may support audio, but requires model-specific configuration'
  },
  'xai': {
    supportsAudio: false,
    supportsWhisper: false,
    notes: 'Grok models do not support audio transcription'
  },
  'local-server': {
    supportsAudio: false,
    supportsWhisper: false,
    requiresSpecificModel: true,
    notes: 'Audio support depends on your local server configuration'
  }
};

/**
 * Gemini models that support audio input
 * Gemini 3.x, 2.5, 2.0, and 1.5 series support native audio
 */
const GEMINI_AUDIO_MODELS = [
  'gemini-3',        // All Gemini 3.x variants (3 Pro, 3 Flash)
  'gemini-2.5',      // All Gemini 2.5 variants
  'gemini-2.0',      // All Gemini 2.0 variants
  'gemini-1.5',      // All Gemini 1.5 variants  
  'gemini-exp',      // Experimental models
];

/**
 * Validates if a model supports audio transcription
 */
export async function validateAudioTranscriptionSupport(
  modelId: string,
  provider: ModelProvider
): Promise<ValidationResult> {
  const providerName = provider.provider.toLowerCase();
  const capabilities = PROVIDER_AUDIO_CAPABILITIES[providerName];

  // Unknown provider - assume no support
  if (!capabilities) {
    return {
      success: false,
      message: `Provider "${provider.provider}" is not recognized for audio transcription validation.`,
      provider: provider.provider,
      modelId,
      supportsAudio: false,
      supportsWhisper: false,
    };
  }

  // Check Gemini models specifically
  if (providerName === 'gemini') {
    const supportsAudio = GEMINI_AUDIO_MODELS.some(model => 
      modelId.toLowerCase().includes(model.toLowerCase())
    );

    if (supportsAudio) {
      return {
        success: true,
        message: `✓ "${modelId}" supports native audio transcription via Gemini API`,
        provider: provider.provider,
        modelId,
        supportsAudio: true,
        supportsWhisper: false,
        endpoint: capabilities.endpoint,
      };
    } else {
      return {
        success: false,
        message: `ℹ "${modelId}" may not support audio input. Gemini 3.x, 2.5, 2.0, and 1.5 series support audio transcription`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: false,
      };
    }
  }

  // Check OpenAI models (audio-capable and Whisper models)
  if (providerName === 'openai') {
    const isAudioModel = capabilities.audioModels?.some(model => 
      modelId.toLowerCase().includes(model.toLowerCase())
    ) || false;
    
    const isWhisperModel = capabilities.whisperModels?.some(model => 
      modelId.toLowerCase().includes(model.toLowerCase())
    ) || false;

    if (isAudioModel) {
      return {
        success: true,
        message: `✓ "${modelId}" supports native audio input and output via OpenAI Chat Completions API`,
        provider: provider.provider,
        modelId,
        supportsAudio: true,
        supportsWhisper: false,
        endpoint: '/chat/completions',
      };
    } else if (isWhisperModel) {
      return {
        success: true,
        message: `✓ "${modelId}" is a speech-to-text model via OpenAI Audio API`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: true,
        endpoint: capabilities.endpoint,
      };
    } else {
      return {
        success: false,
        message: `ℹ "${modelId}" doesn't appear to support audio transcription. Consider using: ${[...(capabilities.audioModels || []), ...(capabilities.whisperModels || [])].slice(0, 3).join(', ')}`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: false,
      };
    }
  }

  // Check Groq Whisper models
  if (providerName === 'groq' && capabilities.whisperModels) {
    const isWhisperModel = capabilities.whisperModels.some(model => 
      modelId.toLowerCase().includes(model.toLowerCase())
    );

    if (isWhisperModel) {
      return {
        success: true,
        message: `✓ "${modelId}" supports audio transcription via Groq Whisper API`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: true,
        endpoint: capabilities.endpoint,
      };
    } else {
      return {
        success: false,
        message: `ℹ "${modelId}" doesn't appear to be a Whisper model. For transcription, consider: ${capabilities.whisperModels.join(', ')}`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: false,
      };
    }
  }

  // Azure - requires specific Whisper deployment
  if (providerName === 'azure') {
    // For Azure, we can't know for sure without checking the deployment
    // But if it contains 'whisper' in the name, it's likely a whisper deployment
    if (modelId.toLowerCase().includes('whisper')) {
      return {
        success: true,
        message: `✓ "${modelId}" appears to be a Whisper deployment for audio transcription`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: true,
        endpoint: capabilities.endpoint,
      };
    } else {
      return {
        success: false,
        message: `ℹ "${modelId}" doesn't appear to be a Whisper deployment. ${capabilities.notes}`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: false,
      };
    }
  }

  // Local server - we can't determine support
  if (providerName === 'local-server') {
    return {
      success: false,
      message: `⚠ Cannot verify audio support for local server model "${modelId}". ${capabilities.notes}`,
      provider: provider.provider,
      modelId,
      supportsAudio: false,
      supportsWhisper: false,
    };
  }

  // Hugging Face - model-specific
  if (providerName === 'huggingface') {
    // Check if it's a known audio model
    if (modelId.toLowerCase().includes('whisper')) {
      return {
        success: true,
        message: `✓ "${modelId}" appears to be a Whisper model that may support audio transcription`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: true,
      };
    } else {
      return {
        success: false,
        message: `ℹ Cannot verify audio support for "${modelId}". ${capabilities.notes}`,
        provider: provider.provider,
        modelId,
        supportsAudio: false,
        supportsWhisper: false,
      };
    }
  }

  // All other providers - no audio support
  return {
    success: false,
    message: `ℹ "${provider.provider}" doesn't currently support audio transcription. ${capabilities.notes}`,
    provider: provider.provider,
    modelId,
    supportsAudio: false,
    supportsWhisper: false,
  };
}

/**
 * Validates audio transcription support with API endpoint test (optional)
 * This can be called after initial validation to verify the endpoint actually works
 */
export async function validateAudioTranscriptionEndpoint(
  provider: ModelProvider,
  modelId: string
): Promise<{ success: boolean; message: string }> {
  const apiKeySetting = provider.settings.find(s => s.key === 'api-key');
  const baseUrlSetting = provider.settings.find(s => s.key === 'base-url');
  
  const apiKey = apiKeySetting?.controller_props.value as string || '';
  const baseUrl = baseUrlSetting?.controller_props.value as string || '';
  
  if (!apiKey || !baseUrl) {
    return {
      success: false,
      message: 'API key and Base URL must be configured to test endpoint'
    };
  }

  const providerName = provider.provider.toLowerCase();
  const capabilities = PROVIDER_AUDIO_CAPABILITIES[providerName];

  // Only test if provider supports Whisper API
  if (!capabilities?.supportsWhisper || !capabilities.endpoint) {
    return {
      success: false,
      message: 'Provider does not have testable audio transcription endpoint'
    };
  }

  try {
    // Create a minimal test request to check if endpoint exists
    // We're just checking if the endpoint responds, not actually transcribing
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
    };

    // Add custom headers for specific providers
    if (provider.custom_header) {
      for (const header of provider.custom_header) {
        headers[header.header] = header.value;
      }
    }

    // Make an OPTIONS request to check if endpoint exists
    const response = await fetch(`${baseUrl}${capabilities.endpoint}`, {
      method: 'OPTIONS',
      headers,
    });

    if (response.ok || response.status === 405) {
      // 405 means OPTIONS not allowed, but endpoint exists
      return {
        success: true,
        message: `✓ Audio transcription endpoint verified at ${baseUrl}${capabilities.endpoint}`
      };
    } else {
      return {
        success: false,
        message: `✗ Audio transcription endpoint not found at ${baseUrl}${capabilities.endpoint}`
      };
    }
  } catch (error: unknown) {
    return {
      success: false,
      message: `✗ Failed to verify endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export const audioTranscriptionValidator = {
  validateAudioTranscriptionSupport,
  validateAudioTranscriptionEndpoint,
};

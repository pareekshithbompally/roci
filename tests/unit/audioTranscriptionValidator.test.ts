/**
 * Tests for Audio Transcription Validator Service
 */

import { describe, it, expect } from 'vitest';
import { audioTranscriptionValidator } from '@services/audioTranscriptionValidator';
import type { ModelProvider } from '@shared/types/modelProviders';

describe('audioTranscriptionValidator', () => {
  describe('validateAudioTranscriptionSupport', () => {
    // Gemini Tests
    it('should validate Gemini 3 Flash audio models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'gemini',
        api_key: 'test-key',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gemini-3-flash-preview',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(true);
      expect(result.supportsWhisper).toBe(false);
      expect(result.message).toContain('supports native audio transcription');
    });

    it('should validate Gemini 3 Pro audio models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'gemini',
        api_key: 'test-key',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gemini-3-pro-preview',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(true);
      expect(result.supportsWhisper).toBe(false);
      expect(result.message).toContain('supports native audio transcription');
    });

    it('should validate Gemini 2.0 audio models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'gemini',
        api_key: 'test-key',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gemini-2.0-flash-exp',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(true);
      expect(result.supportsWhisper).toBe(false);
      expect(result.message).toContain('supports native audio transcription');
    });

    it('should validate Gemini 2.5 audio models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'gemini',
        api_key: 'test-key',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gemini-2.5-flash',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(true);
      expect(result.supportsWhisper).toBe(false);
      expect(result.message).toContain('supports native audio transcription');
    });

    it('should validate Gemini 1.5 audio models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'gemini',
        api_key: 'test-key',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gemini-1.5-pro-latest',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(true);
      expect(result.message).toContain('supports native audio transcription');
    });

    it('should provide info for non-audio Gemini models', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'gemini',
        api_key: 'test-key',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gemini-pro',
        provider
      );

      expect(result.success).toBe(false);
      expect(result.supportsAudio).toBe(false);
      expect(result.message).toContain('may not support audio input');
    });

    // OpenAI Tests
    it('should validate OpenAI gpt-audio models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gpt-audio',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(true);
      expect(result.supportsWhisper).toBe(false);
      expect(result.message).toContain('supports native audio input and output');
    });

    it('should validate OpenAI gpt-audio-mini models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gpt-audio-mini',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(true);
      expect(result.message).toContain('supports native audio input and output');
    });

    it('should validate OpenAI Whisper models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'whisper-1',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsAudio).toBe(false);
      expect(result.supportsWhisper).toBe(true);
      expect(result.message).toContain('speech-to-text model');
    });

    it('should validate OpenAI gpt-4o-transcribe models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gpt-4o-transcribe',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsWhisper).toBe(true);
      expect(result.message).toContain('speech-to-text model');
    });

    it('should provide info for non-audio OpenAI models', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'openai',
        api_key: 'test-key',
        base_url: 'https://api.openai.com/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'gpt-4',
        provider
      );

      expect(result.success).toBe(false);
      expect(result.supportsWhisper).toBe(false);
      expect(result.message).toContain("doesn't appear to support audio transcription");
    });

    // Groq Tests
    it('should validate Groq Whisper models successfully', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'groq',
        api_key: 'test-key',
        base_url: 'https://api.groq.com/openai/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'whisper-large-v3',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsWhisper).toBe(true);
      expect(result.endpoint).toBe('/audio/transcriptions');
      expect(result.message).toContain('supports audio transcription via Groq Whisper API');
    });

    // Anthropic Tests
    it('should provide info for providers without audio support', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'anthropic',
        api_key: 'test-key',
        base_url: 'https://api.anthropic.com/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'claude-3-5-sonnet',
        provider
      );

      expect(result.success).toBe(false);
      expect(result.supportsAudio).toBe(false);
      expect(result.supportsWhisper).toBe(false);
      expect(result.message).toContain("doesn't currently support audio transcription");
    });

    // Azure Tests
    it('should handle Azure Whisper deployments', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'azure',
        api_key: 'test-key',
        base_url: 'https://test.openai.azure.com/openai/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'whisper-deployment',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsWhisper).toBe(true);
      expect(result.message).toContain('appears to be a Whisper deployment');
    });

    // Unknown provider test
    it('should handle unknown providers', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'unknown-provider',
        api_key: 'test-key',
        base_url: 'https://api.unknown.com/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'some-model',
        provider
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('is not recognized for audio transcription validation');
    });

    // Local server test
    it('should handle local server with caution', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'local-server',
        api_key: '',
        base_url: 'http://localhost:1234/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'local-model',
        provider
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot verify audio support for local server');
    });

    // Hugging Face test
    it('should detect Hugging Face Whisper models', async () => {
      const provider: ModelProvider = {
        active: true,
        provider: 'huggingface',
        api_key: 'test-key',
        base_url: 'https://router.huggingface.co/v1',
        settings: [],
        models: [],
      };

      const result = await audioTranscriptionValidator.validateAudioTranscriptionSupport(
        'openai/whisper-large-v3',
        provider
      );

      expect(result.success).toBe(true);
      expect(result.supportsWhisper).toBe(true);
      expect(result.message).toContain('appears to be a Whisper model');
    });
  });
});

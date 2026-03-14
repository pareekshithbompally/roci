/**
 * Chat Threads Storage Service
 * Manages AI chat conversation persistence
 */

import { writeFile, readFile, remove, exists } from '@tauri-apps/plugin-fs';
import { StorageConfig, generateChatFilename } from '../../src/config/storage.config';
import { pathsService } from './paths.service';
import type { ChatThread, ChatMessage, StorageResult } from './types';

class ChatsService {
  /**
   * Save a new chat thread
   */
  async saveChat(
    messages: ChatMessage[],
    metadata: Partial<ChatThread> = {}
  ): Promise<StorageResult<ChatThread>> {
    try {
      const filename = generateChatFilename();
      const path = await pathsService.getChatsPath();
      
      // Ensure directory exists before writing
      const dirExists = await exists(path);
      if (!dirExists) {
        console.warn('[ChatsService] Chats directory missing, reinitializing storage...');
        await pathsService.initialize();
      }
      
      const fullPath = `${path}${filename}`;

      const chatThread: ChatThread = {
        id: metadata.id || crypto.randomUUID(),
        title: metadata.title || this.generateChatTitle(messages),
        messages,
        recordingId: metadata.recordingId,
        transcriptionId: metadata.transcriptionId,
        model: metadata.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: StorageConfig.metadataVersion,
      };

      await writeFile(
        fullPath,
        new TextEncoder().encode(JSON.stringify(chatThread, null, 2))
      );

      console.log('[ChatsService] Saved chat thread:', chatThread.id);
      return { success: true, data: chatThread };
    } catch (error) {
      console.error('[ChatsService] Failed to save chat:', error);
      return {
        success: false,
        error: `Failed to save chat: ${error}`,
      };
    }
  }

  /**
   * Load chat thread by ID
   */
  async getChat(chatId: string): Promise<StorageResult<ChatThread>> {
    try {
      const files = await pathsService.listFiles('chats');
      const path = await pathsService.getChatsPath();

      for (const file of files) {
        const fullPath = `${path}${file}`;
        const data = await readFile(fullPath);
        const chat = JSON.parse(new TextDecoder().decode(data)) as ChatThread;
        
        if (chat.id === chatId) {
          return { success: true, data: chat };
        }
      }

      return {
        success: false,
        error: 'Chat thread not found',
      };
    } catch (error) {
      console.error('[ChatsService] Failed to load chat:', error);
      return {
        success: false,
        error: `Failed to load chat: ${error}`,
      };
    }
  }

  /**
   * List all chat threads
   */
  async listChats(): Promise<StorageResult<ChatThread[]>> {
    try {
      const path = await pathsService.getChatsPath();
      
      // Ensure directory exists
      const dirExists = await exists(path);
      if (!dirExists) {
        console.log('[ChatsService] Chats directory does not exist yet, returning empty list');
        return { success: true, data: [] };
      }
      
      const files = await pathsService.listFiles('chats');
      const chats: ChatThread[] = [];

      for (const file of files) {
        const fullPath = `${path}${file}`;
        
        try {
          const data = await readFile(fullPath);
          const chat = JSON.parse(new TextDecoder().decode(data)) as ChatThread;
          chats.push(chat);
        } catch (error) {
          console.warn('[ChatsService] Failed to parse chat file:', file);
        }
      }

      // Sort by updated date (most recent first)
      chats.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return { success: true, data: chats };
    } catch (error) {
      console.error('[ChatsService] Failed to list chats:', error);
      return {
        success: false,
        error: `Failed to list chats: ${error}`,
      };
    }
  }

  /**
   * Update existing chat thread
   */
  async updateChat(chatId: string, updates: Partial<ChatThread>): Promise<StorageResult<ChatThread>> {
    try {
      const result = await this.getChat(chatId);
      if (!result.success || !result.data) {
        return result;
      }

      const chat = result.data;
      const files = await pathsService.listFiles('chats');
      const path = await pathsService.getChatsPath();
      
      // Find the file for this chat
      let chatFile: string | null = null;
      for (const file of files) {
        const fullPath = `${path}${file}`;
        const data = await readFile(fullPath);
        const fileChat = JSON.parse(new TextDecoder().decode(data)) as ChatThread;
        
        if (fileChat.id === chatId) {
          chatFile = file;
          break;
        }
      }

      if (!chatFile) {
        return {
          success: false,
          error: 'Chat file not found',
        };
      }

      const updatedChat: ChatThread = {
        ...chat,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const fullPath = `${path}${chatFile}`;
      await writeFile(
        fullPath,
        new TextEncoder().encode(JSON.stringify(updatedChat, null, 2))
      );

      return { success: true, data: updatedChat };
    } catch (error) {
      console.error('[ChatsService] Failed to update chat:', error);
      return {
        success: false,
        error: `Failed to update chat: ${error}`,
      };
    }
  }

  /**
   * Add message to existing chat
   */
  async addMessage(chatId: string, message: ChatMessage): Promise<StorageResult<ChatThread>> {
    try {
      const result = await this.getChat(chatId);
      if (!result.success || !result.data) {
        return result;
      }

      const updatedMessages = [...result.data.messages, message];
      return await this.updateChat(chatId, { messages: updatedMessages });
    } catch (error) {
      console.error('[ChatsService] Failed to add message:', error);
      return {
        success: false,
        error: `Failed to add message: ${error}`,
      };
    }
  }

  /**
   * Delete chat thread
   */
  async deleteChat(chatId: string): Promise<StorageResult> {
    try {
      const files = await pathsService.listFiles('chats');
      const path = await pathsService.getChatsPath();

      for (const file of files) {
        const fullPath = `${path}${file}`;
        const data = await readFile(fullPath);
        const chat = JSON.parse(new TextDecoder().decode(data)) as ChatThread;
        
        if (chat.id === chatId) {
          await remove(fullPath);
          console.log('[ChatsService] Deleted chat thread:', chatId);
          return { success: true };
        }
      }

      return {
        success: false,
        error: 'Chat thread not found',
      };
    } catch (error) {
      console.error('[ChatsService] Failed to delete chat:', error);
      return {
        success: false,
        error: `Failed to delete chat: ${error}`,
      };
    }
  }

  /**
   * Generate a title from chat messages
   */
  private generateChatTitle(messages: ChatMessage[]): string {
    if (messages.length === 0) {
      return 'New Chat';
    }

    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const preview = firstUserMessage.content.slice(0, 50);
      return preview.length < firstUserMessage.content.length 
        ? `${preview}...` 
        : preview;
    }

    return `Chat ${new Date().toLocaleDateString()}`;
  }
}

// Export singleton instance
export const chatsService = new ChatsService();

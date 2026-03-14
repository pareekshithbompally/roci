/**
 * Event Bus Unit Tests
 * Tests for the type-safe pub/sub event system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEventBus, resetEventBus, eventBus } from '@core/events/event-bus';
import { EventTypes } from '@core/events/event-types';

describe('Event Bus', () => {
  beforeEach(() => {
    resetEventBus();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      expect(bus1).toBe(bus2);
    });

    it('should create new instance after reset', () => {
      const bus1 = getEventBus();
      resetEventBus();
      const bus2 = getEventBus();
      expect(bus1).not.toBe(bus2);
    });
  });

  describe('Event Subscription', () => {
    it('should subscribe to an event', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('ui:toast', handler);
      
      expect(typeof unsubscribe).toBe('function');
      expect(getEventBus().listenerCount('ui:toast')).toBe(1);
    });

    it('should handle multiple subscribers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      eventBus.on('ui:toast', handler1);
      eventBus.on('ui:toast', handler2);
      
      expect(getEventBus().listenerCount('ui:toast')).toBe(2);
    });

    it('should unsubscribe when calling returned function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('ui:toast', handler);
      
      unsubscribe();
      
      expect(getEventBus().listenerCount('ui:toast')).toBe(0);
    });
  });

  describe('Event Emission', () => {
    it('should call handler when event is emitted', () => {
      const handler = vi.fn();
      eventBus.on('ui:toast', handler);
      
      eventBus.emit('ui:toast', { type: 'success', message: 'Test' });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ type: 'success', message: 'Test' });
    });

    it('should call all handlers for an event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      eventBus.on('ui:toast', handler1);
      eventBus.on('ui:toast', handler2);
      
      eventBus.emit('ui:toast', { type: 'info', message: 'Test' });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for other events', () => {
      const toastHandler = vi.fn();
      const themeHandler = vi.fn();
      
      eventBus.on('ui:toast', toastHandler);
      eventBus.on('ui:theme-changed', themeHandler);
      
      eventBus.emit('ui:toast', { type: 'success', message: 'Test' });
      
      expect(toastHandler).toHaveBeenCalledTimes(1);
      expect(themeHandler).not.toHaveBeenCalled();
    });

    it('should handle emission with no subscribers', () => {
      // Should not throw
      expect(() => {
        eventBus.emit('ui:toast', { type: 'success', message: 'Test' });
      }).not.toThrow();
    });
  });

  describe('Once Subscription', () => {
    it('should only call once handler one time', () => {
      const handler = vi.fn();
      eventBus.once('ui:toast', handler);
      
      eventBus.emit('ui:toast', { type: 'success', message: 'First' });
      eventBus.emit('ui:toast', { type: 'success', message: 'Second' });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ type: 'success', message: 'First' });
    });

    it('should remove once listener after emission', () => {
      const handler = vi.fn();
      eventBus.once('ui:toast', handler);
      
      expect(getEventBus().listenerCount('ui:toast')).toBe(1);
      
      eventBus.emit('ui:toast', { type: 'success', message: 'Test' });
      
      expect(getEventBus().listenerCount('ui:toast')).toBe(0);
    });
  });

  describe('Priority', () => {
    it('should call higher priority handlers first', () => {
      const callOrder: number[] = [];
      
      eventBus.on('ui:toast', () => callOrder.push(1), { priority: 1 });
      eventBus.on('ui:toast', () => callOrder.push(3), { priority: 3 });
      eventBus.on('ui:toast', () => callOrder.push(2), { priority: 2 });
      
      eventBus.emit('ui:toast', { type: 'success', message: 'Test' });
      
      expect(callOrder).toEqual([3, 2, 1]);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      eventBus.on('ui:toast', vi.fn());
      eventBus.on('ui:toast', vi.fn());
      eventBus.on('ui:theme-changed', vi.fn());
      
      eventBus.removeAllListeners('ui:toast');
      
      expect(getEventBus().listenerCount('ui:toast')).toBe(0);
      expect(getEventBus().listenerCount('ui:theme-changed')).toBe(1);
    });

    it('should remove all listeners when no event specified', () => {
      eventBus.on('ui:toast', vi.fn());
      eventBus.on('ui:theme-changed', vi.fn());
      
      eventBus.removeAllListeners();
      
      expect(getEventBus().getRegisteredEvents()).toHaveLength(0);
    });
  });

  describe('Async Event Emission', () => {
    it('should handle async handlers', async () => {
      const results: string[] = [];
      
      eventBus.on('ui:toast', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('async');
      });
      
      await getEventBus().emitAsync('ui:toast', { type: 'success', message: 'Test' });
      
      expect(results).toContain('async');
    });
  });

  describe('Event History', () => {
    it('should track emitted events', () => {
      eventBus.emit('ui:toast', { type: 'success', message: 'Test 1' });
      eventBus.emit('ui:theme-changed', { theme: 'dark' });
      
      const history = getEventBus().getHistory();
      
      expect(history).toHaveLength(2);
      expect(history[0].event).toBe('ui:toast');
      expect(history[1].event).toBe('ui:theme-changed');
    });

    it('should clear history', () => {
      eventBus.emit('ui:toast', { type: 'success', message: 'Test' });
      
      getEventBus().clearHistory();
      
      expect(getEventBus().getHistory()).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should continue calling handlers if one throws', () => {
      const handler1 = vi.fn(() => { throw new Error('Test error'); });
      const handler2 = vi.fn();
      
      eventBus.on('ui:toast', handler1);
      eventBus.on('ui:toast', handler2);
      
      // Mock console.error to suppress expected error output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      eventBus.emit('ui:toast', { type: 'success', message: 'Test' });
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Event Types Constants', () => {
    it('should have correct event type constants', () => {
      expect(EventTypes.RECORDING_STARTED).toBe('recording:started');
      expect(EventTypes.TRANSCRIPTION_COMPLETED).toBe('transcription:completed');
      expect(EventTypes.NOTE_ADDED).toBe('note:added');
      expect(EventTypes.TODO_TOGGLED).toBe('todo:toggled');
      expect(EventTypes.UI_TOAST).toBe('ui:toast');
    });
  });

  describe('Type Safety (Runtime)', () => {
    it('should handle recording events', () => {
      const handler = vi.fn();
      eventBus.on('recording:started', handler);
      
      eventBus.emit('recording:started', {
        recordingId: 'rec-123',
        inputSource: 'microphone',
      });
      
      expect(handler).toHaveBeenCalledWith({
        recordingId: 'rec-123',
        inputSource: 'microphone',
      });
    });

    it('should handle meeting events', () => {
      const handler = vi.fn();
      eventBus.on('meeting:deleted', handler);
      
      eventBus.emit('meeting:deleted', { meetingId: 'meeting-456' });
      
      expect(handler).toHaveBeenCalledWith({ meetingId: 'meeting-456' });
    });
  });
});

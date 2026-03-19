import { describe, it, expect } from 'vitest';
import { needsRetrieval } from '../../extensions/tool-orchestrator/intent';

describe('needsRetrieval', () => {
  // ── Zero meetings → always false ──────────────────────────────────────
  describe('when meetingCount is 0', () => {
    it('returns false regardless of message content', () => {
      expect(needsRetrieval('what did we discuss in standup', 0)).toBe(false);
      expect(needsRetrieval('summarize my meetings', 0)).toBe(false);
    });
  });

  // ── Short messages (< 5 chars) → false ────────────────────────────────
  describe('short messages', () => {
    it('returns false for greetings under 5 chars', () => {
      expect(needsRetrieval('hi', 5)).toBe(false);
      expect(needsRetrieval('hey', 5)).toBe(false);
      expect(needsRetrieval('ok', 5)).toBe(false);
    });
  });

  // ── Meeting signals → true ────────────────────────────────────────────
  describe('meeting signals', () => {
    it('detects "meeting" keyword', () => {
      expect(needsRetrieval('what happened in the meeting', 5)).toBe(true);
    });

    it('detects "discuss" keyword', () => {
      expect(needsRetrieval('what did they discuss', 5)).toBe(true);
    });

    it('detects "action items"', () => {
      expect(needsRetrieval('what are the action items', 5)).toBe(true);
      expect(needsRetrieval('list the action item from today', 5)).toBe(true);
    });

    it('detects "standup"', () => {
      expect(needsRetrieval('what did we discuss in standup', 5)).toBe(true);
    });

    it('detects "summary" / "summarize"', () => {
      expect(needsRetrieval('summarize my meetings', 5)).toBe(true);
      expect(needsRetrieval('give me a summary', 5)).toBe(true);
    });

    it('detects "transcript"', () => {
      expect(needsRetrieval('show me the transcript', 5)).toBe(true);
    });

    it('detects time references like "last week"', () => {
      expect(needsRetrieval('what happened last week', 5)).toBe(true);
      expect(needsRetrieval('meetings from last monday', 5)).toBe(true);
    });

    it('detects "yesterday"', () => {
      expect(needsRetrieval('what was discussed yesterday', 5)).toBe(true);
    });

    it('detects "who said" patterns', () => {
      expect(needsRetrieval('who said we should migrate', 5)).toBe(true);
      expect(needsRetrieval('who mentioned the bug', 5)).toBe(true);
    });

    it('detects "what did we" patterns', () => {
      expect(needsRetrieval('what did we decide about the API', 5)).toBe(true);
      expect(needsRetrieval('what did the team agree on', 5)).toBe(true);
    });

    it('detects "follow up"', () => {
      expect(needsRetrieval('any follow-up items', 5)).toBe(true);
      expect(needsRetrieval('followup from last sync', 5)).toBe(true);
    });

    it('detects "assigned"', () => {
      expect(needsRetrieval('what was assigned to me', 5)).toBe(true);
    });

    it('detects "deadline"', () => {
      expect(needsRetrieval('what deadlines were mentioned', 5)).toBe(true);
    });

    it('detects "next steps"', () => {
      expect(needsRetrieval('what are the next steps', 5)).toBe(true);
    });

    it('detects "recap"', () => {
      expect(needsRetrieval('give me a recap of today', 5)).toBe(true);
    });

    it('detects "todos"', () => {
      expect(needsRetrieval('list the todos from last sprint', 5)).toBe(true);
    });
  });

  // ── General signals → false ───────────────────────────────────────────
  describe('general signals (no meeting keywords)', () => {
    it('returns false for greetings', () => {
      expect(needsRetrieval('hello there', 5)).toBe(false);
      expect(needsRetrieval('hey how are you', 5)).toBe(false);
      expect(needsRetrieval('good morning', 5)).toBe(false);
      expect(needsRetrieval('thanks for the help', 5)).toBe(false);
    });

    it('returns false for general knowledge questions', () => {
      expect(needsRetrieval('what is a closure in JavaScript', 5)).toBe(false);
      expect(needsRetrieval('how do I use React hooks', 5)).toBe(false);
      expect(needsRetrieval('explain the observer pattern', 5)).toBe(false);
    });

    it('returns false for creation requests', () => {
      expect(needsRetrieval('write me a haiku about rain', 5)).toBe(false);
      expect(needsRetrieval('create a function that sorts arrays', 5)).toBe(false);
      expect(needsRetrieval('generate a random password', 5)).toBe(false);
      expect(needsRetrieval('calculate 2 + 2', 5)).toBe(false);
    });

    it('returns false for help requests', () => {
      expect(needsRetrieval('help me debug this code', 5)).toBe(false);
      expect(needsRetrieval('can you explain TypeScript generics', 5)).toBe(false);
      expect(needsRetrieval('please format this JSON', 5)).toBe(false);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('meeting signal takes priority over general signal', () => {
      // "what is" is general, but "meeting" is a meeting signal — should return true
      expect(needsRetrieval('what is the meeting about', 5)).toBe(true);
    });

    it('false positive is acceptable: "meeting room booking" triggers retrieval', () => {
      expect(needsRetrieval('meeting room booking system design', 5)).toBe(true);
    });

    it('defaults to true for ambiguous messages (no signal matches)', () => {
      expect(needsRetrieval('tell John about the project status', 5)).toBe(true);
    });

    it('handles whitespace and casing', () => {
      expect(needsRetrieval('  WHAT DID WE DISCUSS  ', 5)).toBe(true);
      expect(needsRetrieval('  HELLO  ', 5)).toBe(false);
    });

    it('returns false for "whats 2+2" (general, no signals)', () => {
      expect(needsRetrieval("what's 2+2", 5)).toBe(false);
    });
  });
});

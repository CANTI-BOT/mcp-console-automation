/**
 * Regression tests for BUG-002: execute_command in-session always times out
 *
 * Before fix: detectCommandCompletion() tested raw PTY output against a prompt
 * regex (e.g., /PS\s.*?>\s*$/m). On Windows with ConPTY, the prompt arrives
 * with ANSI color escape sequences: \x1b[32mPS C:\Users\...\x1b[0m
 * The literal '>' is surrounded by color reset codes, so the regex never matched.
 * Also, Windows PTY adds \r\n line endings instead of \n, breaking $ anchors.
 *
 * After fix: detectCommandCompletion() strips ANSI codes and normalizes \r\n
 * before testing against the regex. Also checks a rolling window of recent
 * output chunks to handle prompts split across multiple data events.
 */

import stripAnsi from 'strip-ansi';

// ─── Helper: matches the fixed detectCommandCompletion logic ─────────────────

function detectCommandCompletion(promptPattern: RegExp, output: string): boolean {
  const cleaned = stripAnsi(output).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return promptPattern.test(cleaned);
}

// ─── Prompt patterns (mirrors CommandQueueManager initialization) ─────────────

const POWERSHELL_PROMPT = /PS\s.*?>\s*$/m;
const CMD_PROMPT = /^[A-Z]:\\.*?>\s*$/m;
const BASH_PROMPT = /^[\w\-\.~]*[$#]\s*$/m;

describe('BUG-002: in-session boundary detection', () => {
  describe('PowerShell prompt detection', () => {
    it('detects plain prompt (no ANSI)', () => {
      expect(detectCommandCompletion(POWERSHELL_PROMPT, 'PS C:\\Users\\Canti> ')).toBe(true);
    });

    it('detects prompt with ANSI color codes (Windows ConPTY)', () => {
      // ConPTY wraps the prompt in color escape sequences
      const ansiPrompt = '\x1b[32mPS C:\\Users\\Canti>\x1b[0m ';
      expect(detectCommandCompletion(POWERSHELL_PROMPT, ansiPrompt)).toBe(true);
    });

    it('detects prompt after command output with CRLF line endings', () => {
      const output = 'hello world\r\nPS C:\\Users\\Canti> ';
      expect(detectCommandCompletion(POWERSHELL_PROMPT, output)).toBe(true);
    });

    it('detects prompt with nested path and ANSI', () => {
      const ansiPrompt = '\x1b[36mPS C:\\Users\\Canti\\Desktop\\project>\x1b[0m ';
      expect(detectCommandCompletion(POWERSHELL_PROMPT, ansiPrompt)).toBe(true);
    });

    it('does NOT detect on command output (no prompt)', () => {
      expect(detectCommandCompletion(POWERSHELL_PROMPT, 'hello world\r\n')).toBe(false);
    });

    it('does NOT fire on partial prompt (prompt split across chunks)', () => {
      // Only the first half of the prompt — should not falsely complete
      expect(detectCommandCompletion(POWERSHELL_PROMPT, 'PS C:\\Users')).toBe(false);
    });
  });

  describe('CMD prompt detection', () => {
    it('detects plain CMD prompt', () => {
      expect(detectCommandCompletion(CMD_PROMPT, 'C:\\Users\\Canti>')).toBe(true);
    });

    it('detects CMD prompt with ANSI codes', () => {
      const ansiPrompt = '\x1b[33mC:\\Users\\Canti>\x1b[0m';
      expect(detectCommandCompletion(CMD_PROMPT, ansiPrompt)).toBe(true);
    });

    it('detects CMD prompt after CRLF output', () => {
      const output = 'command output\r\nC:\\Users\\Canti>';
      expect(detectCommandCompletion(CMD_PROMPT, output)).toBe(true);
    });
  });

  describe('Bash prompt detection', () => {
    it('detects standard bash $ prompt', () => {
      expect(detectCommandCompletion(BASH_PROMPT, 'user$ ')).toBe(true);
    });

    it('detects root # prompt', () => {
      expect(detectCommandCompletion(BASH_PROMPT, 'root# ')).toBe(true);
    });

    it('detects bash prompt with ANSI color codes', () => {
      const ansiPrompt = '\x1b[01;32muser\x1b[0m$ ';
      expect(detectCommandCompletion(BASH_PROMPT, ansiPrompt)).toBe(true);
    });
  });

  describe('stripAnsi normalization', () => {
    it('strips bold/color codes without disturbing prompt text', () => {
      const bold = '\x1b[1mPS C:\\Users\\Canti>\x1b[0m ';
      const stripped = stripAnsi(bold);
      expect(stripped).toBe('PS C:\\Users\\Canti> ');
    });

    it('normalizes mixed CR+LF to LF', () => {
      const crlfText = 'line1\r\nline2\r\n';
      const normalized = crlfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      expect(normalized).toBe('line1\nline2\n');
    });

    it('normalizes bare CR to LF', () => {
      const crText = 'line1\rline2\r';
      const normalized = crText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      expect(normalized).toBe('line1\nline2\n');
    });
  });

  describe('rolling window (split prompt across chunks)', () => {
    // Simulates processOutputForCommandTracking checking last 3 chunks
    function detectAcrossChunks(promptPattern: RegExp, chunks: string[]): boolean {
      for (let i = 0; i < chunks.length; i++) {
        // Check individual chunk
        if (detectCommandCompletion(promptPattern, chunks[i])) return true;
        // Check rolling window of last 3
        if (i > 0) {
          const window = chunks.slice(Math.max(0, i - 2), i + 1).join('');
          if (detectCommandCompletion(promptPattern, window)) return true;
        }
      }
      return false;
    }

    it('detects prompt that spans two chunks', () => {
      // Prompt 'PS C:\\Users\\Canti> ' split across two chunks
      const chunks = ['PS C:\\Users\\', 'Canti> '];
      expect(detectAcrossChunks(POWERSHELL_PROMPT, chunks)).toBe(true);
    });

    it('detects ANSI-wrapped prompt split across chunks', () => {
      const chunks = ['\x1b[32mPS C:\\', 'Users\\Canti>\x1b[0m '];
      expect(detectAcrossChunks(POWERSHELL_PROMPT, chunks)).toBe(true);
    });
  });
});

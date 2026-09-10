/** Crisis / self-harm language detection for mandatory escalation. Never provides methods. */

const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill\s+my\s*self|killing\s+myself|end\s+my\s+life|take\s+my\s+life)\b/i,
  /\b(suicid(e|al)|want\s+to\s+die|wish\s+i\s+(was|were)\s+dead)\b/i,
  /\b(self[-\s]?harm|hurt\s+myself|cutting\s+myself)\b/i,
  /\b(no\s+reason\s+to\s+live|better\s+off\s+dead)\b/i,
  /\b(plan\s+to\s+(die|kill)|going\s+to\s+kill\s+myself)\b/i,
];

export function detectCrisisLanguage(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

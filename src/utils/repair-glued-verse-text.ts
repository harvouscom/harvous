/**
 * Repair verse text whose words were glued together when poetry line-breaks were stripped
 * on import without inserting a space.
 *
 * Safe, iterative patterns only. All-lowercase fusions that a dictionary cannot uniquely
 * split (`voiceand`) are listed explicitly — a generic function-word regex false-positives
 * inside real words.
 */

const MANUAL_FUSIONS: Array<[RegExp, string]> = [
  [/\bvoiceand\b/g, 'voice and'],
  [/\bVoiceand\b/g, 'Voice and'],
  [/\bheardmy\b/g, 'heard my'],
  [/\bHeardmy\b/g, 'Heard my'],
  [/\bskyfrom\b/g, 'sky from'],
  [/\bSkyfrom\b/g, 'Sky from'],
];

export function repairGluedVerseText(text: string): string {
  if (!text) return text;
  let prev = '';
  let current = text;
  while (current !== prev) {
    prev = current;
    current = current.replace(/([.!?])([A-Za-z])/g, '$1 $2');
    current = current.replace(/([,;:])([A-Za-z])/g, '$1 $2');
    current = current.replace(/([a-z])([A-Z])/g, '$1 $2');
    for (const [pattern, replacement] of MANUAL_FUSIONS) {
      current = current.replace(pattern, replacement);
    }
  }
  return current;
}

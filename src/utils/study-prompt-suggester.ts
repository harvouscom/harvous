/**
 * Context-aware study prompts — port of native `StudyPromptSuggester.questions(forSnippet:)`.
 */

export function studyPromptQuestionsForSnippet(snippet: string, detectedRefs: string[] = []): string[] {
  const lower = snippet.toLowerCase();
  const prompts: string[] = [];

  const godsCharacter =
    lower.includes('god') ||
    lower.includes('lord') ||
    lower.includes('jesus') ||
    lower.includes('christ') ||
    lower.includes('father');
  prompts.push(
    godsCharacter ? "What does this reveal about God's character?" : 'What does this show about God?',
  );

  const imperativeWords = ['command', 'shall ', 'must ', 'obey', 'do not', 'do this', 'be holy', 'repent', 'follow'];
  const isImperative = imperativeWords.some((w) => lower.includes(w));
  prompts.push(
    isImperative ? 'What is God calling me to do in response?' : 'How should I respond to this today?',
  );

  const prayerWords = ['fear', 'trust', 'hope', 'pray', 'peace', 'anxiety', 'worry', 'joy', 'thankful', 'praise'];
  const hasPrayerContext = prayerWords.some((w) => lower.includes(w));
  if (hasPrayerContext || detectedRefs.length >= 2) {
    prompts.push('How can I bring this before God in prayer?');
  }

  return prompts;
}

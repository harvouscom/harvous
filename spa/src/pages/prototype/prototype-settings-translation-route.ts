import { isDedicatedPrototypeHost } from '@/lib/prototype-path';

export function prototypeSettingsTranslationRouteTo(): '/prototype/settings/translation' {
  return (isDedicatedPrototypeHost() ? '/settings/translation' : '/prototype/settings/translation') as '/prototype/settings/translation';
}

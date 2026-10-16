import { isDedicatedPrototypeHost } from '@/lib/prototype-path';

export function prototypeSettingsBibleRouteTo(): '/prototype/settings/bible' {
  return (isDedicatedPrototypeHost() ? '/settings/bible' : '/prototype/settings/bible') as '/prototype/settings/bible';
}

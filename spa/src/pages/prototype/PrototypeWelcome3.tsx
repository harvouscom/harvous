/**
 * Decides whether the Harvous 3 welcome belongs on screen, and remembers the answer.
 *
 * Split from the sheet the way `PrototypeFounderLetterPill` is split from its sheet: the
 * eligibility rules and the storage key live here, and the sheet stays a thing that can be
 * rendered on demand — by the design gallery, which has no interest in whether this browser
 * happens to be an upgrade.
 *
 * Device-local, like the founder letter and the install card. It reappearing once on a second
 * browser is a shrug rather than a bug, and the alternative is a schema field for a message
 * with a shelf life of one release.
 *
 * ## Two ways in
 *
 * It shows itself once, to an upgrader. After that the what's-new row in Activity can ask for
 * it back, and that request is honoured for anyone — someone who arrived new at 3.0 and
 * deliberately pressed a row saying "what's new in Harvous" should get the answer, even though
 * nothing changed underneath them. The automatic showing is the part that needs a gate; a
 * press is its own justification.
 */
import {
  PROTO_UPGRADED_FROM_2_KEY,
  PROTO_WELCOME_3_DISMISSED_KEY,
  PROTO_WELCOME_3_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useCallback, useEffect, useState } from 'react';
import PrototypeWelcome3Sheet from './PrototypeWelcome3Sheet';
import { readDismissFlag, useDismissibleFlag } from './useDismissibleFlag';
import { onWelcome3OpenRequest } from './welcome3-bridge';

/**
 * Whether this browser was running Harvous before 3.0.
 *
 * Only ever a read. The value is latched by `public/scripts/prototype-route-boot.js` before
 * this bundle loads, because by the time React could ask, this build has already written
 * enough of its own keys to make the answer yes for everybody.
 */
function upgradedFromV2(): boolean {
  try {
    return localStorage.getItem(PROTO_UPGRADED_FROM_2_KEY) === '1';
  } catch {
    return false;
  }
}

type Props = {
  /** Signed in, and not a guest. Guests have no 2.0 to be welcomed from. */
  enabled: boolean;
};

export default function PrototypeWelcome3({ enabled }: Props) {
  /* `useDismissibleFlag` checks its preview key only after `eligible` passes, so the escape
     hatch has to lift eligibility too — otherwise previewing this would mean first forging a
     2.0 history for the browser you are testing in. */
  const previewing = import.meta.env.DEV && readDismissFlag(PROTO_WELCOME_3_PREVIEW_KEY);

  const [shownItself, dismiss] = useDismissibleFlag(PROTO_WELCOME_3_DISMISSED_KEY, {
    previewKey: PROTO_WELCOME_3_PREVIEW_KEY,
    eligible: previewing || (enabled && upgradedFromV2()),
  });

  const [askedFor, setAskedFor] = useState(false);
  useEffect(() => onWelcome3OpenRequest(() => setAskedFor(true)), []);

  /* Closing always records the flag, even when the sheet was asked for rather than offered:
     having read it by hand is still having read it, and the automatic showing would otherwise
     be waiting on the next load for someone who has already seen the thing. */
  const close = useCallback(() => {
    setAskedFor(false);
    dismiss();
  }, [dismiss]);

  return <PrototypeWelcome3Sheet open={shownItself || askedFor} onDismiss={close} />;
}

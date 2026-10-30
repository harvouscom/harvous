/**
 * The church hub's "Get your church set up" card — which steps, in what order.
 *
 * Derived only from things the hub already knows; nothing here is recorded. A
 * step appears only for someone who holds the capability to do it, so a teacher
 * never sees "Set your service times" they cannot act on. Order is the order a
 * church actually needs things in: the clock sermons are scheduled into, a room
 * to publish in, what people write from, the plan, the first thing sent, then
 * the congregation invited to read it — inviting before anything is published
 * would land people on an empty feed.
 */
export type ChurchSetupStepId = 'times' | 'channel' | 'starter' | 'plan' | 'publish' | 'invite';

export type ChurchSetupStep = {
  id: ChurchSetupStepId;
  title: string;
  meta: string;
  done: boolean;
};

export type ChurchSetupInput = {
  can: {
    manageSettings: boolean;
    createChannel: boolean;
    manageTemplates: boolean;
    managePlan: boolean;
    /** Any staff member may hand out the join link (making one is admin-only, inside the pane). */
    shareInvite: boolean;
  };
  has: {
    serviceTimes: boolean;
    channel: boolean;
    starter: boolean;
    plannedService: boolean;
    published: boolean;
    /** Someone has joined through the church's link — the only proof it reached anyone. */
    joinedByLink: boolean;
  };
};

export function churchSetupSteps({ can, has }: ChurchSetupInput): ChurchSetupStep[] {
  const steps: ChurchSetupStep[] = [];
  if (can.manageSettings) {
    steps.push({ id: 'times', title: 'Add your service times', meta: 'What sermons are scheduled into', done: has.serviceTimes });
  }
  if (can.createChannel) {
    steps.push({ id: 'channel', title: 'Create a channel', meta: 'Where your congregation follows along', done: has.channel });
  }
  if (can.manageTemplates) {
    steps.push({ id: 'starter', title: 'Write a sermon-notes template', meta: 'What people start their notes from', done: has.starter });
  }
  if (can.managePlan) {
    steps.push({ id: 'plan', title: 'Plan a Sunday', meta: 'Shows up as This Sunday on Home', done: has.plannedService });
  }
  if (can.createChannel) {
    steps.push({ id: 'publish', title: 'Publish something', meta: 'A note in a channel reaches every follower', done: has.published });
  }
  if (can.shareInvite) {
    steps.push({ id: 'invite', title: 'Invite your congregation', meta: 'Share the link or QR code', done: has.joinedByLink });
  }
  return steps;
}

/** Show the card while there is something left to do and it hasn't been put away. */
export function shouldShowChurchSetup(steps: readonly ChurchSetupStep[], dismissed: boolean): boolean {
  if (dismissed || steps.length === 0) return false;
  return steps.some((step) => !step.done);
}

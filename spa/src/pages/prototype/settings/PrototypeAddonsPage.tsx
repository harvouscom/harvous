import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import SafeSubscriptionDetailsButton from '@/components/react/SafeSubscriptionDetailsButton';
import { getSharedSpacesAddonFeatureBullets } from '@/lib/shared-spaces-limits';
import {
  formatPlanPrice,
  planFor,
  PLUS_COMING_SOON_FEATURE_BULLETS,
  PLUS_FOUNDING_BADGE,
  type PlanDefinition,
} from '@/lib/billing-plans';
import { toast } from '@/utils/toast';
import {
  formatBillingIntervalLabel,
  formatBillingPeriodDate,
  formatBillingPriceLine,
  formatBillingStatusLine,
  formatOrderAmount,
  formatPaymentMethodLabel,
} from '../../../lib/billing-manage-copy';
import { useBillingCancel } from '../../../hooks/mutations/useBillingCancel';
import { useBillingManage } from '../../../hooks/queries/useBillingManage';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { api } from '../../../lib/api';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';

const monthPlan = planFor('plus', 'month');
const yearPlan = planFor('plus', 'year');

const PLAN_NAME = yearPlan?.name ?? monthPlan?.name ?? 'Harvous Plus';

function priceSummary(...plans: Array<PlanDefinition | null>): string {
  return plans
    .filter((plan): plan is PlanDefinition => Boolean(plan))
    .map((plan) => `${formatPlanPrice(plan)}${plan.interval === 'year' ? '/yr' : '/mo'}`)
    .join(' · ');
}

const PRICE_SUMMARY = priceSummary(monthPlan, yearPlan);

/** Badge helper retained for tests / join-state copy. */
export function resolveSharedSpacesAddonBadge(options: {
  hasSharedSpaces: boolean;
  memberOfCount: number;
}): string | undefined {
  if (options.hasSharedSpaces) return 'Active';
  if (options.memberOfCount <= 0) return undefined;
  return options.memberOfCount === 1 ? 'In 1 space' : `In ${options.memberOfCount} spaces`;
}

function PlanFeatureList({
  items,
  comingSoon = false,
}: {
  items: readonly string[];
  comingSoon?: boolean;
}) {
  return (
    <ul
      className={
        comingSoon
          ? 'proto-settings-plan-features proto-settings-plan-features--coming'
          : 'proto-settings-plan-features'
      }
      role="list"
    >
      {items.map((bullet) => (
        <li key={bullet}>
          <span className="proto-accent-check-orb" aria-hidden="true">
            <Icon name="check" size={9} />
          </span>
          <span className="proto-settings-plan-features__text">{bullet}</span>
        </li>
      ))}
    </ul>
  );
}

function ManageSectionLabel({ children }: { children: string }) {
  return <p className="proto-settings-plan-features__coming-label proto-settings-plan__section-label">{children}</p>;
}

/**
 * Settings > Plan — active Harvous Plus summary + in-app billing manage,
 * or a path to upgrade.
 */
export default function PrototypeAddonsPage() {
  const navigate = useNavigate();
  const { data: subscription } = useSubscriptionStatus();
  const cancelBilling = useBillingCancel();
  const hasSharedSpaces = Boolean(subscription?.hasSharedSpaces);
  const canManageBilling = Boolean(subscription?.canManageBilling);
  const { data: manage, isLoading: manageLoading } = useBillingManage(
    hasSharedSpaces && canManageBilling,
  );
  const isFounding = Boolean(subscription?.isFounding);
  const billing = manage?.billing ?? subscription?.billing ?? null;
  const paymentMethod = manage?.paymentMethod ?? null;
  const orders = manage?.orders ?? [];
  const featureBullets = getSharedSpacesAddonFeatureBullets({
    hasAddOn: hasSharedSpaces,
    ownedCount: hasSharedSpaces ? (subscription?.sharedSpacesOwnedCount ?? null) : null,
    ownedLimit: subscription?.sharedSpacesOwnedLimit ?? null,
  });

  const cancelAnchorRef = useRef<HTMLDivElement | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);

  const planSublabel = (() => {
    // Deliberately not "Founding price" here — founding is capped at 99 and may
    // already be gone. /upgrade owns that claim, where availability is live.
    if (!hasSharedSpaces) {
      // No Challenges here either: it is in WITHHELD_FEATURES, so no purchase
      // surface may name it. See SHARED_SPACES_ADDON_FEATURE_BULLETS.
      return PRICE_SUMMARY || 'Unlock Review, unlimited history, and hosting';
    }
    if (billing) {
      const status = formatBillingStatusLine(billing);
      const price = formatBillingPriceLine(billing);
      return `${status} · ${price}`;
    }
    if (canManageBilling) return 'Active on your account';
    return 'Active · Managed by Harvous';
  })();

  async function openOrderReceipt(orderId: string) {
    if (receiptBusyId) return;
    setReceiptBusyId(orderId);
    try {
      const { url } = await api.get<{ url?: string }>(`/api/billing/orders/${orderId}/receipt`);
      if (!url) throw new Error('Receipt unavailable');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open receipt');
    } finally {
      setReceiptBusyId(null);
    }
  }

  return (
    <SettingsShell>
      <div className="proto-settings-plan">
        <SettingsGroup>
          <SettingsRow
            label={PLAN_NAME}
            sublabel={planSublabel}
            leadingIcon="plus"
            leadingClassName="proto-settings-list-row__leading--plus"
            badge={
              hasSharedSpaces ? (isFounding ? PLUS_FOUNDING_BADGE : 'Active') : undefined
            }
            onClick={hasSharedSpaces ? undefined : () => navigate({ to: '/upgrade' })}
            trailing={hasSharedSpaces ? 'none' : 'chevron'}
          />
        </SettingsGroup>

        <div className="proto-settings-plan__body">
          <PlanFeatureList items={featureBullets} />


          {/* Empty since 3.0 — see the constant. A heading with no list under it reads as a
              rendering bug, not as restraint. */}
          {PLUS_COMING_SOON_FEATURE_BULLETS.length > 0 ? (
            <>
              <p className="proto-settings-plan-features__coming-label">Coming soon</p>
              <PlanFeatureList items={PLUS_COMING_SOON_FEATURE_BULLETS} comingSoon />
            </>
          ) : null}

          {!hasSharedSpaces ? (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--primary proto-settings-plan__cta"
              onClick={() => navigate({ to: '/upgrade' })}
            >
              Get {PLAN_NAME}
            </button>
          ) : null}
        </div>

        {hasSharedSpaces && canManageBilling ? (
          <div className="proto-settings-plan__manage">
            <ManageSectionLabel>Subscription</ManageSectionLabel>
            <SettingsGroup>
              <SettingsRow
                label="Status"
                value={
                  billing
                    ? formatBillingStatusLine(billing)
                    : manageLoading
                      ? 'Loading…'
                      : 'Active'
                }
                trailing="none"
              />
              <SettingsRow
                label="Price"
                value={billing ? formatBillingPriceLine(billing) : '—'}
                trailing="none"
              />
              <SettingsRow
                label="Billing period"
                value={billing ? formatBillingIntervalLabel(billing.interval) : '—'}
                trailing="none"
              />
              {billing?.cancelAtPeriodEnd ? (
                <SettingsRow
                  label="Access through"
                  value={formatBillingPeriodDate(billing.currentPeriodEnd)}
                  sublabel="Your plan stays active until this date."
                  trailing="none"
                />
              ) : null}
            </SettingsGroup>

            <ManageSectionLabel>Payment</ManageSectionLabel>
            <SettingsGroup>
              <SafeSubscriptionDetailsButton publishableKey={null}>
                <SettingsRow
                  label="Payment method"
                  value={
                    manageLoading && !paymentMethod
                      ? 'Loading…'
                      : formatPaymentMethodLabel(paymentMethod)
                  }
                  sublabel="Update card on Polar’s secure page"
                  trailing="chevron"
                  onClick={() => undefined}
                />
              </SafeSubscriptionDetailsButton>
            </SettingsGroup>

            <ManageSectionLabel>Billing history</ManageSectionLabel>
            <SettingsGroup>
              {manageLoading && orders.length === 0 ? (
                <SettingsRow label="Loading charges…" trailing="none" />
              ) : orders.length === 0 ? (
                <SettingsRow label="No charges yet" trailing="none" />
              ) : (
                orders.map((order) => (
                  <SettingsRow
                    key={order.id}
                    label={formatBillingPeriodDate(order.createdAt) || 'Charge'}
                    sublabel={
                      order.invoiceNumber
                        ? `Invoice ${order.invoiceNumber}`
                        : order.hasInvoice
                          ? 'Receipt available'
                          : undefined
                    }
                    value={formatOrderAmount(order.amountCents, order.currency)}
                    trailing="chevron"
                    disabled={receiptBusyId === order.id}
                    onClick={() => void openOrderReceipt(order.id)}
                  />
                ))
              )}
            </SettingsGroup>

            <ManageSectionLabel>Manage</ManageSectionLabel>
            <SettingsGroup>
              {billing?.cancelAtPeriodEnd ? (
                <SettingsRow
                  label="Keep Plus"
                  sublabel={`Access continues until ${formatBillingPeriodDate(billing.currentPeriodEnd)}`}
                  onClick={() => {
                    if (!cancelBilling.isPending) {
                      cancelBilling.mutate({ cancelAtPeriodEnd: false });
                    }
                  }}
                  disabled={cancelBilling.isPending}
                  trailing="none"
                />
              ) : (
                <div ref={cancelAnchorRef} className="proto-settings-plan__cancel-wrap">
                  <SettingsRow
                    label={`Cancel ${PLAN_NAME}`}
                    sublabel="You’ll keep access until the end of the period."
                    destructive
                    trailing="none"
                    disabled={cancelBilling.isPending || !billing}
                    onClick={() => setCancelOpen(true)}
                  />
                </div>
              )}
            </SettingsGroup>
          </div>
        ) : null}

      </div>

      {(() => {
        if (!cancelOpen || !billing || billing.cancelAtPeriodEnd) return null;
        const until = formatBillingPeriodDate(billing.currentPeriodEnd);
        return (
          <ProtoConfirmDialog
            anchorEl={cancelAnchorRef.current}
            preferAbove
            title={`Cancel ${PLAN_NAME}?`}
            description={`You’ll keep access until ${until}. Shared Spaces you own stay until then, and history older than 90 days is kept, just hidden.`}
            confirmLabel="Cancel plan"
            cancelLabel="Keep"
            busy={cancelBilling.isPending}
            onConfirm={() => {
              cancelBilling.mutate(
                { cancelAtPeriodEnd: true },
                { onSettled: () => setCancelOpen(false) },
              );
            }}
            onCancel={() => {
              if (!cancelBilling.isPending) setCancelOpen(false);
            }}
          />
        );
      })()}
    </SettingsShell>
  );
}

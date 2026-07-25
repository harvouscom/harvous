import { describe, expect, it } from 'vitest';
import { mapPolarOrder, mapPolarPaymentMethod } from '../polar-billing';

describe('mapPolarPaymentMethod', () => {
  it('prefers the default card and title-cases brand', () => {
    expect(
      mapPolarPaymentMethod([
        {
          type: 'card',
          isDefault: false,
          methodMetadata: { brand: 'mastercard', last4: '1111' },
        },
        {
          type: 'card',
          isDefault: true,
          methodMetadata: { brand: 'visa', last4: '4242' },
        },
      ]),
    ).toEqual({ brand: 'Visa', last4: '4242' });
  });

  it('returns null when no card methods exist', () => {
    expect(mapPolarPaymentMethod([{ type: 'link', methodMetadata: null }])).toBeNull();
    expect(mapPolarPaymentMethod([])).toBeNull();
  });
});

describe('mapPolarOrder', () => {
  it('maps paid order fields for history rows', () => {
    expect(
      mapPolarOrder({
        id: 'ord_1',
        createdAt: '2026-07-01T00:00:00.000Z',
        totalAmount: 4500,
        currency: 'usd',
        invoiceNumber: 'INV-9',
        isInvoiceGenerated: true,
      }),
    ).toEqual({
      id: 'ord_1',
      createdAt: '2026-07-01T00:00:00.000Z',
      amountCents: 4500,
      currency: 'USD',
      invoiceNumber: 'INV-9',
      hasInvoice: true,
    });
  });

  it('returns null without id or createdAt', () => {
    expect(mapPolarOrder({ totalAmount: 100 })).toBeNull();
  });
});

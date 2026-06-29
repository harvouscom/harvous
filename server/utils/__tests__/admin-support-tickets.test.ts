import { describe, it, expect } from 'vitest';
import {
  validateCreateSupportTicketInput,
  isSupportTicketStatus,
} from '../support-ticket';
import {
  validatePatchSupportTicketInput,
  parseSupportTicketListFilter,
} from '../admin-support-tickets';

describe('support-ticket validation', () => {
  it('accepts valid create payload', () => {
    expect(
      validateCreateSupportTicketInput({
        message: '  Hello there  ',
        topic: 'Bug',
        appVersion: '1.2.3',
        pageUrl: 'https://app.harvous.com/settings/support',
        clientEnvironment: 'Desktop · macOS 14.2 · Chrome 120',
      }),
    ).toEqual({
      message: 'Hello there',
      topic: 'Bug',
      appVersion: '1.2.3',
      pageUrl: 'https://app.harvous.com/settings/support',
      clientEnvironment: 'Desktop · macOS 14.2 · Chrome 120',
    });
  });

  it('rejects empty or oversized message', () => {
    expect(validateCreateSupportTicketInput({ message: '   ' })).toBeNull();
    expect(validateCreateSupportTicketInput({ message: 'x'.repeat(5001) })).toBeNull();
  });

  it('rejects invalid topic', () => {
    expect(validateCreateSupportTicketInput({ message: 'Hi', topic: 'Complaint' })).toBeNull();
  });

  it('validates status values', () => {
    expect(isSupportTicketStatus('open')).toBe(true);
    expect(isSupportTicketStatus('closed')).toBe(true);
    expect(isSupportTicketStatus('pending')).toBe(false);
  });

  it('validates patch payload', () => {
    expect(validatePatchSupportTicketInput({ status: 'closed' })).toEqual({ status: 'closed' });
    expect(validatePatchSupportTicketInput({ adminNote: 'Follow up Monday' })).toEqual({
      adminNote: 'Follow up Monday',
    });
    expect(validatePatchSupportTicketInput({ read: false })).toEqual({ read: false });
    expect(validatePatchSupportTicketInput({ read: true })).toEqual({ read: true });
    expect(validatePatchSupportTicketInput({})).toBeNull();
    expect(validatePatchSupportTicketInput({ status: 'invalid' })).toBeNull();
    expect(validatePatchSupportTicketInput({ read: 'yes' })).toBeNull();
  });
});

describe('parseSupportTicketListFilter', () => {
  it('defaults to open', () => {
    expect(parseSupportTicketListFilter(undefined)).toBe('open');
    expect(parseSupportTicketListFilter('')).toBe('open');
  });

  it('accepts closed and all', () => {
    expect(parseSupportTicketListFilter('closed')).toBe('closed');
    expect(parseSupportTicketListFilter('all')).toBe('all');
  });
});

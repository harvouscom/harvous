import { describe, expect, it } from 'vitest';
import {
  normalizePrototypeApiSpaceId,
  toPrototypeSpaceSearchParam,
} from '../prototype-space-api-id';

describe('prototype space URL helpers', () => {
  it('normalizes bare and prefixed ids for APIs', () => {
    expect(normalizePrototypeApiSpaceId('1785')).toBe('space_1785');
    expect(normalizePrototypeApiSpaceId('space_1785')).toBe('space_1785');
    expect(normalizePrototypeApiSpaceId('')).toBeUndefined();
    expect(normalizePrototypeApiSpaceId(null)).toBeUndefined();
  });

  it('strips the space_ prefix for ?space= search params', () => {
    expect(toPrototypeSpaceSearchParam('space_1785')).toBe('1785');
    expect(toPrototypeSpaceSearchParam('1785')).toBe('1785');
    expect(toPrototypeSpaceSearchParam('')).toBeUndefined();
    expect(toPrototypeSpaceSearchParam(null)).toBeUndefined();
  });

  it('strips legacy JSON quotes from address-bar values', () => {
    expect(toPrototypeSpaceSearchParam('"1785269710187"')).toBe('1785269710187');
    expect(normalizePrototypeApiSpaceId('"1785269710187"')).toBe('space_1785269710187');
  });
});

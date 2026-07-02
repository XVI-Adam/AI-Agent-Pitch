import { describe, it, expect } from 'vitest';
import { scoreColor } from '../utils/scoreColor';

describe('scoreColor', () => {
  it('is "good" at and above the 7 boundary', () => {
    expect(scoreColor(7)).toBe('good');
    expect(scoreColor(10)).toBe('good');
  });

  it('is "mid" for 5 and 6', () => {
    expect(scoreColor(6)).toBe('mid');
    expect(scoreColor(5)).toBe('mid');
  });

  it('is "low" at and below the 4 boundary', () => {
    expect(scoreColor(4)).toBe('low');
    expect(scoreColor(1)).toBe('low');
  });
});

export type ScoreTier = 'good' | 'mid' | 'low';

export function scoreColor(score: number): ScoreTier {
  if (score >= 7) return 'good';
  if (score >= 5) return 'mid';
  return 'low';
}

import type { FitCategory, FitCategoryScore, FitReport } from '../../src/types/fit';

const REQUIRED_CATEGORIES: FitCategory[] = [
  'tech_stack',
  'experience_level',
  'seniority',
  'domain_fit',
  'working_style',
];

function isFiniteScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readCategory(raw: unknown): FitCategoryScore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!isFiniteScore(obj.score) || !isNonEmptyString(obj.rationale)) return null;
  return { score: obj.score, rationale: obj.rationale.trim() };
}

// Rejects rather than clamps/pads — a payload that doesn't fully match the
// schema is treated as a parse failure, not silently coerced into one.
export function validateFitReport(data: unknown): FitReport | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;

  if (!isFiniteScore(obj.overall_score)) return null;

  if (typeof obj.categories !== 'object' || obj.categories === null) return null;
  const rawCategories = obj.categories as Record<string, unknown>;

  const categories: Partial<FitReport['categories']> = {};
  for (const key of REQUIRED_CATEGORIES) {
    const category = readCategory(rawCategories[key]);
    if (!category) return null;
    categories[key] = category;
  }

  if (!Array.isArray(obj.gaps) || obj.gaps.length < 1 || obj.gaps.length > 3) return null;
  const gaps: string[] = [];
  for (const gap of obj.gaps) {
    if (!isNonEmptyString(gap)) return null;
    gaps.push(gap.trim());
  }

  if (!isNonEmptyString(obj.tailored_pitch)) return null;

  return {
    overall_score: obj.overall_score,
    categories: categories as FitReport['categories'],
    gaps,
    tailored_pitch: obj.tailored_pitch.trim(),
  };
}

export interface FitCategoryScore {
  score: number;
  rationale: string;
}

export interface FitReport {
  overall_score: number;
  categories: {
    tech_stack: FitCategoryScore;
    experience_level: FitCategoryScore;
    seniority: FitCategoryScore;
    domain_fit: FitCategoryScore;
    working_style: FitCategoryScore;
  };
  gaps: string[];
  tailored_pitch: string;
}

export type FitCategory = keyof FitReport['categories'];

export const CATEGORY_LABELS: Record<FitCategory, string> = {
  tech_stack: 'Tech Stack',
  experience_level: 'Experience Level',
  seniority: 'Seniority',
  domain_fit: 'Domain Fit',
  working_style: 'Working Style',
};

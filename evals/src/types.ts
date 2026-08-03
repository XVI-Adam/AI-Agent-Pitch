// Shared types for the eval harness. Case YAML is parsed into EvalCase; every
// grader returns a GraderResult so the reporter can print WHAT tripped, not
// just that something did.

export type FactStatus = 'canonical' | 'retired' | 'never_true' | 'unverified';

export interface FactEntry {
  id: string;
  type: string;
  canonical: string;
  aliases: string[];
  status: FactStatus;
  numeric?: number;
  duration_months?: number;
  tolerance_months?: number;
  formula?: string;
  note?: string;
  description?: string;
}

export type Surface = 'chat' | 'fit';
export type Expectation = 'pass' | 'fail' | 'borderline';
export type GroundedMode = 'strict' | 'lenient' | 'off';

export interface AbstentionSpec {
  required: boolean;
  forbidden_assertions?: string[];
  redirect_expected?: boolean;
}

export interface ExactMatchSpec {
  any_of?: Array<{ facts_ref: string }>;
  all_of?: Array<{ facts_ref: string }>;
}

export interface NumericToleranceSpec {
  derived_ref: string;
  unit: 'months' | 'years';
  extract: string;
}

export interface GraderSpec {
  forbidden?: 'default' | string[];
  forbidden_extra?: string[];
  grounded_entities?: GroundedMode;
  max_chars?: number;
  must_include_any?: string[][];
  must_contradict?: boolean;
  must_match_daterange?: string;
  exact_match?: ExactMatchSpec;
  abstention?: AbstentionSpec;
  numeric_tolerance?: NumericToleranceSpec;
  schema?: string;
  score_band?: { overall: [number, number] };
  category_bands?: Record<string, [number, number]>;
  gaps_min?: number;
  evidence_trace?: 'strict' | 'off';
}

export interface JudgeSpec {
  dimensions: string[];
  min: Record<string, number>;
  require_evidence?: boolean;
  rubric_note?: string;
}

export interface Turn {
  user: string;
  graders?: GraderSpec;
}

export interface EvalCase {
  id: string;
  category: string;
  surface: Surface;
  question?: string;
  turns?: Turn[];
  jd_file?: string;
  graders?: GraderSpec;
  judge?: JudgeSpec;
  expect: Expectation;
  facts_ref?: string[];
  notes?: string;
  hypothesis?: string;
  /** Populated by the loader from the filename, for error messages. */
  sourceFile?: string;
}

/** One concrete thing a grader objected to, named precisely enough to act on. */
export interface Finding {
  /** Which grader raised it. */
  grader: string;
  /** Human-readable: "invented entity: Kubernetes". */
  detail: string;
  /** The offending span from the response, when there is one. */
  evidence?: string;
  /** FACTS.md entry id, when the finding traces to one. */
  factId?: string;
}

export interface GraderResult {
  grader: string;
  passed: boolean;
  findings: Finding[];
  /** Set when the grader did not apply to this case. */
  skipped?: boolean;
}

export interface JudgeScore {
  score: number;
  justification: string;
  evidence?: string;
}

export interface JudgeVerdict {
  scores: Record<string, JudgeScore>;
  passed: boolean;
  findings: Finding[];
}

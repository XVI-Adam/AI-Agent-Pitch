import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { EvalCase, Expectation, Surface } from './types';

// Loads and validates evals/cases/*.yaml.
//
// Validation is strict and the messages name the file and case id, because the
// point of keeping cases in hand-editable YAML is that someone edits them
// without reading this file. A typo should say what is wrong, not throw a
// TypeError three modules later.

const CASES_DIR = fileURLToPath(new URL('../cases', import.meta.url));
const JDS_DIR = fileURLToPath(new URL('../jds', import.meta.url));

const VALID_SURFACES = new Set<Surface>(['chat', 'fit']);
const VALID_EXPECTATIONS = new Set<Expectation>(['pass', 'fail', 'borderline']);

export function loadCases(dir = CASES_DIR): EvalCase[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort();
  const cases: EvalCase[] = [];
  const seenIds = new Map<string, string>();

  for (const file of files) {
    const category = basename(file, '.yaml');
    let parsed: unknown;
    try {
      parsed = parse(readFileSync(join(dir, file), 'utf8'));
    } catch (err) {
      throw new Error(`${file}: malformed YAML — ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${file}: expected a list of cases`);

    for (const raw of parsed as Array<Record<string, unknown>>) {
      const evalCase = validateCase(raw, file, category, seenIds);
      cases.push(evalCase);
    }
  }

  if (cases.length === 0) throw new Error(`no cases found in ${dir}`);
  return cases;
}

function validateCase(
  raw: Record<string, unknown>,
  file: string,
  category: string,
  seenIds: Map<string, string>,
): EvalCase {
  const id = raw.id;
  if (typeof id !== 'string' || !id) throw new Error(`${file}: a case is missing an id`);

  const where = `${file}:${id}`;
  const previous = seenIds.get(id);
  if (previous) throw new Error(`duplicate case id "${id}" in ${previous} and ${file}`);
  seenIds.set(id, file);

  if (raw.category !== category) {
    throw new Error(`${where}: category is "${String(raw.category)}" but the file is ${category}.yaml`);
  }

  const surface = raw.surface as Surface;
  if (!VALID_SURFACES.has(surface)) {
    throw new Error(`${where}: surface must be "chat" or "fit", got "${String(raw.surface)}"`);
  }

  const expectation = raw.expect as Expectation;
  if (!VALID_EXPECTATIONS.has(expectation)) {
    throw new Error(`${where}: expect must be pass | fail | borderline, got "${String(raw.expect)}"`);
  }

  const hasQuestion = typeof raw.question === 'string' && raw.question.trim().length > 0;
  const hasTurns = Array.isArray(raw.turns) && raw.turns.length > 0;
  const hasJd = typeof raw.jd_file === 'string' && raw.jd_file.length > 0;

  const inputCount = [hasQuestion, hasTurns, hasJd].filter(Boolean).length;
  if (inputCount === 0) throw new Error(`${where}: needs one of question, turns, or jd_file`);
  if (inputCount > 1) throw new Error(`${where}: has more than one of question, turns, jd_file`);

  if (surface === 'fit' && !hasJd) throw new Error(`${where}: fit cases need a jd_file`);
  if (surface === 'chat' && hasJd) throw new Error(`${where}: jd_file is only valid on fit cases`);

  // A predicted failure without a stated reason is an untriaged bug, not a
  // documented one — the whole value of `expect: fail` is the hypothesis.
  if (expectation !== 'pass' && typeof raw.hypothesis !== 'string') {
    throw new Error(`${where}: expect is "${expectation}" but no hypothesis is recorded`);
  }

  if (hasTurns) {
    for (const [index, turn] of (raw.turns as Array<Record<string, unknown>>).entries()) {
      if (typeof turn?.user !== 'string' || !turn.user.trim()) {
        throw new Error(`${where}: turns[${index}] is missing a user message`);
      }
    }
  }

  return { ...(raw as unknown as EvalCase), sourceFile: file };
}

/** Reads a case's JD from evals/jds/. */
export function loadJobDescription(jdFile: string, dir = JDS_DIR): string {
  const name = jdFile.replace(/^jds\//, '');
  try {
    return readFileSync(join(dir, name), 'utf8').trim();
  } catch {
    throw new Error(`missing job description file: evals/jds/${name}`);
  }
}

/**
 * `--filter=<category|id>` — matches a whole category or a single case, so the
 * same flag serves "re-run everything unanswerable" and "re-run just lq-001".
 */
export function filterCases(cases: EvalCase[], filter: string | undefined): EvalCase[] {
  if (!filter) return cases;
  const needles = filter.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean);
  return cases.filter((c) =>
    needles.some((needle) => c.category.toLowerCase() === needle || c.id.toLowerCase() === needle),
  );
}

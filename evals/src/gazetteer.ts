// Curated entity vocabulary for the grounded-entity grader.
//
// WHY A LIST AND NOT AN NER MODEL: open-ended extraction over a 200-word answer
// either flags every capitalized common noun ("Adam Works Well With Others") or
// needs an LLM call, at which point the "deterministic, runs first, costs
// nothing" property is gone. A closed vocabulary inverts the trade: it can only
// miss things, never false-positive. A missed entity is a case that silently
// passes; a false positive is a harness nobody trusts. Misses are recoverable —
// add the token here — so misses are the right failure direction.
//
// DO NOT ADD a token that is also an ordinary English word. "ramp" (the
// fintech company) fired on "ramping quickly"; bare 'c' and 'r' as language
// names would match a stray letter. A gazetteer earns its keep by never crying
// wolf, and one noisy token costs more than ten missing ones.
//
// ADDING A TOKEN: put it here if a model might plausibly assert it about a
// candidate. It does NOT need to be true; the grader checks each detected token
// against the FACTS.md allowlist. Tokens that ARE true still belong here so the
// alias map gets exercised.

/** Technologies, languages, frameworks, platforms. */
export const TECHNOLOGY_TOKENS = [
  // languages
  'python', 'typescript', 'javascript', 'dart', 'java', 'kotlin', 'swift', 'objective-c',
  'c#', 'c++', 'golang', 'rust', 'ruby', 'php', 'scala', 'elixir', 'haskell',
  'perl', 'matlab', 'sql', 'bash', 'powershell', 'lua', 'solidity',
  // frontend
  'react', 'react native', 'next.js', 'nextjs', 'vue', 'angular', 'svelte', 'solidjs',
  'remix', 'astro', 'jquery', 'ember', 'backbone', 'redux', 'zustand', 'tailwind',
  'bootstrap', 'material ui', 'chakra', 'three.js', 'react three fiber', 'd3',
  'webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'babel', 'storybook',
  // backend / runtime
  'node.js', 'nodejs', 'deno', 'bun', 'express', 'fastify', 'nestjs', 'django', 'flask',
  'fastapi', 'rails', 'laravel', 'spring', 'spring boot', '.net', '.net core', 'asp.net',
  'graphql', 'grpc', 'rest', 'trpc', 'websockets', 'socket.io',
  // mobile
  'flutter', 'ionic', 'cordova', 'xamarin', 'expo', 'swiftui', 'jetpack compose',
  // data / infra
  'postgresql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'cassandra',
  'dynamodb', 'firestore', 'firebase', 'supabase', 'planetscale', 'cockroachdb',
  'elasticsearch', 'opensearch', 'clickhouse', 'snowflake', 'bigquery', 'redshift',
  'prisma', 'drizzle', 'sequelize', 'typeorm', 'sqlalchemy', 'knex',
  'kafka', 'rabbitmq', 'sqs', 'pubsub', 'nats', 'celery', 'airflow', 'dbt', 'spark',
  'hadoop', 'flink', 'databricks',
  // cloud / devops
  'aws', 'ec2', 's3', 'lambda', 'ecs', 'eks', 'fargate', 'cloudfront', 'route53',
  'gcp', 'google cloud', 'azure', 'vercel', 'netlify', 'heroku', 'railway', 'render',
  'fly.io', 'digitalocean', 'cloudflare', 'cloudflare workers',
  'docker', 'kubernetes', 'k8s', 'helm', 'terraform', 'pulumi', 'ansible', 'chef',
  'puppet', 'jenkins', 'circleci', 'travis', 'github actions', 'gitlab ci', 'argocd',
  'istio', 'envoy', 'consul', 'vault', 'nginx', 'apache',
  'prometheus', 'grafana', 'datadog', 'new relic', 'sentry', 'splunk', 'pagerduty',
  'opentelemetry', 'jaeger',
  // ai / ml
  'openai', 'claude api', 'anthropic api', 'groq', 'gemini', 'llama', 'mistral',
  'langchain', 'llamaindex', 'crewai', 'langflow', 'langgraph', 'autogen', 'haystack',
  'tavily', 'pinecone', 'weaviate', 'chroma', 'qdrant', 'faiss',
  'pytorch', 'tensorflow', 'keras', 'jax', 'scikit-learn', 'sklearn', 'xgboost',
  'huggingface', 'transformers', 'cuda', 'triton', 'onnx',
  'mediapipe', 'google ml kit', 'ml kit', 'opencv', 'yolo', 'whisper',
  'pandas', 'numpy', 'scipy', 'matplotlib', 'polars', 'taipy', 'streamlit', 'gradio',
  // testing / tooling
  'vitest', 'jest', 'mocha', 'chai', 'cypress', 'playwright', 'selenium', 'puppeteer',
  'pytest', 'unittest', 'junit', 'xunit', 'nunit', 'testing library',
  'git', 'github', 'gitlab', 'bitbucket', 'cursor', 'vscode', 'jetbrains', 'intellij',
  'figma', 'swagger', 'openapi', 'postman',
  // misc platforms
  'stripe', 'twilio', 'sendgrid', 'auth0', 'clerk', 'okta', 'shopify', 'salesforce',
  'hubspot', 'amplitude', 'mixpanel', 'telegram', 'discord', 'slack',
  'x402', 'usdc', 'coinbase', 'metamask', 'ethereum', 'solana',
];

/** Companies and institutions. */
export const ORGANIZATION_TOKENS = [
  'google', 'meta', 'facebook', 'amazon', 'apple', 'netflix', 'microsoft', 'ibm',
  'oracle', 'salesforce', 'adobe', 'nvidia', 'intel', 'tesla', 'spacex', 'uber',
  'lyft', 'airbnb', 'stripe', 'shopify', 'twilio', 'atlassian',
  'openai', 'anthropic', 'deepmind', 'cohere', 'scale ai', 'databricks', 'snowflake',
  'palantir', 'coinbase', 'robinhood', 'plaid', 'brex', 'datadog', 'mongodb',
  'goldman sachs', 'jpmorgan', 'morgan stanley', 'citadel', 'jane street', 'two sigma',
  'deloitte', 'accenture', 'mckinsey', 'bain', 'bcg', 'infosys', 'tcs', 'cognizant',
  'sigo signs', 'stackedlabs', 'ang esports', 'fractal tech', 'manhattan university',
  'manhattan college', 'columbia', 'nyu', 'mit', 'stanford', 'berkeley', 'carnegie mellon',
  'harvard', 'yale', 'princeton', 'cornell', 'georgia tech', 'waterloo',
];

/** Job titles and seniority markers. */
export const TITLE_TOKENS = [
  'software engineer', 'senior software engineer', 'staff engineer', 'principal engineer',
  'distinguished engineer', 'engineering manager', 'director of engineering', 'vp of engineering',
  'cto', 'ceo', 'coo', 'founder', 'co-founder', 'cofounder', 'founding engineer',
  'tech lead', 'team lead', 'technical lead', 'architect', 'solutions architect',
  'full stack engineer', 'full-stack engineer', 'frontend engineer', 'backend engineer',
  'mobile engineer', 'platform engineer', 'infrastructure engineer', 'devops engineer',
  'site reliability engineer', 'sre', 'data engineer', 'data scientist',
  'machine learning engineer', 'ml engineer', 'research scientist', 'research engineer',
  'forward deployed engineer', 'forward-deployed engineer', 'solutions engineer',
  'sales engineer', 'product engineer', 'product manager', 'program manager',
  'software trainer', 'internal tools developer', 'associate software developer',
  'associate software engineer', 'junior developer', 'intern', 'tournament organizer',
  'consultant', 'contractor', 'freelancer',
];

/** Credentials a model might invent. */
export const CREDENTIAL_TOKENS = [
  'bachelor', "bachelor's", 'b.s.', 'bs', 'ba', 'b.a.', 'master', "master's", 'm.s.',
  'ms', 'mba', 'phd', 'ph.d.', 'doctorate', 'postdoc',
  'computer science', 'computer information systems', 'information systems',
  'software engineering', 'electrical engineering', 'mathematics', 'physics',
  'aws certified', 'gcp certified', 'azure certified', 'cissp', 'pmp', 'scrum master',
  'security clearance', 'top secret', 'ts/sci',
];

export interface GazetteerEntry {
  token: string;
  kind: 'technology' | 'organization' | 'title' | 'credential';
}

function build(): GazetteerEntry[] {
  const entries: GazetteerEntry[] = [];
  const push = (tokens: string[], kind: GazetteerEntry['kind']) => {
    for (const token of tokens) entries.push({ token: token.toLowerCase(), kind });
  };
  push(TECHNOLOGY_TOKENS, 'technology');
  push(ORGANIZATION_TOKENS, 'organization');
  push(TITLE_TOKENS, 'title');
  push(CREDENTIAL_TOKENS, 'credential');
  // Longest first so "react native" wins over "react" and "senior software
  // engineer" wins over "software engineer".
  return entries.sort((a, b) => b.token.length - a.token.length);
}

export const GAZETTEER: GazetteerEntry[] = build();

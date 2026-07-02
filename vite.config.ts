import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_ROUTES = new Set(['/api/chat', '/api/fit'])

// Executes the real api/*.ts Edge Function handlers locally so dev and prod run
// identical code with no `vercel dev` dependency. Loaded via server.ssrLoadModule,
// so edits to api/*.ts are picked up on the next request without a server restart.
function edgeApiDevPlugin(): Plugin {
  return {
    name: 'edge-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (!API_ROUTES.has(path)) {
          next();
          return;
        }
        // Own these two exact paths entirely — never fall through to Vite's own
        // static/module-serving middleware, which would otherwise resolve
        // extensionless GETs like `/api/chat` to the source file and serve it.
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const mod = await server.ssrLoadModule(`/api${path.replace('/api', '')}.ts`);
          const handler = mod.default as (request: Request) => Promise<Response>;

          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          const body = Buffer.concat(chunks);

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(', '));
          }

          const request = new Request(new URL(path, 'http://localhost'), {
            method: req.method,
            headers,
            body: body.length > 0 ? body : undefined,
          });

          const response = await handler(request);

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));

          if (response.body) {
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          }
          res.end();
        } catch (err) {
          next(err as Error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Loads .env (including the unprefixed GROQ_API_KEY, which Vite would otherwise
  // hide from server-side code since it lacks the VITE_ prefix) into process.env
  // for the dev server — mirrors how Vercel injects env vars for api/*.ts in prod.
  const env = loadEnv(mode, process.cwd(), '')
  if (!process.env.GROQ_API_KEY && env.GROQ_API_KEY) {
    process.env.GROQ_API_KEY = env.GROQ_API_KEY
  }

  return {
    plugins: [react(), edgeApiDevPlugin()],
    test: {
      globals: true,
      environment: 'jsdom',
      environmentOptions: {
        jsdom: {
          url: 'http://localhost:3000',
        },
      },
      setupFiles: ['./src/__tests__/setup.ts'],
    },
  }
})

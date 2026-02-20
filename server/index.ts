import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  exportSharedDeckTemplateJson,
  getSharedRanks,
  getSharedDeckTemplateStats,
  importSharedDeckTemplateJson,
  jojGame,
  resetSharedRanks,
  resetSharedDeckTemplate,
  setSharedRanks,
} from '../src/game/jojGame';

const require = createRequire(import.meta.url);
const { Server } = require('boardgame.io/server') as {
  Server: (args: { games: unknown[]; origins?: string[] }) => {
    run: (port: number, callback?: () => void) => void;
  };
};

const server = Server({
  games: [jojGame],
  origins: [process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'],
});
const router = (server as { router?: any }).router;
const templatePath = path.resolve(process.cwd(), 'database', 'shared-deck-template.json');
const ranksPath = path.resolve(process.cwd(), 'database', 'shared-ranks.json');

const readJsonBody = async (ctx: any): Promise<Record<string, unknown>> => {
  const existingBody = ctx?.request?.body;
  if (existingBody && typeof existingBody === 'object') {
    return existingBody as Record<string, unknown>;
  }

  const req = ctx?.req;
  if (!req || typeof req.on !== 'function') return {};

  const raw = await new Promise<string>((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer | string) => {
      data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const saveTemplateToDisk = async () => {
  await mkdir(path.dirname(templatePath), { recursive: true });
  await writeFile(templatePath, exportSharedDeckTemplateJson(), 'utf8');
};

const saveRanksToDisk = async () => {
  await mkdir(path.dirname(ranksPath), { recursive: true });
  await writeFile(ranksPath, JSON.stringify(getSharedRanks(), null, 2), 'utf8');
};

const loadTemplateFromDisk = async () => {
  try {
    const raw = await readFile(templatePath, 'utf8');
    const result = importSharedDeckTemplateJson(raw);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[template] invalid saved template, fallback to default: ${result.error}`);
      await saveTemplateToDisk();
    }
  } catch {
    await saveTemplateToDisk();
  }
};

const loadRanksFromDisk = async () => {
  try {
    const raw = await readFile(ranksPath, 'utf8');
    const parsed = JSON.parse(raw);
    const ok = setSharedRanks(parsed);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('[ranks] invalid saved ranks, fallback to default');
      resetSharedRanks();
      await saveRanksToDisk();
    }
  } catch {
    await saveRanksToDisk();
  }
};

if (router) {
  router.get('/api/admin/match-state', async (ctx: any) => {
    const matchID = typeof ctx?.query?.matchID === 'string' ? ctx.query.matchID : '';
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing matchID' };
      return;
    }

    const db = ctx?.db ?? ctx?.app?.context?.db;
    if (!db || typeof db.fetch !== 'function') {
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Database is unavailable' };
      return;
    }

    const fetched = await db.fetch(matchID, { state: true, metadata: true });
    const state = fetched?.state;
    const metadata = fetched?.metadata;
    if (!state) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Match not found' };
      return;
    }

    ctx.body = {
      ok: true,
      snapshot: {
        G: state.G,
        ctx: state.ctx,
        updatedAt: metadata?.updatedAt ?? Date.now(),
      },
    };
  });

  router.get('/api/shared-deck-template', (ctx: any) => {
    ctx.body = {
      json: exportSharedDeckTemplateJson(),
      stats: getSharedDeckTemplateStats(),
    };
  });

  router.get('/api/shared-ranks', (ctx: any) => {
    ctx.body = { ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks', async (ctx: any) => {
    const body = await readJsonBody(ctx);
    const ranks = body.ranks;
    if (!Array.isArray(ranks)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing ranks array' };
      return;
    }
    const ok = setSharedRanks(ranks);
    if (!ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Invalid ranks schema' };
      return;
    }
    await saveRanksToDisk();
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-ranks/reset', async (ctx: any) => {
    resetSharedRanks();
    await saveRanksToDisk();
    ctx.body = { ok: true, ranks: getSharedRanks() };
  });

  router.post('/api/shared-deck-template/import', async (ctx: any) => {
    const body = await readJsonBody(ctx);
    const json = body.json;
    if (typeof json !== 'string') {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'Missing json string' };
      return;
    }
    const result = importSharedDeckTemplateJson(json);
    if (!result.ok) {
      ctx.status = 400;
      ctx.body = result;
      return;
    }
    await saveTemplateToDisk();
    ctx.body = { ok: true, stats: getSharedDeckTemplateStats() };
  });

  router.post('/api/shared-deck-template/reset', async (ctx: any) => {
    resetSharedDeckTemplate();
    await saveTemplateToDisk();
    ctx.body = { ok: true, stats: getSharedDeckTemplateStats() };
  });

  router.post('/api/admin/restart', (ctx: any) => {
    ctx.body = { ok: true, message: 'Server restart scheduled' };
    setTimeout(() => {
      process.exit(0);
    }, 150);
  });
}

const port = Number(process.env.PORT ?? 8000);

void (async () => {
  await loadTemplateFromDisk();
  await loadRanksFromDisk();
  server.run(port, () => {
    // eslint-disable-next-line no-console
    console.log(`boardgame.io server running at http://localhost:${port}`);
  });
})();

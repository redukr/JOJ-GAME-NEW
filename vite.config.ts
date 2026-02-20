import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const uploadImagePlugin = (): Plugin => {
  const handler = async (req: any, res: any): Promise<boolean> => {
    if (req.method !== 'POST' || req.url !== '/api/upload-card-image') return false;

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    await new Promise<void>((resolve) => req.on('end', resolve));

    try {
      const raw = Buffer.concat(chunks).toString('utf-8');
      const body = JSON.parse(raw) as { filename?: string; dataUrl?: string; cardId?: string };
      if (!body.dataUrl || typeof body.dataUrl !== 'string') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing dataUrl' }));
        return true;
      }

      const match = body.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid image data URL' }));
        return true;
      }

      const mime = match[1];
      const base64 = match[2];
      const extByMime: Record<string, string> = {
        'image/png': 'png',
        'image/webp': 'webp',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/gif': 'gif',
      };
      const fallbackExt = extByMime[mime] ?? 'png';
      const parsedInput = path.parse(body.filename || '');
      const inputBase = parsedInput.name || body.cardId || `card-${Date.now()}`;
      const inputExt = (parsedInput.ext || '').replace(/^\./, '').toLowerCase();
      const ext = /^[a-z0-9]+$/.test(inputExt) ? inputExt : fallbackExt;
      const safeNameBase = inputBase
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || `card-${Date.now()}`;

      const outDir = path.resolve(process.cwd(), 'public', 'cards');
      await mkdir(outDir, { recursive: true });
      let candidate = `${safeNameBase}.${ext}`;
      let outPath = path.join(outDir, candidate);
      try {
        await access(outPath);
        candidate = `${safeNameBase}-${Date.now()}.${ext}`;
        outPath = path.join(outDir, candidate);
      } catch {
        // File does not exist, keep original candidate.
      }
      await writeFile(outPath, Buffer.from(base64, 'base64'));

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ path: `/cards/${candidate}` }));
      return true;
    } catch {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to save image' }));
      return true;
    }
  };

  return {
    name: 'upload-card-image-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handler(req, res).then((handled) => {
          if (!handled) next();
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handler(req, res).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
};

export default defineConfig({
  plugins: [react(), uploadImagePlugin()],
  server: {
    headers: {
      // Dev-only CSP to allow Vite HMR / React refresh runtime.
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self' ws: wss: http: https:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;",
    },
  },
});

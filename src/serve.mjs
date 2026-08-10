// خادم تطوير محلي بسيط لمجلد site/ — بلا اعتماديات.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml'
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(SITE, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(SITE)) { res.writeHead(403).end('forbidden'); return; }
    const s = await stat(file).catch(() => null);
    const target = s && s.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    const nf = await readFile(join(SITE, '404.html')).catch(() => Buffer.from('404'));
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(nf);
  }
}).listen(PORT, () => console.log('http://localhost:' + PORT));

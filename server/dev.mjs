import { createServer } from 'node:http';
import { createOriginalRelay } from '../dist/relay.js';

const relay = createOriginalRelay({ ytDlpPath: process.env.YTDLP_PATH, maxHeight: 720 });
const server = createServer(async (req, res) => {
  if (!await relay.handle(req, res)) { res.writeHead(404); res.end('Not found'); }
});
const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? '127.0.0.1';
server.listen(port, host, () => console.log(`Original-audio relay listening on ${host}:${port}`));

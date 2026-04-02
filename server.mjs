import express from 'express';
import { scanUrl } from './scan.mjs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// CORS — 모든 origin 허용 (MVP)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── 헬스체크 ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─── 스캔 API ──────────────────────────────────────────────────────────────

app.post('/api/scan', async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  console.log(`[scan] start: ${targetUrl}`);
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.log(`[scan] timeout: ${targetUrl}`);
      res.status(504).json({ error: 'Scan timed out (60s)' });
    }
  }, 60000);

  try {
    const report = await scanUrl(targetUrl);
    clearTimeout(timeout);
    if (!res.headersSent) {
      console.log(`[scan] done: ${targetUrl} (score: ${report.score})`);
      res.json(report);
    }
  } catch (err) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      console.error(`[scan] error: ${targetUrl}`, err.message);
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── 에러 핸들러 (JSON 파싱 오류 등) ─────────────────────────────────────────

app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ─── 서버 시작 ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`TagDoctor scan server running on port ${PORT}`);
});

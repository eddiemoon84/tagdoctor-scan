import express from 'express';
import { scanUrl, scanMultiplePages } from './scan.mjs';
import { markScanning, markFailed, writeSingleScanResult, writeMultiScanResult } from './db.mjs';

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

// ─── 멀티페이지 스캔 API ─────────────────────────────────────────────────────

const VALID_PAGE_TYPES = new Set(['home', 'product', 'cart', 'checkout', 'thankyou', 'custom']);

app.post('/api/scan-multi', async (req, res) => {
  const { pages } = req.body || {};

  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'pages array is required' });
  }
  if (pages.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 pages allowed' });
  }

  const normalized = [];
  for (const p of pages) {
    if (!p || typeof p.url !== 'string') {
      return res.status(400).json({ error: 'Each page must have a url' });
    }
    let url = p.url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: `Invalid URL: ${p.url}` });
    }
    const type = VALID_PAGE_TYPES.has(p.type) ? p.type : 'custom';
    normalized.push({ url, type, label: p.label });
  }

  // 페이지당 최대 60s → 5 페이지 × 60s + 여유 = 340s
  const timeoutMs = Math.min(60000 * normalized.length + 30000, 330000);
  console.log(`[scan-multi] start: ${normalized.length} pages`);
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.log(`[scan-multi] timeout after ${timeoutMs}ms`);
      res.status(504).json({ error: 'Multi-scan timed out' });
    }
  }, timeoutMs);

  try {
    const report = await scanMultiplePages(normalized);
    clearTimeout(timeout);
    if (!res.headersSent) {
      console.log(`[scan-multi] done: ${normalized.length} pages (score: ${report.overallScore})`);
      res.json(report);
    }
  } catch (err) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      console.error(`[scan-multi] error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── 비동기 스캔 API (Supabase 직접 업데이트) ─────────────────────────────────
// 호출자(Vercel)는 즉시 202를 받고 종료. Render가 백그라운드로 스캔 + DB 쓰기.

app.post('/api/scan-async', async (req, res) => {
  const { scanId, url, pages } = req.body || {};

  if (!scanId || typeof scanId !== 'string') {
    return res.status(400).json({ error: 'scanId is required' });
  }

  const isMulti = Array.isArray(pages) && pages.length > 0;

  // 단일 스캔 입력 검증
  let targetUrl = null;
  if (!isMulti) {
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url or pages is required' });
    }
    targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
    try {
      new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
  }

  // 멀티 스캔 입력 검증
  let normalizedPages = null;
  if (isMulti) {
    if (pages.length > 5) return res.status(400).json({ error: 'Maximum 5 pages allowed' });
    normalizedPages = [];
    for (const p of pages) {
      if (!p || typeof p.url !== 'string') {
        return res.status(400).json({ error: 'Each page must have a url' });
      }
      let u = p.url.trim();
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      try {
        new URL(u);
      } catch {
        return res.status(400).json({ error: `Invalid URL: ${p.url}` });
      }
      const type = VALID_PAGE_TYPES.has(p.type) ? p.type : 'custom';
      normalizedPages.push({ url: u, type, label: p.label });
    }
  }

  // 즉시 ack
  res.status(202).json({ ok: true, scanId });

  // 백그라운드 실행
  setImmediate(async () => {
    try {
      await markScanning(scanId);
      if (isMulti) {
        console.log(`[scan-async] start multi: ${normalizedPages.length} pages (${scanId})`);
        const report = await scanMultiplePages(normalizedPages);
        await writeMultiScanResult(scanId, report);
        console.log(`[scan-async] done multi: ${scanId} (score: ${report.overallScore})`);
      } else {
        console.log(`[scan-async] start: ${targetUrl} (${scanId})`);
        const report = await scanUrl(targetUrl);
        await writeSingleScanResult(scanId, report);
        console.log(`[scan-async] done: ${targetUrl} (score: ${report.score})`);
      }
    } catch (err) {
      console.error(`[scan-async] error (${scanId}):`, err.message);
      try {
        await markFailed(scanId);
      } catch (dbErr) {
        console.error(`[scan-async] markFailed also failed (${scanId}):`, dbErr.message);
      }
    }
  });
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

/**
 * api/cron-gf.js  →  /api/cron-gf
 * 구글파이낸스 데이터를 "게시된 구글 시트 CSV"에서 받아 KV(fr_global)에 적재한다.
 * (구글파이낸스는 공식 API가 없어, =GOOGLEFINANCE() 시트를 웹에 게시한 CSV를 사용)
 *
 * 환경변수 GF_SHEET_CSV_URL 미설정 시 graceful no-op (글로벌 지수/환율 표시는 비활성).
 * 시트 CSV 형식(헤더 무관, 행 단위):  key,value,changePct
 *   NASDAQ,18234.5,+0.82
 *   DOW,40123.1,-0.15
 *   SP500,5678.9,+0.34
 *   USDKRW,1385.2,+0.21
 *   ...
 */
import { kvSet } from './_lib.js';

function parseCsv(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;
    const key = cols[0];
    const value = Number(String(cols[1]).replace(/[, ]/g, ''));
    const changePct = cols[2] != null ? Number(String(cols[2]).replace(/[%+ ]/g, '')) : null;
    if (!key || !Number.isFinite(value)) continue;            // 헤더/빈줄 스킵
    out.push({ key, value, changePct: Number.isFinite(changePct) ? changePct : null });
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const isCron   = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const pw       = String(req.body?.adminPw ?? '').trim();
  const isManual = !!process.env.ADMIN_PW && pw === String(process.env.ADMIN_PW).trim();
  if (!isCron && !isManual) return res.status(401).json({ error: '인증 실패' });

  const url = process.env.GF_SHEET_CSV_URL;
  if (!url) return res.status(200).json({ ok: false, skipped: true, reason: 'GF_SHEET_CSV_URL 미설정' });

  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'CSV HTTP ' + r.status });
    const items = parseCsv(await r.text());
    if (!items.length) return res.status(200).json({ ok: false, error: 'CSV 파싱 결과 없음' });
    await kvSet('fr_global', { ok: true, items, updatedAt: new Date().toISOString() });
    return res.status(200).json({ ok: true, count: items.length, keys: items.map(i => i.key) });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

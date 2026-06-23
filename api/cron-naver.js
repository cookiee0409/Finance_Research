/**
 * api/cron-naver.js  →  /api/cron-naver
 * 네이버 금융(비공식 모바일 API)으로 한국 종목 상세를 받아 KV에 적재한다.
 *   fr_naver_<code> { foreignRate, per, eps, pbr, bps, cnsPer, cnsEps, divYield, dps,
 *                     hi52, lo52, targetPrice, opinion, supply:[{date,foreign,organ,individual,foreignRate,close}], updatedAt }
 *
 * 출처: m.stock.naver.com/api/stock/{code}/integration  (밸류·외국인·컨센서스)
 *       m.stock.naver.com/api/stock/{code}/trend         (10일 외국인·기관·개인 순매수)
 * ※ 비공식 API — 구조 변경 가능. 방어적 파싱 + 저빈도(1일 4회) 호출. 종목 간 딜레이.
 */
import { kvGet, kvSet } from './_lib.js';

const NAVER_HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};
const CHUNK_BUDGET_MS = 50000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const numOf = (s) => { if (s == null) return null; const n = Number(String(s).replace(/[,%원배\s]/g, '')); return Number.isFinite(n) ? n : null; };

async function jget(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try { const r = await fetch(url, { headers: NAVER_HDR }); if (r.ok) return await r.json(); } catch {}
    await sleep(300);
  }
  return null;
}

async function buildNaver(code) {
  const ig = await jget(`https://m.stock.naver.com/api/stock/${code}/integration`);
  await sleep(120);
  const tr = await jget(`https://m.stock.naver.com/api/stock/${code}/trend`);
  if (!ig && !tr) return null;

  const ti = {};
  (ig?.totalInfos || []).forEach(x => { if (x && x.code) ti[x.code] = x.value; });

  const supply = Array.isArray(tr)
    ? tr.slice().reverse().map(d => ({                 // 과거→현재 정렬
        date: d.bizdate,
        foreign: numOf(d.foreignerPureBuyQuant),
        organ: numOf(d.organPureBuyQuant),
        individual: numOf(d.individualPureBuyQuant),
        foreignRate: numOf(d.foreignerHoldRatio),
        close: numOf(d.closePrice),
      }))
    : [];

  // 컨센서스(목표주가/투자의견) — 구조 방어적 추출
  let targetPrice = null, opinion = null;
  const ci = ig?.consensusInfo;
  if (ci && typeof ci === 'object') {
    targetPrice = numOf(ci.priceTargetMean ?? ci.priceTarget ?? ci.targetPrice ?? ci.consensusPriceTarget);
    opinion = ci.investmentOpinionMean ?? ci.investmentOpinion ?? ci.opinion ?? null;
  }

  return {
    ok: true, code,
    foreignRate: numOf(ti.foreignRate),
    per: numOf(ti.per), eps: numOf(ti.eps),
    pbr: numOf(ti.pbr), bps: numOf(ti.bps),
    cnsPer: numOf(ti.cnsPer), cnsEps: numOf(ti.cnsEps),
    divYield: numOf(ti.dividendYieldRatio), dps: numOf(ti.dividend),
    hi52: numOf(ti.highPriceOf52Weeks), lo52: numOf(ti.lowPriceOf52Weeks),
    targetPrice, opinion,
    supply,
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const isCron   = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const pw       = String(req.body?.adminPw ?? '').trim();
  const isManual = !!process.env.ADMIN_PW && pw === String(process.env.ADMIN_PW).trim();
  if (!isCron && !isManual) return res.status(401).json({ error: '인증 실패' });

  const start = Date.now();
  try {
    const universe = (await kvGet('fr_universe')) || [];
    if (!universe.length) return res.status(200).json({ ok: false, error: 'fr_universe 없음 (cron-market 먼저)' });

    let cursor = (await kvGet('fr_naver_cursor')) || 0;
    if (cursor >= universe.length) cursor = 0;

    const done = [], failed = [];
    while (cursor < universe.length && Date.now() - start < CHUNK_BUDGET_MS) {
      const code = universe[cursor];
      const n = await buildNaver(code);
      if (n) { await kvSet('fr_naver_' + code, n); done.push(code); }
      else failed.push(code);
      cursor++;
      await sleep(150);
    }
    await kvSet('fr_naver_cursor', cursor >= universe.length ? 0 : cursor);
    return res.status(200).json({ ok: true, processed: done.length, failed: failed.length, cursor, universe: universe.length });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

/**
 * api/cron-market.js  →  /api/cron-market   [schedule: 30 5 * * * (=14:30 KST)]
 *
 * 공공데이터포털(금융위, KOGL 출처표시) 전일 전체시세를 받아 대시보드/리스트용으로
 * 미리 계산해 KV에 저장한다.
 *
 *   fr_marketcap        시가총액 상위 (TOP_CAP)
 *   fr_volume           거래량 상위 (TOP_VOL)
 *   fr_movers_up/down   등락률 상·하위
 *   fr_daymap           { code:{n,p,r,v,cap,mkt} } — 유니버스 시세(quotes용)
 *   fr_universe         유니버스 코드 배열 (시총·거래량 상위 합집합)
 *   fr_list             유니버스 요약 리스트
 *   fr_search           전체 종목 검색 인덱스 [{code,n,mkt,s}]
 *   fr_overview         코스피·코스닥 지수 + 환율
 *   fr_spark_<code>     종목 30영업일 종가 스파크라인 (커서로 분할 적재)
 */
import {
  kvGet, kvSet, nowKST, compact, dash, minusOneDayCompact,
  fetchGov, govErr, itemsOf, totalOf, STOCK_BASE, INDEX_BASE, sectorOf,
} from './_lib.js';

const TOP_CAP = 40;
const TOP_VOL = 40;
const MAX_MS = 50000;          // 함수 maxDuration 60s 가정. Hobby(10s)면 vercel.json에서 조정.
const SPARK_DAYS = 30;

function ymd() { return compact(nowKST()); }
function daysAgoCompact(n) { const d = nowKST(); d.setDate(d.getDate() - n); return compact(d); }

async function findLatestBasDt(key) {
  let dt = ymd(), lastErr = null;
  for (let i = 0; i < 14; i++) {
    const r = await fetchGov(`${STOCK_BASE}?serviceKey=${key}&resultType=json&numOfRows=1&pageNo=1&basDt=${dt}`);
    if (r.ok && totalOf(r.json) > 0) return dt;
    if (!r.ok) lastErr = govErr(r);
    dt = minusOneDayCompact(dt);
  }
  if (lastErr) throw new Error('전체시세 기준일 탐색 실패: ' + lastErr);
  return null;
}

async function fetchAllStocks(basDt, key, startTime) {
  const rows = []; let pageNo = 1, diag = null; const numOfRows = 1000;
  while (true) {
    if (Date.now() - startTime > MAX_MS) break;
    const r = await fetchGov(`${STOCK_BASE}?serviceKey=${key}&resultType=json&numOfRows=${numOfRows}&pageNo=${pageNo}&basDt=${basDt}`);
    if (!r.ok) { if (pageNo === 1) diag = govErr(r); break; }
    const items = itemsOf(r.json);
    if (!items.length) { if (pageNo === 1) diag = '항목 없음(totalCount=' + totalOf(r.json) + ')'; break; }
    for (const i of items) {
      const close = Number(i.clpr) || 0;
      if (close <= 0) continue;
      rows.push({
        code: i.srtnCd, name: i.itmsNm, market: i.mrktCtg || '',
        price: close, rate: Number(i.fltRt) || 0, diff: Number(i.vs) || 0,
        vol: Number(i.trqu) || 0, amount: Number(i.trPrc) || 0,
        cap: Math.round((Number(i.mrktTotAmt) || 0) / 1e8),   // 원 → 억원
      });
    }
    const total = totalOf(r.json);
    if (pageNo * numOfRows >= total || items.length < numOfRows) break;
    pageNo++;
  }
  return { rows, diag };
}

async function fetchSpark(code, key) {
  const url = `${STOCK_BASE}?serviceKey=${key}&resultType=json&numOfRows=${SPARK_DAYS + 10}&pageNo=1`
    + `&beginBasDt=${daysAgoCompact(SPARK_DAYS + 18)}&endBasDt=${ymd()}&likeSrtnCd=${code}`;
  const r = await fetchGov(url);
  if (!r.ok) return null;
  const rows = itemsOf(r.json)
    .filter(i => String(i.srtnCd) === code && Number(i.clpr) > 0)
    .map(i => ({ d: i.basDt, p: Number(i.clpr) }))
    .sort((a, b) => a.d.localeCompare(b.d))
    .slice(-SPARK_DAYS);
  if (!rows.length) return null;
  return { ok: true, code, dates: rows.map(x => x.d), series: rows.map(x => x.p), updatedAt: new Date().toISOString() };
}

async function fetchIndexSeries(idxNm, key) {
  const url = `${INDEX_BASE}?serviceKey=${key}&resultType=json&numOfRows=60&pageNo=1`
    + `&idxNm=${encodeURIComponent(idxNm)}&beginBasDt=${daysAgoCompact(50)}&endBasDt=${ymd()}`;
  const r = await fetchGov(url);
  if (!r.ok) return [];
  return itemsOf(r.json)
    .filter(i => i.idxNm === idxNm && Number(i.clpr) > 0)
    .map(i => ({ d: i.basDt, price: Number(i.clpr), rate: Number(i.fltRt) || 0, diff: Number(i.vs) || 0 }))
    .sort((a, b) => a.d.localeCompare(b.d));
}

async function getUsdKrw() {
  for (const u of [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  ]) {
    try { const j = await (await fetch(u)).json(); if (j?.usd?.krw) return { rate: Number(j.usd.krw), source: 'currency-api' }; } catch {}
  }
  return { rate: 1380, source: 'fallback' };
}

function decorate(r) { return { ...r, sector: sectorOf(r.code) }; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const isCron   = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const pw       = String(req.body?.adminPw ?? '').trim();
  const isManual = !!process.env.ADMIN_PW && pw === String(process.env.ADMIN_PW).trim();
  if (!isCron && !isManual) return res.status(401).json({ error: '인증 실패' });

  const KEY = process.env.DATA_GO_KR_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'DATA_GO_KR_API_KEY 없음' });
  const INDEX_KEY = process.env.DATA_GO_KR_INDEX_KEY || KEY;

  const startTime = Date.now();
  const result = { ok: true, steps: {} };

  try {
    const basDt = await findLatestBasDt(KEY);
    if (!basDt) return res.status(200).json({ ok: false, error: '최근 거래일 탐색 실패' });
    const basisDate = dash(basDt);
    result.basisDate = basisDate;

    // 1) 전체 스냅샷
    const { rows, diag } = await fetchAllStocks(basDt, KEY, startTime);
    result.steps.snapshot = { count: rows.length, diag };
    if (!rows.length) return res.status(200).json({ ok: false, error: '스냅샷 비어있음: ' + (diag || ''), result });

    // 2) 정렬 → 상위 리스트
    const byCap  = [...rows].sort((a, b) => b.cap - a.cap).slice(0, TOP_CAP).map(decorate);
    const byVol  = [...rows].sort((a, b) => b.vol - a.vol).slice(0, TOP_VOL).map(decorate);
    const tradable = rows.filter(r => r.amount > 5e8);   // 거래대금 5억↑만 등락률 랭킹(잡주 제외)
    const moversUp   = [...tradable].sort((a, b) => b.rate - a.rate).slice(0, 20).map(decorate);
    const moversDown = [...tradable].sort((a, b) => a.rate - b.rate).slice(0, 20).map(decorate);

    await kvSet('fr_marketcap', { ok: true, basisDate, list: byCap, updatedAt: new Date().toISOString() });
    await kvSet('fr_volume',    { ok: true, basisDate, list: byVol, updatedAt: new Date().toISOString() });
    await kvSet('fr_movers_up',   { ok: true, basisDate, dir: 'up',   list: moversUp,   updatedAt: new Date().toISOString() });
    await kvSet('fr_movers_down', { ok: true, basisDate, dir: 'down', list: moversDown, updatedAt: new Date().toISOString() });
    result.steps.lists = { cap: byCap.length, vol: byVol.length };

    // 3) 유니버스 = 시총상위 ∪ 거래량상위
    const uniMap = new Map();
    [...byCap, ...byVol].forEach(r => uniMap.set(r.code, r));
    const universe = [...uniMap.values()];
    const uniCodes = universe.map(r => r.code);
    await kvSet('fr_universe', uniCodes);
    await kvSet('fr_list', { ok: true, basisDate, list: universe, updatedAt: new Date().toISOString() });

    const daymap = {};
    universe.forEach(r => { daymap[r.code] = { n: r.name, p: r.price, r: r.rate, v: r.vol, cap: r.cap, mkt: r.market }; });
    await kvSet('fr_daymap', daymap);

    // 4) 검색 인덱스(전체 종목)
    await kvSet('fr_search', rows.map(r => ({ code: r.code, n: r.name, mkt: r.market, s: sectorOf(r.code) })));

    // 5) 지수 + 환율
    let kospi = null, kosdaq = null;
    try {
      const ks = await fetchIndexSeries('코스피', INDEX_KEY);
      const kq = await fetchIndexSeries('코스닥', INDEX_KEY);
      if (ks.length) { const l = ks[ks.length - 1]; kospi = { price: l.price, rate: l.rate, diff: l.diff, spark: ks.slice(-30).map(x => x.price) }; }
      if (kq.length) { const l = kq[kq.length - 1]; kosdaq = { price: l.price, rate: l.rate, diff: l.diff, spark: kq.slice(-30).map(x => x.price) }; }
    } catch (e) { result.steps.indexError = e.message; }
    const fx = await getUsdKrw();
    const up = rows.filter(r => r.rate > 0).length, down = rows.filter(r => r.rate < 0).length;
    await kvSet('fr_overview', {
      ok: true, basisDate, kospi, kosdaq, usdKrw: fx.rate, rateSource: fx.source,
      breadth: { up, down, flat: rows.length - up - down, total: rows.length },
      updatedAt: new Date().toISOString(),
    });
    result.steps.overview = { kospi: !!kospi, kosdaq: !!kosdaq, fx: fx.rate };

    // 6) 스파크라인 — 시간예산 내에서 커서로 분할 적재
    let cursor = (await kvGet('fr_spark_cursor')) || 0;
    if (cursor >= uniCodes.length) cursor = 0;
    let done = 0;
    while (cursor < uniCodes.length && Date.now() - startTime < MAX_MS) {
      const code = uniCodes[cursor];
      const sp = await fetchSpark(code, KEY);
      if (sp) { await kvSet('fr_spark_' + code, sp); done++; }
      cursor++;
    }
    await kvSet('fr_spark_cursor', cursor >= uniCodes.length ? 0 : cursor);
    result.steps.sparks = { added: done, cursor, universe: uniCodes.length };

    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message, partial: result });
  }
}

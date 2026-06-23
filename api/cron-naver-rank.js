/**
 * api/cron-naver-rank.js  ->  /api/cron-naver-rank
 *
 * 모바일 증권 랭킹 API에서 현재가·거래량·거래대금·시가총액을 받아 KV에 적재한다.
 * vercel.json 기준 하루 4회 실행한다.
 */
import { kvSet, sectorOf } from './_lib.js';

const NAVER_HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};
const MARKETS = ['KOSPI', 'KOSDAQ'];
const PAGE_SIZE = 80;
const PAGES = 5;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const numOf = (v) => {
  if (v == null || v === 'N/A') return null;
  const n = Number(String(v).replace(/[,\s%원]/g, ''));
  return Number.isFinite(n) ? n : null;
};

async function jget(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: NAVER_HDR });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  return null;
}

function normalizeRow(row, market) {
  const code = row?.itemCode || row?.reutersCode;
  if (!code || !/^\d{6}$/.test(code)) return null;
  if (row.stockEndType && row.stockEndType !== 'stock') return null;

  const price = numOf(row.closePrice);
  const volume = numOf(row.accumulatedTradingVolume) || 0;
  const amountMillionKrw = numOf(row.accumulatedTradingValue) || 0;
  const marketCapEok = numOf(row.marketValue) || 0;
  if (!price || !row.stockName) return null;

  return {
    code,
    name: row.stockName,
    market,
    sector: sectorOf(code),
    price,
    rate: numOf(row.fluctuationsRatio) || 0,
    vol: volume,
    amount: Math.round(amountMillionKrw * 1_000_000),
    cap: Math.round(marketCapEok),
    localTradedAt: row.localTradedAt || null,
  };
}

async function fetchRank(sortType, market) {
  const out = [];
  for (let page = 1; page <= PAGES; page++) {
    const url = `https://m.stock.naver.com/api/stocks/${sortType}/${market}?page=${page}&pageSize=${PAGE_SIZE}`;
    const data = await jget(url);
    const rows = Array.isArray(data?.stocks) ? data.stocks : [];
    if (!rows.length) break;
    rows.map(row => normalizeRow(row, market)).filter(Boolean).forEach(row => out.push(row));
    if (rows.length < PAGE_SIZE) break;
    await sleep(120);
  }
  return out;
}

function mergeRows(...lists) {
  const map = new Map();
  for (const row of lists.flat()) {
    const prev = map.get(row.code) || {};
    map.set(row.code, { ...prev, ...row });
  }
  return [...map.values()];
}

function latestLocalTradedAt(rows) {
  return rows.map(r => r.localTradedAt).filter(Boolean).sort().at(-1) || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const isCron   = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const pw       = String(req.body?.adminPw ?? '').trim();
  const isManual = !!process.env.ADMIN_PW && pw === String(process.env.ADMIN_PW).trim();
  if (!isCron && !isManual) return res.status(401).json({ error: '인증 실패' });

  try {
    const marketcapParts = [];
    const volumeParts = [];
    for (const market of MARKETS) {
      marketcapParts.push(await fetchRank('marketValue', market));
      volumeParts.push(await fetchRank('quantTop', market));
    }

    const merged = mergeRows(marketcapParts.flat(), volumeParts.flat());
    const updatedAt = new Date().toISOString();
    const marketDataAt = latestLocalTradedAt(merged);
    const basisDate = marketDataAt ? marketDataAt.slice(0, 10) : updatedAt.slice(0, 10);
    const common = { ok: true, basisDate, marketDataAt, updatedAt };

    const marketcap = [...marketcapParts.flat()].sort((a, b) => b.cap - a.cap).slice(0, 160);
    const volume = [...volumeParts.flat()].sort((a, b) => b.vol - a.vol).slice(0, 160);
    const amount = [...merged].filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 160);
    const list = [...new Map([...marketcap, ...volume, ...amount].map(r => [r.code, r])).values()];

    await kvSet('fr_naver_marketcap', { ...common, list: marketcap });
    await kvSet('fr_naver_volume', { ...common, list: volume });
    await kvSet('fr_naver_amount', { ...common, list: amount });
    await kvSet('fr_naver_rank_list', { ...common, list });

    return res.status(200).json({
      ok: true,
      basisDate,
      marketDataAt,
      updatedAt,
      counts: { marketcap: marketcap.length, volume: volume.length, amount: amount.length, list: list.length },
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

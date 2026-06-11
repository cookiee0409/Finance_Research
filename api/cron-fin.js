/**
 * api/cron-fin.js  →  /api/cron-fin   [schedule: 0 18 * * * (=03:00 KST), 자주 호출해도 됨]
 *
 * 유니버스(fr_universe) 종목의 DART 재무제표를 받아 차트용으로 정규화해 KV에 저장한다.
 * 한 번 호출에 시간예산 내 일부만 처리하고 fr_fin_cursor 로 분할 적재한다(반복 호출 시 전체 완성).
 *
 *   fr_fin_<code>  { code, name, years:[..], revenue:[], opIncome:[], netIncome:[],
 *                    debtRatio:[], opMargin:[], netMargin:[], roe, eps, per, pbr,
 *                    fsDiv, reportYear, updatedAt }
 *
 * 데이터 출처: opendart.fss.or.kr  fnlttSinglAcntAll(전체재무제표) + fnlttSinglIndx(주요지표)
 */
import { kvGet, kvSet } from './_lib.js';
import CORP_MAP from './corp-map.js';

const ACNT_URL = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json';
const INDX_URL = 'https://opendart.fss.or.kr/api/fnlttSinglIndx.json';
const CHUNK_BUDGET_MS = 50000;
const NUM_YEARS = 5;

const REV_NAMES = ['매출액', '수익(매출액)', '영업수익', '매출', '매출및지분법손익'];
const OP_NAMES  = ['영업이익', '영업이익(손실)'];
const NI_NAMES  = ['당기순이익', '당기순이익(손실)', '당기순이익(당기순손실)', '연결당기순이익'];
const EPS_NAMES = ['기본주당이익', '기본주당이익(손실)', '주당이익'];
const ASSET = ['자산총계'], LIAB = ['부채총계'], EQUITY = ['자본총계'];

function parseNum(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}
function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }

// 특정 statement(sj_div)에서 account_nm 일치 행 찾기
function findRow(list, names, sjDivs) {
  return list.find(r => sjDivs.includes(r.sj_div) && names.includes((r.account_nm || '').trim())) || null;
}
// 행에서 [당기, 전기, 전전기] 금액
function triple(row) {
  if (!row) return [null, null, null];
  return [parseNum(row.thstrm_amount), parseNum(row.frmtrm_amount), parseNum(row.bfefrmtrm_amount)];
}

async function fetchAcnt(corpCode, year, fsDiv, key) {
  try {
    const r = await fetch(`${ACNT_URL}?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011&fs_div=${fsDiv}`);
    const j = await r.json();
    if (j.status === '000' && Array.isArray(j.list) && j.list.length) return j.list;
  } catch {}
  return null;
}

// year 사업보고서 → {Y:..} 3개년 추출. CFS 우선, 없으면 OFS.
async function extractYears(corpCode, year, key) {
  let list = await fetchAcnt(corpCode, year, 'CFS', key);
  let fsDiv = 'CFS';
  if (!list) { list = await fetchAcnt(corpCode, year, 'OFS', key); fsDiv = 'OFS'; }
  if (!list) return { data: {}, fsDiv: null };

  const rev = triple(findRow(list, REV_NAMES, ['IS', 'CIS']));
  const op  = triple(findRow(list, OP_NAMES,  ['IS', 'CIS']));
  const ni  = triple(findRow(list, NI_NAMES,  ['IS', 'CIS']));
  const eps = triple(findRow(list, EPS_NAMES, ['IS', 'CIS']));
  const ast = triple(findRow(list, ASSET,  ['BS']));
  const lia = triple(findRow(list, LIAB,   ['BS']));
  const eq  = triple(findRow(list, EQUITY, ['BS']));

  const data = {};
  for (let k = 0; k < 3; k++) {
    const y = year - k;
    data[y] = {
      revenue: rev[k], opIncome: op[k], netIncome: ni[k], eps: eps[k],
      asset: ast[k], liab: lia[k], equity: eq[k],
    };
  }
  return { data, fsDiv };
}

async function fetchIndx(corpCode, year, key) {
  const out = {};
  for (const cl of ['M210000', 'M220000']) {   // 수익성, 안정성
    try {
      const r = await fetch(`${INDX_URL}?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011&idx_cl_code=${cl}`);
      const j = await r.json();
      if (j.status === '000' && Array.isArray(j.list)) {
        for (const it of j.list) out[(it.idx_nm || '').trim()] = parseNum(it.idx_val);
      }
    } catch {}
  }
  return out;
}

async function buildOne(code, name, key) {
  const mapped = CORP_MAP[code];
  if (!mapped) return { ok: false, code, error: 'corp_code 매핑 없음' };
  const corpCode = mapped.c;

  // 최신 사업연도 탐색(2025→2024→2023)
  const thisYr = new Date(Date.now() + 9 * 3600 * 1000).getFullYear();
  let latest = null, merged = {}, fsDiv = null;
  for (const y of [thisYr, thisYr - 1, thisYr - 2]) {
    const { data, fsDiv: fd } = await extractYears(corpCode, y, key);
    if (fd) { latest = y; fsDiv = fd; merged = data; break; }
  }
  if (!latest) return { ok: false, code, error: 'DART 재무 없음' };

  // 더 과거(latest-3)도 받아 5~6개년 확보
  const older = await extractYears(corpCode, latest - 3, key);
  Object.entries(older.data).forEach(([y, v]) => { if (!merged[y]) merged[y] = v; });

  // 연도 정렬 후 최근 NUM_YEARS
  const years = Object.keys(merged).map(Number).sort((a, b) => a - b)
    .filter(y => merged[y] && (merged[y].revenue != null || merged[y].asset != null))
    .slice(-NUM_YEARS);

  const toEok = v => v == null ? null : Math.round(v / 1e8);   // 원 → 억원
  const revenue   = years.map(y => toEok(merged[y].revenue));
  const opIncome  = years.map(y => toEok(merged[y].opIncome));
  const netIncome = years.map(y => toEok(merged[y].netIncome));
  const debtRatio = years.map(y => {
    const { liab, equity } = merged[y];
    return (liab != null && equity) ? round1(liab / equity * 100) : null;
  });
  const opMargin  = years.map(y => {
    const { opIncome: o, revenue: r } = merged[y];
    return (o != null && r) ? round1(o / r * 100) : null;
  });
  const netMargin = years.map(y => {
    const { netIncome: n, revenue: r } = merged[y];
    return (n != null && r) ? round1(n / r * 100) : null;
  });

  // 지표(ROE) — DART 지표 우선, 없으면 순이익/자본 근사
  const indx = await fetchIndx(corpCode, latest, key);
  let roe = indx['ROE'] ?? indx['자기자본이익률'] ?? null;
  if (roe == null) {
    const m = merged[latest];
    if (m && m.netIncome != null && m.equity) roe = round1(m.netIncome / m.equity * 100);
  }
  const epsLatest = merged[latest]?.eps ?? null;

  return {
    ok: true, code, name, corpCode, fsDiv, reportYear: latest,
    years, revenue, opIncome, netIncome, debtRatio, opMargin, netMargin,
    roe: round1(roe), eps: epsLatest,
    indicators: indx,
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const isCron   = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const pw       = String(req.body?.adminPw ?? '').trim();
  const isManual = !!process.env.ADMIN_PW && pw === String(process.env.ADMIN_PW).trim();
  if (!isCron && !isManual) return res.status(401).json({ error: '인증 실패' });

  const KEY = process.env.DART_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'DART_API_KEY 없음' });

  const start = Date.now();
  try {
    const universe = (await kvGet('fr_universe')) || [];
    const daymap   = (await kvGet('fr_daymap')) || {};
    if (!universe.length) return res.status(200).json({ ok: false, error: 'fr_universe 없음 (cron-market 먼저 실행)' });

    let cursor = (await kvGet('fr_fin_cursor')) || 0;
    if (cursor >= universe.length) cursor = 0;

    const done = [], failed = [];
    while (cursor < universe.length && Date.now() - start < CHUNK_BUDGET_MS) {
      const code = universe[cursor];
      const name = daymap[code]?.n || (CORP_MAP[code]?.n) || code;
      const fin = await buildOne(code, name, KEY);
      if (fin.ok) {
        // 밸류에이션: 시세(daymap)와 결합 (PER/PBR 근사)
        const dm = daymap[code];
        if (dm && fin.eps && fin.eps > 0) fin.per = round1(dm.p / fin.eps);
        await kvSet('fr_fin_' + code, fin);
        done.push(code);
      } else {
        failed.push({ code, error: fin.error });
      }
      cursor++;
    }
    await kvSet('fr_fin_cursor', cursor >= universe.length ? 0 : cursor);

    return res.status(200).json({ ok: true, processed: done.length, done, failed, cursor, universe: universe.length });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

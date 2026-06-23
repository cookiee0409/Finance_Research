/**
 * api/_lib.js — 공용 헬퍼 (KV · 공공데이터 · 섹터)
 * Vercel: '_' 시작 파일은 라우트로 노출되지 않고 import 전용으로만 쓰인다.
 */

// ── Upstash / Vercel KV ─────────────────────────────────
export function getKV() {
  return {
    url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}
export async function kvGet(key) {
  const { url, token } = getKV();
  if (!url || !token) return null;
  try {
    const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.result) return null;
    let p = JSON.parse(data.result);
    if (typeof p === 'string') p = JSON.parse(p);
    return p;
  } catch { return null; }
}
export async function kvSet(key, value, exSeconds = 0) {
  const { url, token } = getKV();
  if (!url || !token) return;
  const endpoint = exSeconds > 0 ? `${url}/set/${encodeURIComponent(key)}/ex/${exSeconds}` : `${url}/set/${encodeURIComponent(key)}`;
  await fetch(endpoint, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(value),
  });
}

// ── 날짜(KST) ───────────────────────────────────────────
export function nowKST() { return new Date(Date.now() + 9 * 3600 * 1000); }
export function compact(dt) { return dt.toISOString().slice(0, 10).replace(/-/g, ''); }
export function dash(s) { return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; }
export function minusOneDayCompact(yyyymmdd) {
  const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

// ── 공공데이터포털: 안전 파서 (일시 실패 시 재시도) ──────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchGovOnce(url) {
  let res, text;
  try { res = await fetch(url); text = await res.text(); }
  catch (e) { return { ok: false, status: 0, raw: 'fetch 실패: ' + e.message, json: null }; }
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!json) return { ok: false, status: res.status, raw: (text || '').trim().slice(0, 140), json: null };
  const code = json?.response?.header?.resultCode ?? json?.cmmMsgHeader?.returnReasonCode;
  const msg  = json?.response?.header?.resultMsg  ?? json?.cmmMsgHeader?.errMsg;
  if (code != null && code !== '00' && code !== '0') return { ok: false, status: res.status, code, msg, json };
  return { ok: true, status: res.status, json };
}
export async function fetchGov(url, retries = 2) {
  let r = await fetchGovOnce(url);
  // 일시적 실패(네트워크/비-JSON/HTTP 5xx·throttle)만 재시도. 정상 에러코드(자료없음 등)는 그대로.
  for (let i = 0; i < retries && !r.ok && r.code == null; i++) {
    await sleep(350 + i * 350);
    r = await fetchGovOnce(url);
  }
  return r;
}
export function govErr(r) { return r.code ? `[${r.code}] ${r.msg || ''}`.trim() : `HTTP ${r.status}: ${r.raw || ''}`; }
export function itemsOf(json) {
  const it = json?.response?.body?.items?.item;
  if (!it) return [];
  return Array.isArray(it) ? it : [it];
}
export function totalOf(json) { return Number(json?.response?.body?.totalCount) || 0; }

export const STOCK_BASE = 'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo';
export const INDEX_BASE = 'https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService/getStockMarketIndex';

// ── 섹터(업종) 큐레이션 맵 — 시총/거래량 상위 주요 종목 위주 ──
// 공공데이터 시세 API엔 업종이 없어, 대표 종목은 직접 분류하고 나머지는 '기타'.
export const SECTOR_MAP = {
  // 반도체
  '005930':'반도체','000660':'반도체','005935':'반도체','042700':'반도체','403870':'반도체','036930':'반도체','098460':'반도체','089030':'반도체',
  '030530':'반도체','017900':'반도체','115610':'반도체','0017J0':'반도체','000990':'반도체','240810':'반도체','058470':'반도체','357780':'반도체',
  // 2차전지 / 화학
  '373220':'2차전지','006400':'2차전지','051910':'2차전지','247540':'2차전지','066970':'2차전지','137400':'2차전지','450080':'2차전지','278280':'2차전지',
  '093370':'화학',
  // 자동차
  '005380':'자동차','000270':'자동차','012330':'자동차','018880':'자동차','126640':'자동차','161390':'자동차','204320':'자동차',
  // 인터넷 / 게임 / 엔터
  '035420':'인터넷','035720':'인터넷','376300':'인터넷',
  '259960':'게임','036570':'게임','251270':'게임','263750':'게임','078340':'게임','293490':'게임',
  '352820':'엔터','041510':'엔터','122870':'엔터',
  // 바이오 / 헬스케어
  '207940':'바이오','068270':'바이오','326030':'바이오','302440':'바이오','196170':'바이오','145020':'바이오','328130':'바이오','141080':'바이오','009420':'바이오',
  // 철강·소재
  '005490':'철강소재','010130':'철강소재','004020':'철강소재','103140':'철강소재','011330':'철강소재',
  // 금융 (안정성 보정 대상)
  '105560':'금융','055550':'금융','086790':'금융','316140':'금융','000810':'금융','032830':'금융','085620':'금융','088350':'금융',
  '279570':'금융','006220':'금융','006800':'금융','100790':'금융','027360':'금융',
  // 전력·에너지·기계
  '015760':'전력에너지','267260':'전력에너지','010120':'전력에너지','298040':'전력에너지','475150':'전력에너지','024060':'전력에너지',
  '034020':'기계','319400':'기계',
  // 전자부품 / 디스플레이 / 가전
  '009150':'전자부품','011070':'전자부품','388790':'전자부품','010170':'전자부품','069540':'전자부품','043260':'전자부품','215790':'전자부품',
  '034220':'디스플레이','066570':'가전',
  // 지주 / 상사
  '028260':'지주','034730':'지주','000150':'지주','402340':'지주','003550':'지주','001740':'유통상사',
  // 통신
  '030200':'통신','017670':'통신','032640':'통신',
  // 방산 / 조선 / 운송
  '012450':'방산',
  '009540':'조선','010140':'조선','042660':'조선','329180':'조선',
  '003280':'운송','005880':'운송',
  // 건설 / 음식료 / 로봇
  '047040':'건설','079650':'건설','038500':'건설',
  '136480':'음식료',
  '090710':'로봇','066430':'로봇','389680':'로봇',
};
// 부채비율이 업종 특성상 높은(레이더 안정성 보정 대상) 섹터
export const HIGH_LEVERAGE_SECTORS = new Set(['금융','건설','운송','지주']);
export function sectorOf(code) { return SECTOR_MAP[code] || '기타'; }

export function corsJson(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

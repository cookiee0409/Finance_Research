/**
 * api/stocks.js  →  /api/stocks   (KV 선계산값 서빙 · 외부 API 직접호출 없음)
 *
 *   ?type=overview                코스피·코스닥 지수 + 환율 (전일)
 *   ?type=marketcap               시가총액 상위 (전일)
 *   ?type=volume                  거래량 상위 (전일)
 *   ?type=movers&dir=up|down      등락률 상·하위
 *   ?type=quotes&codes=005930,..  지정 종목 전일 종가
 *   ?type=spark&code=005930       종목 30일 가격 스파크라인
 *   ?type=financials&code=005930  종목 DART 재무제표(차트용)
 *   ?type=list                    유니버스(시총·거래량 상위 합집합) 요약
 *   ?type=search&q=삼성           종목 검색(코드·이름)
 *
 * 모든 데이터는 cron-market.js / cron-fin.js 가 KV에 미리 적재한 값.
 */
import { kvGet, corsJson } from './_lib.js';

const NOT_READY = '데이터 준비 중입니다. (cron 최초 실행 후 제공)';

export default async function handler(req, res) {
  corsJson(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const type = (req.query.type || 'overview').toString();

  try {
    if (type === 'overview') {
      const d = await kvGet('fr_overview');
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=120');
      return res.status(200).json(d || { ok: false, error: NOT_READY });
    }

    if (type === 'marketcap' || type === 'volume') {
      const d = await kvGet('fr_' + type);
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
      return res.status(200).json(d || { ok: false, list: [], error: NOT_READY });
    }

    if (type === 'movers') {
      const dir = req.query.dir === 'down' ? 'down' : 'up';
      const d = await kvGet('fr_movers_' + dir);
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json(d || { ok: false, dir, list: [], error: NOT_READY });
    }

    if (type === 'quotes') {
      const codes = (req.query.codes || '').toString().split(',').map(s => s.trim()).filter(Boolean);
      if (!codes.length) return res.status(200).json({ ok: false, error: 'codes 파라미터 필요' });
      const daymap = (await kvGet('fr_daymap')) || {};
      const list = codes.map(code => {
        const m = daymap[code];
        return m ? { code, name: m.n, price: m.p, rate: m.r, vol: m.v || 0, cap: m.cap || 0, market: m.mkt || '' }
                 : { code, name: code, price: 0, rate: 0, error: true };
      });
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json({ ok: list.some(x => x.price > 0), list });
    }

    if (type === 'spark') {
      const code = (req.query.code || '').toString().trim();
      if (!code) return res.status(200).json({ ok: false, error: 'code 파라미터 필요' });
      const d = await kvGet('fr_spark_' + code);
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=600');
      return res.status(200).json(d || { ok: false, code, series: [], error: NOT_READY });
    }

    if (type === 'financials') {
      const code = (req.query.code || '').toString().trim();
      if (!code) return res.status(200).json({ ok: false, error: 'code 파라미터 필요' });
      const d = await kvGet('fr_fin_' + code);
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
      return res.status(200).json(d || { ok: false, code, error: '재무 데이터 준비 중입니다.' });
    }

    if (type === 'naver') {
      const code = (req.query.code || '').toString().trim();
      if (!code) return res.status(200).json({ ok: false, error: 'code 파라미터 필요' });
      const d = await kvGet('fr_naver_' + code);
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=600');
      return res.status(200).json(d || { ok: false, code, error: '네이버 데이터 준비 중' });
    }

    if (type === 'global') {
      const d = await kvGet('fr_global');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
      return res.status(200).json(d || { ok: false, items: [], error: '글로벌 데이터 없음(GF 시트 미연결)' });
    }

    if (type === 'list') {
      const d = await kvGet('fr_list');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
      return res.status(200).json(d || { ok: false, list: [], error: NOT_READY });
    }

    if (type === 'search') {
      const q = (req.query.q || '').toString().trim().toLowerCase();
      if (!q) return res.status(200).json({ ok: true, list: [] });
      const idx = (await kvGet('fr_search')) || [];
      const starts = [], contains = [];
      for (const it of idx) {
        const nm = (it.n || '').toLowerCase();
        if (it.code === q || nm === q) starts.unshift(it);
        else if (nm.startsWith(q) || it.code.startsWith(q)) starts.push(it);
        else if (nm.includes(q)) contains.push(it);
        if (starts.length >= 12) break;
      }
      const list = starts.concat(contains).slice(0, 12)
        .map(it => ({ code: it.code, name: it.n, market: it.mkt || '', sector: it.s || '' }));
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json({ ok: true, list });
    }

    return res.status(400).json({ ok: false, error: '알 수 없는 type: ' + type });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

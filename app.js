// 종목 라운지 — app.js
// 프론트엔드(HTML + CSS + vanilla JS + Chart.js).
// 데이터: /api/stocks (KV 선계산 · DART/공공데이터). 백엔드 미가용 시 stocks-seed.js 로 폴백.
'use strict';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const el  = id => document.getElementById(id);
const qsa = sel => Array.from(document.querySelectorAll(sel));
function escapeHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
const h = escapeHtml;

const won  = n => (n==null ? '-' : Number(n).toLocaleString('ko-KR') + '원');
const num  = n => (n==null ? '-' : Number(n).toLocaleString('ko-KR'));
const pct  = n => (n==null ? '-' : (n>=0?'+':'') + Number(n).toFixed(2) + '%');
const cls  = n => (n>0 ? 'up' : n<0 ? 'dn' : 'flat');
const arrow= n => (n>0 ? '▲' : n<0 ? '▼' : '·');
function fmtCap(eok){
  if(eok==null) return '-';
  if(eok>=10000){ const jo=eok/10000; return jo.toFixed(jo>=100?0:1).replace(/\.0$/,'') + '조'; }
  return Number(eok).toLocaleString('ko-KR') + '억';
}
function fmtVol(v){
  if(v==null) return '-';
  if(v>=10000) return (v/10000).toLocaleString('ko-KR',{maximumFractionDigits:0}) + '만';
  return Number(v).toLocaleString('ko-KR');
}
function fmtEok(eok){
  if(eok==null) return '-';
  const sign = eok<0?'-':''; const a=Math.abs(eok);
  if(a>=10000){ const jo=a/10000; return sign + jo.toFixed(1).replace(/\.0$/,'') + '조'; }
  return sign + Number(a).toLocaleString('ko-KR') + '억';
}
const ratio = (n,unit='%',d=1) => (n==null ? 'N/A' : Number(n).toFixed(d)+unit);
// 'YYYYMMDD' → 'MM.DD' / 월봉 'YY.MM'
function fmtD(d, monthly){ return monthly ? `${d.slice(2,4)}.${d.slice(4,6)}` : `${+d.slice(4,6)}.${+d.slice(6,8)}`; }
function dashD(d){ return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; }
const clampN = (v,a,b)=>Math.max(a,Math.min(b,v));
const PALETTE = ['#1E3A5F','#2D7D6F','#C8973A','#7C5CDB','#E23B3B','#2563EB','#0E9CC0','#D9679C','#5B8C5A','#64748B'];
function fmtKstDateTime(v){
  if(!v) return '';
  const d = new Date(v);
  if(Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone:'Asia/Seoul',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  }).replace(/\.\s?/g,'. ').trim();
}

// 단순이동평균 (앞쪽은 null)
function calcMA(values, n){
  const out=[]; let sum=0;
  for(let i=0;i<values.length;i++){
    sum += values[i];
    if(i>=n) sum -= values[i-n];
    out.push(i>=n-1 ? +(sum/n).toFixed(0) : null);
  }
  return out;
}
function roundRectPath(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

// ── 커스텀 Chart.js 플러그인 ─────────────────────────────
// 크로스헤어 (호버 지점 세로 점선)
const crosshairPlugin = {
  id:'crosshair',
  afterDatasetsDraw(chart){
    const t = chart.tooltip;
    if(!t || !t.getActiveElements || !t.getActiveElements().length) return;
    const x = t.getActiveElements()[0].element.x;
    const {top, bottom} = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save(); ctx.setLineDash([4,4]); ctx.lineWidth=1; ctx.strokeStyle='rgba(15,37,64,.30)';
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
  }
};
// 현재가 점선 + 우측 가격 라벨
const lastPricePlugin = {
  id:'lastPrice',
  afterDatasetsDraw(chart, args, opts){
    if(!opts || opts.price==null || !chart.scales.y) return;
    const y = chart.scales.y.getPixelForValue(opts.price);
    const {left, right, top, bottom} = chart.chartArea;
    if(y<top || y>bottom) return;
    const ctx = chart.ctx;
    const col = opts.up ? '#E23B3B' : '#2563EB';
    ctx.save();
    ctx.setLineDash([5,4]); ctx.lineWidth=1; ctx.strokeStyle=col+'88';
    ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke();
    ctx.restore();
  }
};
// 캔들스틱 직접 렌더 (증권사형) — chart.$ohlc = {bars, maxV} 필요
const candlePlugin = {
  id:'candles',
  beforeDatasetsDraw(chart, args, o){
    if(!o || !o.bars || !o.bars.length) return;
    const {ctx} = chart;
    const xs = chart.scales.x, ys = chart.scales.y;
    const {left, right, top, bottom} = chart.chartArea;
    const n = o.bars.length;
    const slot = (right-left)/Math.max(n,1);
    const bodyW = clampN(slot*0.66, 1.5, o.big?26:18);
    const volBandTop = bottom - (bottom-top)*0.22;   // 하단 22% 거래량 밴드
    const maxV = o.maxV || 1;
    ctx.save();
    o.bars.forEach((b,i)=>{
      const x = xs.getPixelForValue(i);
      if(x==null || isNaN(x)) return;
      const up = b.c>=b.o;
      const col = up ? '#E8453C' : '#2D63E8';
      // 거래량 (반투명, 하단 밴드)
      if(b.v){
        const vh = clampN((b.v/maxV)*(bottom-volBandTop), 0, bottom-volBandTop);
        ctx.fillStyle = up ? 'rgba(232,69,60,.20)' : 'rgba(45,99,232,.20)';
        ctx.fillRect(x-bodyW/2, bottom-vh, bodyW, vh);
      }
      // 심지
      ctx.strokeStyle = col; ctx.lineWidth = clampN(bodyW*0.13, 1, 2.4); ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x, ys.getPixelForValue(b.h)); ctx.lineTo(x, ys.getPixelForValue(b.l)); ctx.stroke();
      // 몸통 (음영)
      const yo = ys.getPixelForValue(b.o), yc = ys.getPixelForValue(b.c);
      let by = Math.min(yo,yc), bh = Math.abs(yo-yc); if(bh<1.4) bh=1.4;
      ctx.shadowColor='rgba(15,37,64,.20)'; ctx.shadowBlur=3.5; ctx.shadowOffsetY=1.2;
      ctx.fillStyle = col;
      roundRectPath(ctx, x-bodyW/2, by, bodyW, bh, clampN(bodyW*0.16,1,3)); ctx.fill();
      ctx.shadowColor='transparent';
      // 상승봉 하이라이트(상단 라이트)
      if(up){ ctx.fillStyle='rgba(255,255,255,.18)'; roundRectPath(ctx, x-bodyW/2, by, bodyW, Math.min(bh,3), 1); ctx.fill(); }
    });
    ctx.restore();
  }
};

// 도넛 중앙 텍스트
const centerTextPlugin = {
  id:'centerText',
  afterDraw(chart, args, opts){
    if(!opts || !opts.lines || !opts.lines.length) return;
    const {left,right,top,bottom} = chart.chartArea;
    const cx=(left+right)/2, cy=(top+bottom)/2;
    const ctx = chart.ctx;
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='600 10.5px Pretendard,sans-serif'; ctx.fillStyle='#7A92A8';
    ctx.fillText(opts.lines[0], cx, cy-11);
    ctx.font='800 17px Pretendard,sans-serif'; ctx.fillStyle='#0F2540';
    ctx.fillText(opts.lines[1]||'', cx, cy+9);
    ctx.restore();
  }
};

// ─────────────────────────────────────────────────────────────
// 데이터 레이어 (/api/stocks + 시드 폴백)
// ─────────────────────────────────────────────────────────────
const API_BASE = (typeof window!=='undefined' && window.API_BASE!=null) ? window.API_BASE : '';
let API_OK = false;
async function api(type, params={}){
  const qs = new URLSearchParams(Object.assign({type}, params)).toString();
  const r = await fetch(`${API_BASE}/api/stocks?${qs}`, { cache:'no-store' });
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

function normListItem(x){
  return {
    code:x.code, name:x.name, market:x.market||'', sector:x.sector||'기타',
    price:x.price, change:x.rate, volume:x.vol, amount:x.amount, marketCap:x.cap,
    per:null, roe:null, eps:null, opMarginNow:null, debtNow:null, comment:'',
    years:[], revenue:[], operatingProfit:[], netProfit:[], debtRatio:[], opMargin:[],
    _finLoaded:false, _finEmpty:false,
  };
}
function normSeed(s){
  return {
    code:s.code, name:s.name, market:s.market||'', sector:s.sector||'기타',
    price:s.price, change:s.change, volume:s.volume, amount:(s.price*s.volume)||0, marketCap:s.marketCap,
    per:s.per||null, roe:s.roe??null, eps:null, opMarginNow:null, debtNow:(s.debtRatio?s.debtRatio[s.debtRatio.length-1]:null),
    comment:s.comment||'',
    years:s.years||[], revenue:s.revenue||[], operatingProfit:s.operatingProfit||[], netProfit:s.netProfit||[],
    debtRatio:s.debtRatio||[], opMargin:(s.operatingProfit||[]).map((op,i)=> s.revenue&&s.revenue[i]>0 ? +((op/s.revenue[i])*100).toFixed(1):null),
    _finLoaded:true, _finEmpty:!(s.years&&s.years.length),
  };
}

let STOCKS = [];
const DATA = { amount:[], volume:[], marketcap:[], overview:null, basisDate:null, updatedAt:null, marketDataAt:null };
const sparkCache = {};

function getStock(code){ return STOCKS.find(s=>s.code===code) || null; }

async function loadData(){
  try{
    const [ov, cap, vol, amt] = await Promise.all([ api('overview'), api('marketcap'), api('volume'), api('amount') ]);
    if(!(cap.list&&cap.list.length) && !(vol.list&&vol.list.length) && !(amt.list&&amt.list.length)) throw new Error('빈 응답');
    DATA.overview  = ov && ov.ok ? ov : null;
    DATA.basisDate = (amt.basisDate || cap.basisDate || vol.basisDate || (ov&&ov.basisDate)) || null;
    DATA.updatedAt = (amt.updatedAt || cap.updatedAt || vol.updatedAt || null);
    DATA.marketDataAt = (amt.marketDataAt || cap.marketDataAt || vol.marketDataAt || null);
    DATA.amount    = (amt.list||[]).map(normListItem);
    DATA.marketcap = (cap.list||[]).map(normListItem);
    DATA.volume    = (vol.list||[]).map(normListItem);
    const m={}; [...DATA.amount, ...DATA.marketcap, ...DATA.volume].forEach(s=>{ if(!m[s.code]) m[s.code]=s; });
    STOCKS = Object.values(m);
    API_OK = true;
  }catch(e){
    API_OK = false;
    STOCKS = (window.STOCKS_SEED||[]).map(normSeed);
    DATA.amount    = [...STOCKS].sort((a,b)=>(b.amount||0)-(a.amount||0));
    DATA.marketcap = [...STOCKS].sort((a,b)=>b.marketCap-a.marketCap);
    DATA.volume    = [...STOCKS].sort((a,b)=>b.volume-a.volume);
    DATA.overview  = null;
    DATA.updatedAt = null;
    DATA.marketDataAt = null;
  }
}

function mergeFin(s, f){
  s.years = f.years||[];
  s.revenue = f.revenue||[];
  s.operatingProfit = f.opIncome||[];
  s.netProfit = f.netIncome||[];
  s.debtRatio = f.debtRatio||[];
  s.opMargin = f.opMargin||[];
  if(f.roe!=null) s.roe = f.roe;
  if(f.per!=null) s.per = f.per;
  s.eps = f.eps??null;
  s.equity = f.equity??null;          // PBR=시총/자기자본
  s.dividend = f.dividend||null;      // {dps,payoutRatio,divYield,divYear}
  s.reportYear = f.reportYear||null;
  s.opMarginNow = s.opMargin.length ? s.opMargin[s.opMargin.length-1] : null;
  s.debtNow = s.debtRatio.length ? s.debtRatio[s.debtRatio.length-1] : null;
  if(!s.comment) s.comment = genComment(s);
  s._finLoaded = true;
  s._finEmpty = !(s.years && s.years.length);
}
function genComment(s){
  const parts=[];
  if(s.revenue&&s.revenue.length){ parts.push('최근 매출 '+fmtEok(s.revenue[s.revenue.length-1])); }
  if(s.opMarginNow!=null) parts.push('영업이익률 '+s.opMarginNow.toFixed(1)+'%');
  if(s.roe!=null) parts.push('ROE '+s.roe.toFixed(1)+'%');
  if(s.debtNow!=null) parts.push('부채비율 '+s.debtNow.toFixed(0)+'%');
  return parts.join(' · ') || '재무 데이터 기반 요약';
}

async function ensureFinancials(code){
  const s = getStock(code); if(!s) return null;
  if(s._finLoaded) return s;
  if(API_OK){
    try{ const f = await api('financials',{code}); if(f.ok){ mergeFin(s,f); return s; } }catch(e){}
  }
  s._finLoaded = true; s._finEmpty = !(s.years && s.years.length);
  return s;
}
// 상세 캐시 로딩(외국인·수급·PBR·컨센서스)
async function ensureNaver(code){
  const s = getStock(code); if(!s) return null;
  if(s._naverLoaded) return s.naver;
  s._naverLoaded = true;
  if(API_OK){ try{ const n=await api('naver',{code}); if(n && n.ok) s.naver=n; }catch(e){} }
  return s.naver||null;
}
// 업종 평균 계산용: 같은 섹터 종목 재무 선로딩
async function ensureSectorFin(sector){
  const peers = STOCKS.filter(x=>(x.sector||'기타')===sector && !x._finLoaded).slice(0,12);
  await Promise.all(peers.map(p=>ensureFinancials(p.code)));
}
// 가격 이력(스파크/캔들) — 전체 객체 캐시 {dates,open,high,low,close,vol,series}
async function ensureSpark(code){
  if(code in sparkCache) return sparkCache[code];
  let sp = null;
  if(API_OK){ try{ const r = await api('spark',{code}); if(r.ok && r.series && r.series.length) sp = r; }catch(e){} }
  sparkCache[code] = sp;
  return sp;
}

// ─────────────────────────────────────────────────────────────
// 차트 공통
// ─────────────────────────────────────────────────────────────
const FONT = "'Pretendard',sans-serif";
const COLOR = { navy:'#1E3A5F', teal:'#2D7D6F', tealLight:'#3A9E8D', gold:'#C8973A', gain:'#E23B3B', loss:'#2563EB', text2:'#3D5A7A', text3:'#7A92A8', grid:'rgba(0,0,0,.06)' };
function baseScales(extra){
  return Object.assign({
    x:{ grid:{display:false}, border:{color:'rgba(0,0,0,.08)'}, ticks:{font:{family:FONT,size:11.5,weight:'600'},color:COLOR.text2} },
    y:{ grid:{color:COLOR.grid,drawBorder:false}, border:{display:false}, ticks:{font:{family:FONT,size:11},color:COLOR.text3,padding:6}, grace:'10%' }
  }, extra||{});
}
function baseLegend(){ return { display:true, align:'end', labels:{font:{family:FONT,size:11.5},color:COLOR.text2,usePointStyle:true,pointStyleWidth:10,boxHeight:7} }; }
function baseTooltip(fmt){
  return { bodyFont:{family:FONT,size:12}, titleFont:{family:FONT,weight:'600',size:12}, backgroundColor:'rgba(15,37,64,.92)', padding:10, cornerRadius:8, displayColors:true, usePointStyle:true,
    callbacks: fmt ? { label:ctx=>`${ctx.dataset.label}: ${fmt(ctx.raw)}` } : {} };
}
function mountChart(canvasId, config){
  const canvas = el(canvasId);
  if(!canvas || typeof Chart==='undefined') return null;
  const ex = Chart.getChart(canvas); if(ex) ex.destroy();
  return new Chart(canvas.getContext('2d'), config);
}
// 히어로/카드용 단순 스파크라인
function drawSpark(canvasId, series, change, light){
  const canvas = el(canvasId);
  if(!canvas || typeof Chart==='undefined' || !series || series.length<2) return;
  const ex = Chart.getChart(canvas); if(ex) ex.destroy();
  const up = (change==null) ? (series[series.length-1] >= series[0]) : change>=0;
  const col = light ? (up?'#FF8A8A':'#9CC0FF') : (up?COLOR.gain:COLOR.loss);
  const fill = light ? 'rgba(255,255,255,.12)' : (up?'rgba(226,59,59,.08)':'rgba(37,99,235,.08)');
  new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{ labels:series.map((_,i)=>i), datasets:[{ data:series, borderColor:col, backgroundColor:fill, borderWidth:1.7, pointRadius:0, fill:true, tension:.3 }] },
    options:{ responsive:true, maintainAspectRatio:false, animation:false,
      plugins:{ legend:{display:false}, tooltip:{enabled:false} },
      scales:{ x:{display:false}, y:{display:false} }, elements:{line:{borderJoinStyle:'round'}} }
  });
}
// 대시보드 확장행용 미니 가격차트 (최근 30영업일, 날짜 라벨·툴팁 O)
function drawMiniPrice(canvasId, sp){
  const n = 30;
  const closes = sp.series.slice(-n);
  const dates = (sp.dates||[]).slice(-n);
  const up = closes[closes.length-1] >= closes[0];
  const col = up ? COLOR.gain : COLOR.loss;
  mountChart(canvasId, {
    type:'line',
    data:{ labels:dates.map(d=>fmtD(d)), datasets:[{ data:closes, borderColor:col, backgroundColor: up?'rgba(226,59,59,.07)':'rgba(37,99,235,.07)', borderWidth:1.8, pointRadius:0, pointHoverRadius:4, pointHoverBackgroundColor:col, fill:true, tension:.3 }] },
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:250}, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{ ...baseTooltip(), displayColors:false, callbacks:{ title:items=>dates[items[0].dataIndex]?dashD(dates[items[0].dataIndex]):'', label:ctx=>num(ctx.raw)+'원' } } },
      scales:{ x:{ grid:{display:false}, ticks:{maxTicksLimit:5,font:{family:FONT,size:10},color:COLOR.text3} },
               y:{ grid:{color:COLOR.grid}, border:{display:false}, ticks:{maxTicksLimit:4,font:{family:FONT,size:10},color:COLOR.text3,callback:v=>num(v)} } } }
  });
}

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
const WL_KEY = 'stock_lounge_wl';
const RECENT_KEY = 'stock_lounge_recent';
let currentTab = 'dashboard';
let selectedCode = null;
let compareSel = [];
let curSpark = null;                                  // 분석 탭 현재 종목 가격이력
const chartState = { period:'3M', interval:'D' };     // 캔들차트 설정

function loadWatchlist(){ try{ return JSON.parse(localStorage.getItem(WL_KEY)||'[]'); }catch(e){ return []; } }
function saveWatchlist(arr){ try{ localStorage.setItem(WL_KEY, JSON.stringify(arr)); }catch(e){} }
function isWatched(code){ return loadWatchlist().includes(code); }
function toggleWatch(code){
  const wl = loadWatchlist(); const i = wl.indexOf(code);
  if(i>=0) wl.splice(i,1); else wl.push(code);
  saveWatchlist(wl); return wl.includes(code);
}
function loadRecent(){ try{ return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]'); }catch(e){ return []; } }
function pushRecent(code){
  try{
    let r = loadRecent().filter(c=>c!==code);
    r.unshift(code);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0,8)));
  }catch(e){}
}

// ─────────────────────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────────────────────
function switchTab(name, skipHash){
  currentTab = name;
  qsa('.tab-view').forEach(v=>v.classList.toggle('active', v.id==='tab-'+name));
  qsa('.nav-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
  if(!skipHash){ try{ history.replaceState(null,'','#'+name); }catch(e){ location.hash=name; } }
  renderCurrentTab();
  window.scrollTo(0,0);
}
window.switchTab = switchTab;

function renderCurrentTab(){
  switch(currentTab){
    case 'dashboard': renderDashboard(); break;
    case 'analysis':  renderAnalysis();  break;
    case 'ranking':   renderRanking();   break;
    case 'compare':   renderCompare();   break;
    case 'watchlist': renderWatchlist(); break;
  }
  renderDataFreshness();
}

function renderDataFreshness(){
  const box = el('data-freshness'); if(!box) return;
  const t = DATA.marketDataAt || DATA.updatedAt;
  box.textContent = API_OK && t ? `마지막 갱신 ${fmtKstDateTime(t)}` : '';
}

// ─────────────────────────────────────────────────────────────
// 대시보드 (3단 목록 + 행 클릭 미니차트)
// ─────────────────────────────────────────────────────────────
function renderDashboard(){
  const badge = el('hero-badge');
  if(badge) badge.innerHTML = `<span class="hero-badge-dot"></span>${ API_OK ? (DATA.basisDate? h(DATA.basisDate)+' 기준' : '데이터 기준 확인 중') : '오프라인 시드 데이터' }`;

  const ov = DATA.overview;
  if(ov && ov.breadth){
    const k=ov.kospi, q=ov.kosdaq, b=ov.breadth;
    el('hero-stats').innerHTML = `
      ${heroIndex('KOSPI', k, 'hero-spk-k')}
      ${heroIndex('KOSDAQ', q, 'hero-spk-q')}
      <div class="hero-stat"><div class="v"><span class="up">${b.up}</span> <span style="font-size:15px;opacity:.6">/</span> <span class="dn">${b.down}</span></div><div class="l">상승 / 하락 종목</div></div>
      <div class="hero-stat"><div class="v">${ov.usdKrw?Number(ov.usdKrw).toFixed(1):'-'}</div><div class="l">원/달러 환율</div></div>`;
    if(k && k.spark) drawSpark('hero-spk-k', k.spark, k.rate, true);
    if(q && q.spark) drawSpark('hero-spk-q', q.spark, q.rate, true);
  } else {
    const ups=STOCKS.filter(s=>s.change>0).length, downs=STOCKS.filter(s=>s.change<0).length;
    const turnover=STOCKS.reduce((a,s)=>a+(s.amount||0)/1e8,0);
    el('hero-stats').innerHTML = `
      <div class="hero-stat"><div class="v up">${ups}<span style="font-size:14px"> 종목</span></div><div class="l">상승</div></div>
      <div class="hero-stat"><div class="v dn">${downs}<span style="font-size:14px"> 종목</span></div><div class="l">하락</div></div>
      <div class="hero-stat"><div class="v">${STOCKS.length-ups-downs}<span style="font-size:14px"> 종목</span></div><div class="l">보합</div></div>
      <div class="hero-stat"><div class="v">${fmtCap(Math.round(turnover))}</div><div class="l">추정 거래대금</div></div>`;
  }

  renderSectorDonut();
  renderBreadth();
  renderGlobalStrip();

  el('dash-amount-list').innerHTML = topAmountList().slice(0,6).map((s,i)=>rankItemHtml(s,i,'amount','amt')).join('');
  el('dash-volume-list').innerHTML = DATA.volume.slice(0,6).map((s,i)=>rankItemHtml(s,i,'volume','vol')).join('');
  el('dash-mcap-list').innerHTML = DATA.marketcap.slice(0,6).map((s,i)=>rankItemHtml(s,i,'mcap','cap')).join('');
}
function heroIndex(label, idx, sparkId){
  if(!idx) return `<div class="hero-stat"><div class="v">-</div><div class="l">${label}</div></div>`;
  const c = idx.rate>0?'up':idx.rate<0?'dn':'';
  return `<div class="hero-stat">
    ${sparkId?`<div class="hs-spark"><canvas id="${sparkId}"></canvas></div>`:''}
    <div class="v">${Number(idx.price).toLocaleString('ko-KR',{maximumFractionDigits:2})}</div>
    <div class="l">${label} <span class="${c}" style="font-weight:700">${pct(idx.rate)}</span></div>
  </div>`;
}

// 글로벌 지수·환율 스트립 (구글파이낸스 게시 시트) — 데이터 없으면 숨김
const GF_LABEL={ NASDAQ:'나스닥', DOW:'다우', SP500:'S&P 500', KOSPI:'코스피', KOSDAQ:'코스닥', USDKRW:'원/달러', EURKRW:'원/유로', JPYKRW:'원/100엔' };
let _globalDone=false;
function renderGlobalStrip(){
  const box=el('global-strip'); if(!box || _globalDone) return;
  if(!API_OK){ return; }
  api('global').then(g=>{
    if(!g || !g.ok || !g.items || !g.items.length){ box.innerHTML=''; return; }
    _globalDone=true;
    box.className='global-strip';
    box.innerHTML=g.items.slice(0,8).map(it=>{
      const cp=it.changePct; const c=cp==null?'flat':(cp>0?'up':cp<0?'dn':'flat');
      const isFx=/KRW/i.test(it.key);
      return `<div class="gs-chip"><span class="k">${h(GF_LABEL[it.key]||it.key)}</span>
        <span class="v">${it.value.toLocaleString('ko-KR',{maximumFractionDigits:isFx?1:2})}</span>
        ${cp!=null?`<span class="c ${c}">${cp>0?'+':''}${cp.toFixed(2)}%</span>`:''}</div>`;
    }).join('');
  }).catch(()=>{});
}

function topAmountList(){
  const base = DATA.amount && DATA.amount.length ? DATA.amount : STOCKS;
  return [...base].filter(s=>(s.amount||0)>0).sort((a,b)=>(b.amount||0)-(a.amount||0));
}
function defaultAnalysisCode(){
  return topAmountList()[0]?.code || DATA.marketcap[0]?.code || STOCKS[0]?.code || null;
}

// 섹터 구성 도넛 (시총 가중)
function renderSectorDonut(){
  const box = el('donut-legend'); if(!box) return;
  const agg = {};
  DATA.marketcap.forEach(s=>{ const k=s.sector||'기타'; agg[k]=(agg[k]||0)+(s.marketCap||0); });
  let entries = Object.entries(agg).sort((a,b)=>b[1]-a[1]);
  if(entries.length>7){
    const head = entries.slice(0,6);
    const restSum = entries.slice(6).reduce((a,[,v])=>a+v,0);
    entries = [...head, ['그 외', restSum]];
  }
  const total = entries.reduce((a,[,v])=>a+v,0) || 1;
  mountChart('donut-sector', {
    type:'doughnut',
    data:{ labels:entries.map(([k])=>k), datasets:[{ data:entries.map(([,v])=>v), backgroundColor:PALETTE, borderWidth:2.5, borderColor:'#fff', hoverOffset:7, borderRadius:3 }] },
    options:{ responsive:true, maintainAspectRatio:true, cutout:'70%', animation:{duration:600,easing:'easeOutQuart'},
      plugins:{ legend:{display:false}, centerText:{ lines:['시총 합계', fmtCap(Math.round(total))] },
        tooltip:{ ...baseTooltip(), callbacks:{ label:ctx=>` ${ctx.label}: ${fmtCap(Math.round(ctx.raw))} (${(ctx.raw/total*100).toFixed(1)}%)` } } } },
    plugins:[centerTextPlugin]
  });
  box.innerHTML = entries.map(([k,v],i)=>`
    <div class="dl-item">
      <span class="dl-dot" style="background:${PALETTE[i%PALETTE.length]}"></span>
      <span class="dl-name">${h(k)}</span>
      <span class="dl-val">${fmtCap(Math.round(v))}</span>
      <span class="dl-pct">${(v/total*100).toFixed(1)}%</span>
    </div>`).join('');
}

// 시장 온도 (등락 분포 스택바)
function renderBreadth(){
  const box = el('breadth-box'); if(!box) return;
  const ov = DATA.overview;
  let up, down, flat;
  if(ov && ov.breadth){ ({up,down,flat} = ov.breadth); }
  else { up=STOCKS.filter(s=>s.change>0).length; down=STOCKS.filter(s=>s.change<0).length; flat=STOCKS.length-up-down; }
  const tot = (up+down+flat) || 1;
  const upStock   = [...STOCKS].sort((a,b)=>b.change-a.change)[0];
  const downStock = [...STOCKS].sort((a,b)=>a.change-b.change)[0];
  box.innerHTML = `
    <div class="breadth-bar">
      <div class="seg-up" style="width:${(up/tot*100).toFixed(1)}%"></div>
      <div class="seg-flat" style="width:${(flat/tot*100).toFixed(1)}%"></div>
      <div class="seg-dn" style="width:${(down/tot*100).toFixed(1)}%"></div>
    </div>
    <div class="breadth-legend">
      <div class="bl-item"><span class="d" style="background:#E23B3B"></span><span class="n">상승</span><span class="c up">${num(up)}</span></div>
      <div class="bl-item"><span class="d" style="background:#CBD5E1"></span><span class="n">보합</span><span class="c" style="color:var(--text3)">${num(flat)}</span></div>
      <div class="bl-item"><span class="d" style="background:#2563EB"></span><span class="n">하락</span><span class="c dn">${num(down)}</span></div>
    </div>
    <div class="breadth-stats">
      ${upStock?`<div class="bs-card" style="cursor:pointer" onclick="openAnalysis('${upStock.code}')"><div class="l">유니버스 최고 상승</div><div class="v">${h(upStock.name)} <span class="up">${pct(upStock.change)}</span></div></div>`:''}
      ${downStock?`<div class="bs-card" style="cursor:pointer" onclick="openAnalysis('${downStock.code}')"><div class="l">유니버스 최대 하락</div><div class="v">${h(downStock.name)} <span class="dn">${pct(downStock.change)}</span></div></div>`:''}
    </div>`;
}

function rankItemHtml(s, i, panel, mode){
  let right;
  if(mode==='amt')      right = `<div class="rank-num"><div class="v">${fmtCap(Math.round((s.amount||0)/1e8))}</div><div class="chg ${cls(s.change)}">${pct(s.change)}</div></div>`;
  else if(mode==='vol') right = `<div class="rank-num"><div class="v">${fmtVol(s.volume)}</div><div class="chg ${cls(s.change)}">${pct(s.change)}</div></div>`;
  else if(mode==='cap') right = `<div class="rank-num"><div class="v">${fmtCap(s.marketCap)}</div><div class="chg ${cls(s.change)}">${pct(s.change)}</div></div>`;
  else                  right = `<div class="rank-num"><div class="v">${num(s.price)}</div><div class="chg ${cls(s.change)}">${arrow(s.change)} ${pct(s.change)}</div></div>`;
  return `<div class="rank-item">
    <div class="rank-row" onclick="toggleRowChart('${panel}','${s.code}')">
      <div class="rank-no">${i+1}</div>
      <div class="rank-info"><div class="rank-name">${h(s.name)}</div><div class="rank-meta">${h(s.market)} · ${h(s.sector)}</div></div>
      ${right}
    </div>
    <div class="rank-chart" id="rc-${panel}-${s.code}" style="display:none">
      <div class="rank-chart-wrap"></div>
      <div class="rank-chart-foot"><span id="rcm-${panel}-${s.code}"></span><button class="go" onclick="event.stopPropagation();openAnalysis('${s.code}')">종목 분석 →</button></div>
    </div>
  </div>`;
}

// 행 클릭 → 미니 가격차트 토글 (패널당 1개만 펼침)
async function toggleRowChart(panel, code){
  const box = el(`rc-${panel}-${code}`);
  if(!box) return;
  const wasOpen = box.style.display !== 'none';
  const panelId = panel==='amount' ? 'amount' : panel==='volume' ? 'volume' : 'mcap';
  qsa(`#dash-${panelId}-list .rank-chart`).forEach(b=>{ b.style.display='none'; });
  if(wasOpen) return;
  box.style.display = 'block';
  const wrap = box.querySelector('.rank-chart-wrap');
  wrap.innerHTML = `<canvas id="rcc-${panel}-${code}"></canvas>`;
  const sp = await ensureSpark(code);
  if(box.style.display==='none') return;   // 로딩 중 닫힘
  if(!sp || !sp.series || sp.series.length<2){
    wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px">가격 이력이 아직 없습니다</div>`;
    return;
  }
  drawMiniPrice(`rcc-${panel}-${code}`, sp);
  const seg = sp.series.slice(-30);
  const chg = (seg[seg.length-1]-seg[0])/seg[0]*100;
  const m = el(`rcm-${panel}-${code}`);
  if(m) m.innerHTML = `최근 30영업일 <b class="${cls(chg)}" style="margin-left:4px">${pct(chg)}</b>`;
}
window.toggleRowChart = toggleRowChart;

function openRanking(basis){
  setRankBasis(basis);
  switchTab('ranking');
}
window.openRanking = openRanking;

function openAnalysis(code){ selectedCode = code; pushRecent(code); switchTab('analysis'); }
window.openAnalysis = openAnalysis;

// ─────────────────────────────────────────────────────────────
// 종목 분석 — 선택(피커+퀵칩) / 캔들차트 / 재무
// ─────────────────────────────────────────────────────────────
function renderAnalysis(){
  setupPicker();
  if(!selectedCode || !getStock(selectedCode)) selectedCode = defaultAnalysisCode();
  const s = getStock(selectedCode);
  const inp = el('stock-picker');
  if(inp && s) inp.value = `${s.name} (${s.code})`;
  el('watch-toggle').onclick = ()=>{ if(selectedCode){ toggleWatch(selectedCode); updateWatchBtn(); renderQuickChips(); } };
  renderQuickChips();
  renderAnalysisBody();
}
function updateWatchBtn(){
  const on = isWatched(selectedCode);
  const btn = el('watch-toggle');
  btn.classList.toggle('on', on);
  btn.innerHTML = on ? '★ 관심종목 해제' : '☆ 관심종목 추가';
}

// 검색형 콤보박스 (유니버스 내 검색)
let pickerTimer=null, pickerResults=[], pickerActive=-1;
function setupPicker(){
  const input = el('stock-picker'), pop = el('picker-pop');
  if(!input || input._bound) return;
  input._bound = true;
  const topAmount = ()=>topAmountList().slice(0,5).map(s=>({code:s.code,name:s.name,market:s.market,sector:s.sector,amount:s.amount}));
  const close = ()=>{ pop.classList.remove('show'); pickerActive=-1; };
  const renderPop = (list, emptyMsg)=>{
    pickerResults = list; pickerActive=-1;
    pop.innerHTML = list.length ? list.map((it,i)=>`
      <button class="nsr-item" data-i="${i}" onclick="pickStock('${it.code}')">
        <div class="nsr-main"><div class="nsr-name">${h(it.name)}</div><div class="nsr-code">${h(it.code)}</div></div>
        <div class="nsr-tags"><span class="nsr-tag">${h(it.market||'')}</span>${it.amount!=null?`<span class="nsr-tag">거래대금 ${fmtCap(Math.round((it.amount||0)/1e8))}</span>`:`<span class="nsr-tag">${h(it.sector||'')}</span>`}</div>
      </button>`).join('')
      : `<div class="nsr-empty">${emptyMsg||'검색 결과가 없습니다.'}</div>`;
    pop.classList.add('show');
  };
  input.addEventListener('focus', ()=>{ input.select(); renderPop(topAmount(), null); });
  input.addEventListener('input', ()=>{
    const q = input.value.trim();
    clearTimeout(pickerTimer);
    if(!q){ renderPop(topAmount()); return; }
    pickerTimer = setTimeout(async ()=>{
      const ql = q.toLowerCase();
      let list = STOCKS.filter(s=> s.name.toLowerCase().includes(ql) || s.code.includes(q)).slice(0,12);
      let emptyMsg = null;
      if(!list.length && API_OK){
        try{
          const r = await api('search',{q});
          if(r.ok && r.list.length) emptyMsg = '전체 시장에는 있지만, 분석 유니버스 종목만 제공합니다.';
        }catch(e){}
      }
      renderPop(list, emptyMsg);
    }, 150);
  });
  input.addEventListener('keydown', (e)=>{
    if(!pop.classList.contains('show') || !pickerResults.length) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); pickerActive=Math.min(pickerActive+1,pickerResults.length-1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); pickerActive=Math.max(pickerActive-1,0); }
    else if(e.key==='Enter'){ e.preventDefault(); const p=pickerResults[pickerActive>=0?pickerActive:0]; if(p) pickStock(p.code); return; }
    else if(e.key==='Escape'){ close(); return; }
    qsa('#picker-pop .nsr-item').forEach(b=>b.classList.toggle('active', +b.dataset.i===pickerActive));
  });
  document.addEventListener('click', (e)=>{ if(!e.target.closest('.picker')) close(); });
}
function pickStock(code){
  const s = getStock(code); if(!s) return;
  selectedCode = code; pushRecent(code);
  const inp = el('stock-picker'); if(inp) inp.value = `${s.name} (${s.code})`;
  el('picker-pop').classList.remove('show');
  renderQuickChips();
  renderAnalysisBody();
}
window.pickStock = pickStock;

// 퀵칩: ★관심 + 최근 본 종목 (없으면 시총 상위)
function renderQuickChips(){
  const box = el('analysis-quick'); if(!box) return;
  const wl = loadWatchlist().filter(c=>getStock(c));
  const rec = loadRecent().filter(c=>getStock(c) && !wl.includes(c));
  let chips = [
    ...wl.map(c=>({code:c, star:true})),
    ...rec.map(c=>({code:c, star:false})),
  ].slice(0,10);
  let label = '바로가기';
  if(!chips.length){ chips = DATA.marketcap.slice(0,6).map(s=>({code:s.code, star:false})); label = '시총 상위'; }
  box.innerHTML = `<span class="ql">${label}</span>` + chips.map(ch=>{
    const s = getStock(ch.code);
    return `<button class="qchip ${ch.code===selectedCode?'cur':''}" onclick="pickStock('${ch.code}')">${ch.star?'<span class="st">★</span>':''}${h(s.name)}</button>`;
  }).join('');
}

async function renderAnalysisBody(){
  const s = getStock(selectedCode);
  if(!s){ el('analysis-body').innerHTML = `<div class="fin-empty"><div class="ico">🔍</div>종목을 선택하세요.</div>`; return; }
  curSpark = null;
  const w = isWatched(s.code);

  el('analysis-body').innerHTML = `
    <div class="az-hero">
      <div class="azh-bar">
        <span class="azh-star ${w?'on':''}" id="azh-star" title="관심종목">${w?'★':'☆'}</span>
        <span class="azh-name">${h(s.name)}</span>
        <span class="azh-code">${h(s.code)}</span>
        <span class="azh-badge">${h(s.market)}</span>
        <span class="azh-badge" style="background:rgba(200,151,58,.18);border-color:rgba(200,151,58,.35)">${h(s.sector)}</span>
        <div class="azh-actions">
          <button class="azh-btn" id="azh-compare">⇄ 비교하기</button>
        </div>
      </div>
      <div class="azh-grid">
        <div class="azh-pricewrap">
          <div class="azh-pday" id="azh-pday">현재가 · ${h(DATA.basisDate||'')} 기준</div>
          <div class="azh-price">${num(s.price)}<small>원</small></div>
          <div class="azh-chg ${cls(s.change)}" id="azh-chg">${arrow(s.change)} ${pct(s.change)}</div>
          <button class="azh-watch ${w?'on':''}" id="azh-watch">${w?'★ 관심종목':'☆ 관심종목'}</button>
          <div class="azh-ohlc" id="azh-ohlc"></div>
        </div>
        <div class="azh-metrics" id="azh-metrics"></div>
      </div>
    </div>

    <div class="az-main-grid">
      <div class="az-card" id="sec-chart">
        <div class="az-card-head"><h3>주가 차트</h3><div class="chart-ctrls" id="price-controls"></div></div>
        <div class="chart-wrap"><canvas id="chart-price"></canvas></div>
      </div>
      <div class="az-side-stack">
        <div class="az-card">
          <div class="az-card-head"><h3>외국인·기관 순매수 <span class="sub">최근 10일</span></h3></div>
          <div id="supply-wrap"><div class="az-ph"><div class="ico">⏳</div><div class="t">수급 불러오는 중…</div></div></div>
          <div class="az-ret-simple" id="return-simple"></div>
        </div>
      </div>
    </div>

    <div class="az-bottom-grid">
      <div class="az-card"><div class="az-card-head"><h3>거래 동향</h3></div><div class="az-kv" id="kv-trade"></div></div>
      <div class="az-card"><div class="az-card-head"><h3>핵심 지표 <span class="info-tip" tabindex="0">?</span></h3></div>
        <div class="az-gauge-wrap"><div class="az-gauge"><canvas id="gauge-core"></canvas><div class="sc"><b id="gauge-sc">–</b><span>지표점수</span></div></div><div class="az-gauge-side" id="gauge-side"></div></div>
      </div>
      <div class="az-card"><div class="az-card-head"><h3>배당 정보</h3></div><div id="kv-div"></div></div>
    </div>

    <div class="analysis-extra-grid">
      <div class="az-card extra-half"><div class="az-card-head"><h3>밸류에이션</h3></div><div id="az-valuation"></div></div>
      <div class="az-card extra-half"><div class="az-card-head"><h3>주주 구성 <span class="sub">보유 비중</span></h3></div><div id="az-holder"></div></div>
      <div class="az-card extra-half"><div class="az-card-head"><h3>외국인 보유율 추이</h3></div><div class="chart-wrap" id="foreign-rate-wrap"><canvas id="chart-foreign-rate"></canvas></div></div>
      <div class="az-card extra-half"><div class="az-card-head"><h3>월별 수익률 히트맵</h3></div><div id="return-heatmap"></div></div>
    </div>

    <div class="az-footer">
      <span class="fl">📅 데이터 기준</span>
      <span class="ev">시세 기준일 <b>${h(DATA.basisDate||'-')}</b></span>
      <span class="ev" id="az-fy"></span>
      <span class="right"><span>데이터는 지연될 수 있습니다</span><span id="az-clock"></span></span>
    </div>`;

  // 워치/비교 버튼
  const setW=()=>{ const on=isWatched(s.code); const wbtn=el('azh-watch'),st=el('azh-star');
    if(wbtn){wbtn.className='azh-watch '+(on?'on':''); wbtn.innerHTML=on?'★ 관심종목':'☆ 관심종목';}
    if(st){st.className='azh-star '+(on?'on':''); st.innerHTML=on?'★':'☆';} };
  const tg=()=>{ toggleWatch(s.code); setW(); renderQuickChips(); };
  el('azh-watch').onclick=tg; el('azh-star').onclick=tg;
  el('azh-compare').onclick=()=>{ compareSel=[s.code]; compareSector='ALL'; switchTab('compare'); };

  renderTradeTrend(s);
  renderAzMetrics(s);
  renderAnalysisExtras(s, null);
  startClock();

  ensureSpark(s.code).then(sp=>{
    if(s.code !== selectedCode) return;
    curSpark = sp;
    renderAzOHLC(s, sp);
    renderAzMetrics(s, sp);
    renderPriceArea();
    renderReturn(s, sp);
    renderTradeTrend(s, sp);
    renderCoreGauge(s);
    renderAnalysisExtras(s, sp);
  });

  // 상세 데이터 — 외국인보유율·정확 PBR·수급차트·컨센서스
  ensureNaver(s.code).then(()=>{
    if(s.code !== selectedCode) return;
    renderAzMetrics(s, curSpark);
    renderSupply(s);
    renderCoreGauge(s);
    renderAnalysisExtras(s, curSpark);
  });

  await ensureFinancials(s.code);
  if(s.code !== selectedCode) return;
  const fyEl=el('az-fy'); if(fyEl && s.reportYear) fyEl.innerHTML='재무 <b>'+s.reportYear+'년 (DART)</b>';
  renderAzMetrics(s, curSpark);
  renderDividend(s);
  renderCoreGauge(s);
  renderAnalysisExtras(s, curSpark);
  // 업종 평균 PER/PBR — 섹터 피어 재무 로딩 후 헤더 지표 갱신
  ensureSectorFin(s.sector).then(()=>{ if(s.code===selectedCode) renderAzMetrics(s, curSpark); });
}

// ── 분석 계산 헬퍼 ──────────────────────────────────────
function sharesOf(s){ return (s.price>0 && s.marketCap>0) ? Math.round(s.marketCap*1e8/s.price) : null; }
function pbrOf(s){ return (s.equity>0) ? +(s.marketCap/s.equity).toFixed(2) : null; }
function divYieldOf(s){ const d=s.dividend; if(!d) return null; if(d.dps>0 && s.price>0) return +(d.dps/s.price*100).toFixed(2); return d.divYield ?? null; }
function sectorAvg(sec, valfn){
  const vals=STOCKS.filter(x=>(x.sector||'기타')===sec).map(valfn).filter(v=>v!=null && isFinite(v) && v>0);
  return vals.length>=2 ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
function marketRank(s){
  const arr=DATA.marketcap.filter(x=>x.market===s.market);
  return arr.filter(x=>x.marketCap>s.marketCap).length + 1;
}
function coreScore(s){ const sc=compScores(s); return Math.round(sc.reduce((a,b)=>a+b,0)/sc.length); }

// ── 히어로: OHLC + 6지표 ────────────────────────────────
function renderAzOHLC(s, sp){
  const box=el('azh-ohlc'); if(!box) return;
  let prev=null, o=null, hi=null, lo=null;
  if(sp && sp.close && sp.close.length){
    const n=sp.close.length;
    prev = n>=2 ? sp.close[n-2] : null;
    o=sp.open?sp.open[n-1]:null; hi=sp.high?sp.high[n-1]:null; lo=sp.low?sp.low[n-1]:null;
  }
  box.innerHTML = `
    <div class="r"><span class="k">전일</span><span class="v">${num(prev)}</span></div>
    <div class="r"><span class="k">시가</span><span class="v">${num(o)}</span></div>
    <div class="r"><span class="k">고가</span><span class="v">${num(hi)}</span></div>
    <div class="r"><span class="k">저가</span><span class="v">${num(lo)}</span></div>
    <div class="r"><span class="k">거래량</span><span class="v">${num(s.volume)}</span></div>
    <div class="r"><span class="k">거래대금</span><span class="v">${fmtCap(Math.round((s.amount||0)/1e8))}</span></div>`;
  // 등락 금액 보강
  if(prev!=null){ const diff=s.price-prev; const c=el('azh-chg'); if(c) c.innerHTML=`${arrow(s.change)} ${num(Math.abs(diff))} ${pct(s.change)}`; }
}

function pbrOfBest(s){ return (s.naver && s.naver.pbr!=null) ? s.naver.pbr : pbrOf(s); }
function renderAzMetrics(s, sp){
  const box=el('azh-metrics'); if(!box) return;
  const nv=s.naver||null;
  const rank=marketRank(s);
  const per=s.per>0?s.per:(nv&&nv.per>0?nv.per:null);
  const perAvg=sectorAvg(s.sector, x=>x.per>0?x.per:null);
  const pbr=pbrOfBest(s);
  const pbrAvg=sectorAvg(s.sector, x=>pbrOfBest(x));
  const dy=divYieldOf(s) ?? (nv?nv.divYield:null);
  const payout=s.dividend?.payoutRatio;
  const fr=nv&&nv.foreignRate!=null?nv.foreignRate:null;
  const m=(l,v,sub,subcls)=>`<div class="azh-m"><div class="l">${l}</div><div class="v">${v}</div>${sub?`<div class="s ${subcls||''}">${sub}</div>`:''}</div>`;
  box.innerHTML =
    m('시가총액', fmtCap(s.marketCap), `${h(s.market)} ${rank}위`) +
    m('PER (12M)', per!=null?per.toFixed(1)+'배':'N/A', perAvg!=null?`업종 평균 ${perAvg.toFixed(1)}배`:'&nbsp;') +
    m('PBR (최근)', pbr!=null?pbr.toFixed(2)+'배':'N/A', pbrAvg!=null?`업종 평균 ${pbrAvg.toFixed(2)}배`:'&nbsp;') +
    m('배당수익률', dy!=null?dy.toFixed(2)+'%':'—', payout!=null?`배당성향 ${payout.toFixed(1)}%`:(dy==null?'무배당/미공시':'&nbsp;')) +
    m('거래량', fmtVol(s.volume)+'주', `거래대금 ${fmtCap(Math.round((s.amount||0)/1e8))}`) +
    m('외국인 보유율', fr!=null?fr.toFixed(2)+'%':'—', fr!=null?'외인소진율':'로딩 중');
}

// ── 외국인·기관 순매수 차트 ────────────────────────────
function renderSupply(s){
  const box=el('supply-wrap'); if(!box) return;
  const sup=s.naver&&s.naver.supply;
  if(!sup || !sup.length){
    box.innerHTML=`<div class="az-ph"><div class="ico">🔒</div><div class="t">수급 데이터 없음</div><div class="d">수급 데이터를 불러오지 못했습니다.</div></div>`;
    return;
  }
  box.innerHTML=`<div class="chart-wrap" style="height:210px"><canvas id="chart-supply"></canvas></div>
    <div style="font-size:10.5px;color:var(--text3);margin-top:6px;text-align:right">단위: 주 · 순매수(+)/순매도(−)</div>`;
  const labels=sup.map(d=>fmtD(d.date));
  mountChart('chart-supply',{
    type:'bar',
    data:{labels, datasets:[
      {label:'외국인', data:sup.map(d=>d.foreign), backgroundColor:COLOR.navy, borderRadius:2, maxBarThickness:11},
      {label:'기관', data:sup.map(d=>d.organ), backgroundColor:COLOR.teal, borderRadius:2, maxBarThickness:11},
    ]},
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:400}, interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true, align:'start', labels:{font:{family:FONT,size:11,weight:'700'},color:COLOR.text2,usePointStyle:true,pointStyleWidth:12,boxHeight:6,padding:12}},
        tooltip:{...baseTooltip(), callbacks:{title:items=>sup[items[0].dataIndex]?dashD(sup[items[0].dataIndex].date):'', label:ctx=>` ${ctx.dataset.label}: ${ctx.raw>=0?'+':''}${num(ctx.raw)}주`}}},
      scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10,font:{family:FONT,size:10},color:COLOR.text3}},
        y:{grid:{color:COLOR.grid},border:{display:false},ticks:{font:{family:FONT,size:10},color:COLOR.text3,callback:v=>{const a=Math.abs(v); return (v<0?'-':'')+(a>=10000?(a/10000).toFixed(0)+'만':num(a));}}}}}
  });
}

// ── 주가 수익률 (종목 vs 코스피) ────────────────────────
const RET_PERIODS=[['1M','1개월',20],['3M','3개월',61],['6M','6개월',122]];
let retPeriod='3M';
function setRetPeriod(p){ retPeriod=p; const s=getStock(selectedCode); if(s&&curSpark) renderReturn(s,curSpark); }
window.setRetPeriod=setRetPeriod;
function renderReturn(s, sp){
  const box=el('return-simple'); if(!box) return;
  if(!sp||!sp.close||sp.close.length<2){
    box.innerHTML='<div class="az-ph" style="height:110px"><div class="t">수익률 데이터 없음</div></div>';
    return;
  }
  const days=(RET_PERIODS.find(p=>p[0]===retPeriod)||[])[2]||61;
  const idx=DATA.overview&&DATA.overview.kospi&&DATA.overview.kospi.spark||[];
  const nStock=Math.min(days, sp.close.length);
  const nIdx=Math.min(days, idx.length);
  const stockSeg=sp.close.slice(-nStock);
  const idxSeg=idx.slice(-nIdx);
  const toPct=arr=>{ const b=arr[0]; return arr.map(v=>+( (v-b)/b*100 ).toFixed(2)); };
  const sP=toPct(stockSeg), iP=idxSeg.length?toPct(idxSeg):[];
  const sRet=sP[sP.length-1], iRet=iP.length?iP[iP.length-1]:null;
  const vals = [sRet, ...(iRet!=null?[iRet]:[])];
  const maxAbs = Math.max(...vals.map(v=>Math.abs(v)), 1);
  const bar = (name, val, color)=> {
    const w = Math.min(50, Math.max(2, Math.abs(val)/maxAbs*50));
    const dir = val>=0 ? 'pos' : 'neg';
    return `<div class="az-ret-bar">
      <div class="nm">${h(name)}</div>
      <div class="az-ret-track"><span class="az-ret-zero"></span><span class="az-ret-fill ${dir}" style="width:${w}%;background:${color}"></span></div>
      <div class="vv ${cls(val)}">${val>=0?'+':''}${val}%</div>
    </div>`;
  };
  box.innerHTML = `
    <div class="az-ret-simple-head">
      <div class="az-ret-title">주가 수익률</div>
      <div class="az-mini-tabs">${RET_PERIODS.map(([k,l])=>`<button class="${retPeriod===k?'on':''}" onclick="setRetPeriod('${k}')">${l}</button>`).join('')}</div>
    </div>
    <div class="az-ret-bars">
      ${bar(s.name, sRet, COLOR.gain)}
      ${iRet!=null?bar('코스피', iRet, COLOR.text3):''}
    </div>`;
}

// ── 거래 동향 ───────────────────────────────────────────
function renderTradeTrend(s, sp){
  const box=el('kv-trade'); if(!box) return;
  const shares=sharesOf(s);
  const turnover=shares?+(s.volume/shares*100).toFixed(2):null;
  let volChg=null, amtChg=null;
  if(sp&&sp.vol&&sp.vol.length>=2){ const pv=sp.vol[sp.vol.length-2]; if(pv>0) volChg=(s.volume-pv)/pv*100; }
  const sub=(v)=>v==null?'':`<div class="sub ${cls(v)}">전일 대비 ${v>=0?'+':''}${v.toFixed(1)}%</div>`;
  box.innerHTML=`
    <div class="it"><div class="l">거래량</div><div class="v">${num(s.volume)}<small>주</small></div>${sub(volChg)}</div>
    <div class="it"><div class="l">거래대금</div><div class="v">${fmtCap(Math.round((s.amount||0)/1e8))}</div></div>
    <div class="it"><div class="l">회전율</div><div class="v">${turnover!=null?turnover+'%':'—'}</div><div class="sub" style="color:var(--text3)">거래량/상장주식수</div></div>
    <div class="it"><div class="l">상장주식수</div><div class="v" style="font-size:14px">${shares!=null?num(shares):'—'}<small>주</small></div><div class="sub" style="color:var(--text3)">시총/현재가 추정</div></div>`;
}

// ── 배당 정보 ───────────────────────────────────────────
function renderDividend(s){
  const box=el('kv-div'); if(!box) return;
  const d=s.dividend;
  if(!d || (d.dps==null && d.payoutRatio==null)){
    box.innerHTML=`<div class="az-ph" style="height:150px"><div class="ico">💸</div><div class="t">배당 정보 없음</div><div class="d">최근 사업연도 현금배당 공시가 없습니다<br>(무배당 또는 미공시).</div></div>`;
    return;
  }
  const dy=divYieldOf(s);
  box.innerHTML=`<div class="az-kv">
    <div class="it"><div class="l">주당 배당금 (${d.divYear||''})</div><div class="v">${d.dps!=null?num(d.dps):'—'}<small>원</small></div></div>
    <div class="it"><div class="l">배당수익률</div><div class="v">${dy!=null?dy.toFixed(2)+'%':'—'}</div></div>
    <div class="it"><div class="l">배당성향</div><div class="v">${d.payoutRatio!=null?d.payoutRatio.toFixed(1)+'%':'—'}</div></div>
    <div class="it"><div class="l">배당 기준연도</div><div class="v" style="font-size:14px">${d.divYear||'—'}<small>년 결산</small></div></div>
  </div>`;
}

// ── 핵심 지표 게이지 ────────────────────────────────────
function renderCoreGauge(s){
  const score = s._finLoaded && !s._finEmpty ? coreScore(s) : null;
  const scEl=el('gauge-sc'); if(scEl) scEl.textContent = score!=null?score:'–';
  const col = score==null?'#CBD5E1' : score>=70?'#1A7A58' : score>=45?'#C8973A' : '#C0392B';
  mountChart('gauge-core',{
    type:'doughnut',
    data:{datasets:[{data:[score||0, 100-(score||0)], backgroundColor:[col,'#E8EDF3'], borderWidth:0, circumference:270, rotation:225}]},
    options:{responsive:true, maintainAspectRatio:true, cutout:'74%', animation:{duration:600}, plugins:{legend:{display:false},tooltip:{enabled:false}}}
  });
  const nv=s.naver||null;
  const dy=divYieldOf(s) ?? (nv?nv.divYield:null), pbr=pbrOfBest(s);
  const fr=nv&&nv.foreignRate!=null?nv.foreignRate:null;
  const side=el('gauge-side');
  if(side) side.innerHTML=`
    <div class="r"><span class="k">외국인 보유율</span><span class="v">${fr!=null?fr.toFixed(2)+'%':'—'}</span></div>
    <div class="r"><span class="k">배당수익률</span><span class="v">${dy!=null?dy.toFixed(2)+'%':'—'}</span></div>
    <div class="r"><span class="k">PER (12M)</span><span class="v">${s.per>0?s.per.toFixed(1)+'배':'N/A'}</span></div>
    <div class="r"><span class="k">PBR (최근)</span><span class="v">${pbr!=null?pbr.toFixed(2)+'배':'N/A'}</span></div>`;
}

function renderAnalysisExtras(s, sp){
  renderValuationPanel(s);
  renderHolderPanel(s);
  renderForeignRateTrend(s);
  renderMonthlyHeatmap(sp);
}

function renderValuationPanel(s){
  const box=el('az-valuation'); if(!box) return;
  const nv=s.naver||null;
  const rows=[
    ['PER', s.per>0?s.per:(nv&&nv.per>0?nv.per:null), sectorAvg(s.sector,x=>x.per>0?x.per:null), '배'],
    ['PBR', pbrOfBest(s), sectorAvg(s.sector,x=>pbrOfBest(x)), '배'],
    ['ROE', s.roe, sectorAvg(s.sector,x=>x.roe), '%'],
    ['배당수익률', divYieldOf(s) ?? (nv?nv.divYield:null), sectorAvg(s.sector,x=>divYieldOf(x)), '%'],
  ];
  const vals = rows.flatMap(r=>[r[1],r[2]]).filter(v=>v!=null && isFinite(v));
  const max = Math.max(...vals, 1);
  box.innerHTML = `<div class="az-mini-table">${rows.map(([name,val,avg,unit])=>{
    const w = val!=null ? Math.max(4, Math.min(100, val/max*100)) : 0;
    const av = avg!=null ? Math.max(4, Math.min(100, avg/max*100)) : 0;
    return `<div>
      <div class="az-mini-row"><div class="nm">${name}</div><div class="track"><div class="fill" style="width:${w}%"></div></div><div class="vv">${val!=null?Number(val).toFixed(unit==='%'?1:2)+unit:'N/A'}</div></div>
      <div class="az-mini-row" style="opacity:.68"><div class="nm">업종 평균</div><div class="track"><div class="fill" style="width:${av}%;background:linear-gradient(90deg,#CBD5E1,#7A92A8)"></div></div><div class="vv">${avg!=null?Number(avg).toFixed(unit==='%'?1:2)+unit:'N/A'}</div></div>
    </div>`;
  }).join('')}</div>`;
}

function renderHolderPanel(s){
  const box=el('az-holder'); if(!box) return;
  const fr=s.naver&&s.naver.foreignRate!=null ? clampN(s.naver.foreignRate,0,100) : null;
  if(fr==null){
    box.innerHTML=`<div class="heat-empty">외국인 보유율 데이터가 아직 준비되지 않았습니다.</div>`;
    return;
  }
  const rest=+(100-fr).toFixed(2);
  box.innerHTML=`<div class="holder-wrap"><div class="chart-wrap" style="height:180px"><canvas id="chart-holder"></canvas></div>
    <div class="holder-legend">
      <div class="holder-line"><span class="k"><span class="dot" style="background:${COLOR.loss}"></span>외국인</span><span class="v">${fr.toFixed(2)}%</span></div>
      <div class="holder-line"><span class="k"><span class="dot" style="background:${COLOR.teal}"></span>국내/기타</span><span class="v">${rest.toFixed(2)}%</span></div>
      <div class="holder-line" style="color:var(--text3);font-size:11px">기관·개인 세부 보유 비중은 현재 원천 미연동</div>
    </div></div>`;
  mountChart('chart-holder',{
    type:'doughnut',
    data:{labels:['외국인','국내/기타'],datasets:[{data:[fr,rest],backgroundColor:[COLOR.loss,COLOR.teal],borderWidth:3,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false},centerText:{lines:['외국인 보유율',fr.toFixed(2)+'%']},tooltip:{...baseTooltip(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw.toFixed(2)}%`}}}},
    plugins:[centerTextPlugin]
  });
}

function renderForeignRateTrend(s){
  const wrap=el('foreign-rate-wrap'); if(!wrap || typeof Chart==='undefined') return;
  const sup=s.naver&&s.naver.supply||[];
  const rows=sup.filter(d=>d.foreignRate!=null);
  if(rows.length<2){
    const canvas=el('chart-foreign-rate');
    const ex=canvas?Chart.getChart(canvas):null; if(ex) ex.destroy();
    wrap.innerHTML='<canvas id="chart-foreign-rate" style="display:none"></canvas><div class="heat-empty">외국인 보유율 추이 데이터가 부족합니다.</div>';
    return;
  }
  wrap.innerHTML='<canvas id="chart-foreign-rate"></canvas>';
  mountChart('chart-foreign-rate',{
    type:'line',
    data:{labels:rows.map(d=>fmtD(d.date)),datasets:[{label:'외국인 보유율',data:rows.map(d=>d.foreignRate),borderColor:COLOR.loss,backgroundColor:'rgba(37,99,235,.08)',fill:true,tension:.3,pointRadius:2.5,pointHoverRadius:5,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...baseTooltip(),callbacks:{label:ctx=>` 외국인 보유율: ${ctx.raw.toFixed(2)}%`}}},scales:{x:{grid:{display:false},ticks:{font:{family:FONT,size:10},color:COLOR.text3}},y:{grid:{color:COLOR.grid},border:{display:false},ticks:{font:{family:FONT,size:10},color:COLOR.text3,callback:v=>v+'%'}}}}
  });
}

function renderMonthlyHeatmap(sp){
  const box=el('return-heatmap'); if(!box) return;
  if(!sp||!sp.dates||!sp.close||sp.close.length<20){ box.innerHTML='<div class="heat-empty">월별 수익률을 계산할 가격 이력이 부족합니다.</div>'; return; }
  const months=[];
  let cur=null;
  sp.dates.forEach((d,i)=>{
    const key=d.slice(0,6);
    if(!cur || cur.key!==key){ if(cur) months.push(cur); cur={key,first:sp.close[i],last:sp.close[i]}; }
    else cur.last=sp.close[i];
  });
  if(cur) months.push(cur);
  const rows=months.slice(-12).map(m=>({label:`${m.key.slice(2,4)}.${+m.key.slice(4,6)}`,ret:m.first>0?+((m.last-m.first)/m.first*100).toFixed(2):0}));
  const maxAbs=Math.max(...rows.map(r=>Math.abs(r.ret)),1);
  box.innerHTML=`<div class="heatmap">${rows.map(r=>{
    const a=Math.abs(r.ret)/maxAbs;
    const col=r.ret>=0?`rgba(226,59,59,${0.38+a*.62})`:`rgba(37,99,235,${0.38+a*.62})`;
    return `<div class="heat-cell" style="background:${col}"><div class="m">${r.label}</div><div class="r">${r.ret>=0?'+':''}${Number(r.ret).toFixed(Math.abs(r.ret)>=10?1:2)}%</div></div>`;
  }).join('')}</div>`;
}

function finEmptyHtml(){ return `<div class="fin-empty"><div class="ico">📄</div>이 종목은 DART 재무제표를 제공하지 않습니다.<br>(우선주·리츠·스팩 등은 별도 재무가 없을 수 있습니다.)</div>`; }

let clockTimer=null;
function startClock(){
  const tick=()=>{ const el2=el('az-clock'); if(!el2){ if(clockTimer){clearInterval(clockTimer);clockTimer=null;} return; }
    const t=new Date(Date.now()+9*3600*1000); el2.textContent=t.toISOString().slice(11,19)+' (KST)'; };
  tick(); if(clockTimer) clearInterval(clockTimer); clockTimer=setInterval(tick,1000);
}

// 연도별 손익 도넛 — 일반기업: 매출 구성 / 금융업(매출無): 영업이익→순이익 구성
function renderIncomeDonuts(s){
  const box = el('income-donuts'); if(!box) return;
  const yrs = s.years || [];
  const hasRev = (s.revenue||[]).some(v=>v!=null && v>0);
  // 금융업 등 매출 데이터 없을 때 안내
  const fin = el('income-donuts').closest('.chart-card');
  if(fin){
    const subEl = fin.querySelector('.ch-sub');
    const legEl = fin.querySelector('.donut-legend-inline');
    if(!hasRev){
      if(subEl) subEl.textContent = '금융업 등은 매출(영업수익) 구분이 없어 영업이익→순이익 구성으로 표시합니다 (단위: 억원)';
      if(legEl) legEl.innerHTML = `<span class="dli"><span class="d" style="background:${COLOR.gold}"></span>순이익</span><span class="dli"><span class="d" style="background:${COLOR.teal}"></span>영업이익(순이익 외)</span>`;
    }
  }
  box.innerHTML = yrs.map((y,i)=>`
    <div class="dy-card">
      <div class="dy-year">${y}년</div>
      <div class="dy-donut"><canvas id="dnut-${y}"></canvas></div>
      <div class="dy-stat">
        ${hasRev?`<div class="r"><span class="k">매출</span><span class="v">${fmtEok(s.revenue[i])}</span></div>`:''}
        <div class="r"><span class="k">영업이익</span><span class="v ${s.operatingProfit[i]<0?'dn':''}">${fmtEok(s.operatingProfit[i])}</span></div>
        <div class="r"><span class="k">순이익</span><span class="v ${s.netProfit[i]<0?'dn':''}">${fmtEok(s.netProfit[i])}</span></div>
      </div>
    </div>`).join('');
  yrs.forEach((y,i)=>{
    const rev=s.revenue[i], op=s.operatingProfit[i], ni=s.netProfit[i];
    const net = Math.max(ni||0, 0);
    let data, labels, colors, center;
    if(rev!=null && rev>0){
      const opExtra = Math.max((op||0) - net, 0);
      const cost = Math.max(rev - Math.max(op||0, net), 0);
      data=[net, opExtra, cost]; labels=['순이익','영업이익(순이익 외)','매출원가·비용'];
      colors=[COLOR.gold, COLOR.teal, '#D7E0EA'];
      center=['영업이익률', op!=null?(op/rev*100).toFixed(1)+'%':'-'];
    } else if(op!=null && op>0){
      const opExtra = Math.max(op - net, 0);
      data=[net, opExtra]; labels=['순이익','영업이익(순이익 외)'];
      colors=[COLOR.gold, COLOR.teal];
      center=['순이익/영업이익', op?Math.round(net/op*100)+'%':'-'];
    } else { return; }
    const denom = (rev!=null&&rev>0)?rev:(op||1);
    mountChart(`dnut-${y}`, {
      type:'doughnut',
      data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:2, borderColor:'#fff', hoverOffset:4 }] },
      options:{ responsive:true, maintainAspectRatio:true, cutout:'64%', animation:{duration:500},
        plugins:{ legend:{display:false},
          centerText:{ lines:center },
          tooltip:{ ...baseTooltip(), callbacks:{ label:ctx=>` ${ctx.label}: ${fmtEok(Math.round(ctx.raw))} (${(ctx.raw/denom*100).toFixed(1)}%)` } } } },
      plugins:[centerTextPlugin]
    });
  });
}

function renderAnalysisMetrics(s){
  const metrics = [
    ['PER', s.per>0 ? s.per.toFixed(1)+'배' : 'N/A'],
    ['ROE', ratio(s.roe)],
    ['영업이익률', ratio(s.opMarginNow)],
    ['부채비율', s.debtNow!=null ? s.debtNow.toFixed(0)+'%' : 'N/A'],
    ['시가총액', fmtCap(s.marketCap)],
    ['거래량', fmtVol(s.volume)+'주'],
  ];
  const box = el('analysis-metrics'); if(box) box.innerHTML = metrics.map(m=>`<div class="metric-box"><div class="l">${m[0]}</div><div class="v">${m[1]}</div></div>`).join('');
}

// 52주 가격 밴드 (최저~최고 사이 현재가 위치)
function renderBand(s, sp){
  const box = el('ah-band'); if(!box) return;
  if(!sp || !sp.series || sp.series.length<10){ box.style.display='none'; return; }
  const highs = sp.high || sp.series, lows = sp.low || sp.series;
  const hi = Math.max(...highs), lo = Math.min(...lows);
  if(!(hi>lo)){ box.style.display='none'; return; }
  const p = clampN((s.price-lo)/(hi-lo)*100, 0, 100);
  const nDays = sp.series.length;
  const label = nDays>=230 ? '52주' : `최근 ${nDays}일`;
  box.style.display='block';
  box.innerHTML = `
    <div class="band-row">
      <span class="band-lab">${label} 최저<b>${num(lo)}</b></span>
      <div class="band-track"><div class="band-marker" style="left:${p.toFixed(1)}%"></div></div>
      <span class="band-lab" style="text-align:right">${label} 최고<b>${num(hi)}</b></span>
      <span class="band-pos">밴드 ${p.toFixed(0)}% 위치</span>
    </div>`;
}

// 성장 지표 스트립 (YoY)
function yoy(arr){
  if(!arr || arr.length<2) return null;
  const a=arr[arr.length-1], b=arr[arr.length-2];
  if(a==null || b==null || b===0) return null;
  return (a-b)/Math.abs(b)*100;
}
function gsBox(label, g, suffix){
  const v = g==null ? '<span style="color:var(--text3)">N/A</span>'
    : `<span class="${cls(g)}">${arrow(g)} ${Math.abs(g).toFixed(1)}%</span>`;
  return `<div class="gs-box"><div class="l">${label}</div><div class="v">${v}${suffix?`<small>${suffix}</small>`:''}</div></div>`;
}
function renderGrowthStrip(s){
  const box = el('growth-strip'); if(!box) return;
  if(s._finEmpty || !s.years || s.years.length<2){ box.style.display='none'; return; }
  const yr = s.years[s.years.length-1];
  box.style.display='grid';
  box.innerHTML =
    gsBox(`매출 성장률 (${yr} YoY)`, yoy(s.revenue)) +
    gsBox(`영업이익 성장률`, yoy(s.operatingProfit)) +
    gsBox(`순이익 성장률`, yoy(s.netProfit)) +
    `<div class="gs-box"><div class="l">EPS (주당순이익)</div><div class="v">${s.eps!=null?num(Math.round(s.eps)):'<span style="color:var(--text3)">N/A</span>'}<small>원</small></div></div>`;
}

// ── 캔들 가격차트 (기간·인터벌·크게보기) ────────────────────
const PERIODS = [['1M','1개월'],['3M','3개월'],['6M','6개월'],['ALL','전체']];
const INTERVALS = [['D','일'],['W','주'],['M','월']];

function chartCtrlsHtml(withExpand){
  return `
    <div class="seg sm">${PERIODS.map(([k,l])=>`<button class="${chartState.period===k?'on':''}" onclick="setPricePeriod('${k}')">${l}</button>`).join('')}</div>
    <div class="seg sm">${INTERVALS.map(([k,l])=>`<button class="${chartState.interval===k?'on':''}" onclick="setPriceInterval('${k}')">${l}</button>`).join('')}</div>
    ${withExpand?`<button class="chart-expand" onclick="openChartModal()">⛶ 크게 보기</button>`:''}`;
}
function setPricePeriod(p){ chartState.period=p; renderPriceArea(); }
function setPriceInterval(v){ chartState.interval=v; renderPriceArea(); }
window.setPricePeriod = setPricePeriod;
window.setPriceInterval = setPriceInterval;

function renderPriceArea(){
  const ctrls = el('price-controls');
  if(ctrls) ctrls.innerHTML = chartCtrlsHtml(true);
  renderCandle('chart-price');
  const mbg = el('chart-modal-bg');
  if(mbg && mbg.classList.contains('show')){
    el('chart-modal-ctrls').innerHTML = chartCtrlsHtml(false);
    renderCandle('chart-price-big');
  }
}

// 일봉 → 주봉/월봉 집계
function aggregateOHLC(sp, interval){
  const out=[]; let cur=null, key=null;
  for(let i=0;i<sp.dates.length;i++){
    const d = sp.dates[i];
    let k;
    if(interval==='D') k = d;
    else if(interval==='W'){
      const dt = new Date(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8));
      const mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay()+6)%7));
      k = mon.toISOString().slice(0,10);
    } else k = d.slice(0,6);
    if(k!==key){
      if(cur) out.push(cur);
      key = k;
      cur = { d, o:sp.open[i], h:sp.high[i], l:sp.low[i], c:sp.close[i], v:sp.vol?sp.vol[i]:0 };
    } else {
      cur.h = Math.max(cur.h, sp.high[i]);
      cur.l = Math.min(cur.l, sp.low[i]);
      cur.c = sp.close[i];
      cur.v += sp.vol?sp.vol[i]:0;
      cur.d = d;   // 마지막 거래일 기준
    }
  }
  if(cur) out.push(cur);
  return out;
}
function cutoffDate(lastD, period){
  const days = {'1M':31,'3M':93,'6M':186,'ALL':99999}[period] || 93;
  const dt = new Date(+lastD.slice(0,4), +lastD.slice(4,6)-1, +lastD.slice(6,8));
  dt.setDate(dt.getDate()-days);
  return `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}`;
}

function renderCandle(canvasId){
  const sp = curSpark;
  const canvas = el(canvasId);
  if(!canvas) return;
  if(!sp || !sp.series || sp.series.length<2){
    const ex = typeof Chart!=='undefined' && Chart.getChart(canvas); if(ex) ex.destroy();
    return;
  }
  // OHLC가 없으면(구버전 KV) 종가 라인 폴백 — 그라데이션 채움
  if(!sp.open){
    mountChart(canvasId, {
      type:'line',
      data:{ labels:sp.dates.map(d=>fmtD(d)), datasets:[{ data:sp.series, borderColor:COLOR.navy,
        backgroundColor:(ctx)=>{ const {ctx:c, chartArea:a}=ctx.chart; if(!a) return 'rgba(30,58,95,.06)';
          const g=c.createLinearGradient(0,a.top,0,a.bottom); g.addColorStop(0,'rgba(30,58,95,.18)'); g.addColorStop(1,'rgba(30,58,95,0)'); return g; },
        borderWidth:2, pointRadius:0, fill:true, tension:.3 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:baseTooltip(v=>num(v)+'원')},
        scales:baseScales({ x:{grid:{display:false},ticks:{maxTicksLimit:8,font:{family:FONT,size:10.5},color:COLOR.text3}} }) }
    });
    return;
  }
  const bars = aggregateOHLC(sp, chartState.interval);
  const cut = cutoffDate(sp.dates[sp.dates.length-1], chartState.period);
  const startIdx = bars.findIndex(b=>b.d>=cut);
  const vis = startIdx<0 ? bars : bars.slice(startIdx);
  if(!vis.length) return;

  const labels = vis.map(b=>fmtD(b.d, chartState.interval==='M'));
  const isBig = canvasId==='chart-price-big';
  const lastBar = vis[vis.length-1];
  const lastUp = lastBar.c >= lastBar.o;
  const maxV = Math.max(...vis.map(b=>b.v||0), 1);

  // y축 범위: 캔들 고저 + 하단 거래량 밴드 공간 확보 (캔들이 윗쪽에 뜨도록)
  const lo = Math.min(...vis.map(b=>b.l)), hi = Math.max(...vis.map(b=>b.h));
  const range = (hi-lo)||hi||1;
  const yMin = lo - range*0.26, yMax = hi + range*0.07;

  mountChart(canvasId, {
    data:{ labels, datasets:[
      // 캔들은 candlePlugin이 직접 그림. 이 보이지 않는 라인은 x카테고리·툴팁·호버 인덱스 제공.
      { type:'line', label:'캔들', data:vis.map(b=>b.c), borderColor:'rgba(0,0,0,0)', backgroundColor:'rgba(0,0,0,0)',
        pointRadius:0, pointHoverRadius:0, fill:false, yAxisID:'y', order:2 },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:{duration:300,easing:'easeOutQuart'},
      interaction:{mode:'index',intersect:false},
      layout:{padding:{top:6}},
      plugins:{
        candles:{ bars:vis, maxV, big:isBig },
        legend:{ display:false },
        tooltip:{ ...baseTooltip(), displayColors:false, animation:{duration:80}, position:'nearest', caretSize:5,
          backgroundColor:'rgba(15,37,64,.78)', borderColor:'rgba(255,255,255,.28)', borderWidth:1, padding:10,
          titleColor:'#fff', bodyColor:'#fff', bodyFont:{family:FONT,size:12,weight:'700'}, titleFont:{family:FONT,weight:'800',size:12},
          filter: item=>item.dataset.label==='캔들',
          callbacks:{
            title: items=>{ if(!items.length) return ''; const b=vis[items[0].dataIndex]; return dashD(b.d) + ({D:'',W:' · 주봉',M:' · 월봉'}[chartState.interval]||''); },
            label: ctx=>{
              const i=ctx.dataIndex, b=vis[i];
              const prev = i>0 ? vis[i-1].c : b.o;
              const chg = prev>0 ? (b.c-prev)/prev*100 : 0;
              return [`시가  ${num(b.o)}`, `고가  ${num(b.h)}`, `저가  ${num(b.l)}`, `종가  ${num(b.c)}  (${pct(chg)})`, `거래량  ${fmtVol(b.v)}`];
            }
          }
        },
        lastPrice:{ price:lastBar.c, up:lastUp },
      },
      scales:{
        x:{ grid:{display:false}, border:{color:'rgba(0,0,0,.08)'}, offset:true, ticks:{maxTicksLimit:isBig?14:9,autoSkip:true,maxRotation:0,font:{family:FONT,size:10.5},color:COLOR.text3} },
        y:{ position:'right', min:yMin, max:yMax, grid:{color:'rgba(15,37,64,.05)'}, border:{display:false},
            ticks:{maxTicksLimit:7,font:{family:FONT,size:10.5},color:COLOR.text3,callback:v=>num(v)} },
      }
    },
    plugins:[candlePlugin, crosshairPlugin, lastPricePlugin]
  });
}

function openChartModal(){
  const s = getStock(selectedCode); if(!s || !curSpark) return;
  el('chart-modal-title').innerHTML = `${h(s.name)} 가격 차트 <small>${h(s.code)} · ${h(s.market)}</small>`;
  el('chart-modal-ctrls').innerHTML = chartCtrlsHtml(false);
  el('chart-modal-bg').classList.add('show');
  document.body.style.overflow='hidden';
  setTimeout(()=>renderCandle('chart-price-big'), 30);
}
function closeChartModal(){
  el('chart-modal-bg').classList.remove('show');
  document.body.style.overflow='';
  const c = el('chart-price-big');
  if(c && typeof Chart!=='undefined'){ const ex=Chart.getChart(c); if(ex) ex.destroy(); }
}
window.openChartModal = openChartModal;
window.closeChartModal = closeChartModal;

function renderDebtChart(s){
  const labels = s.years.map(y=>y+'');
  mountChart('chart-debt', {
    type:'line',
    data:{ labels, datasets:[{ label:'부채비율', data:s.debtRatio, borderColor:COLOR.navy, backgroundColor:'rgba(30,58,95,.08)', fill:true, tension:.35, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:COLOR.navy, pointBorderColor:'#fff', pointBorderWidth:2, borderWidth:2.5, spanGaps:true }]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, animation:{duration:500,easing:'easeOutQuart'},
      plugins:{ legend:{display:false}, tooltip:baseTooltip(v=>v+'%') },
      scales:baseScales({ y:{ grid:{color:COLOR.grid,drawBorder:false}, border:{display:false}, ticks:{font:{family:FONT,size:11},color:COLOR.text3,padding:6,callback:v=>v+'%'}, grace:'12%' } }) }
  });
}
function renderProfitabilityChart(s){
  const labels = s.years.map(y=>y+'');
  const opMargin = (s.opMargin&&s.opMargin.length) ? s.opMargin
    : s.operatingProfit.map((op,i)=> s.revenue[i]>0 ? +((op/s.revenue[i])*100).toFixed(1) : null);
  const roeLine = labels.map(()=> s.roe);
  mountChart('chart-profitability', {
    type:'line',
    data:{ labels, datasets:[
      { label:'영업이익률', data:opMargin, borderColor:COLOR.teal, backgroundColor:'rgba(45,125,111,.10)', fill:true, tension:.35, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:COLOR.teal, pointBorderColor:'#fff', pointBorderWidth:2, borderWidth:2.5, spanGaps:true },
      { label:'ROE (최근)', data:roeLine, borderColor:COLOR.gold, borderWidth:1.5, borderDash:[5,4], pointRadius:0, fill:false, tension:0 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, animation:{duration:500,easing:'easeOutQuart'},
      plugins:{ legend:baseLegend(), tooltip:baseTooltip(v=>v==null?'N/A':v+'%') },
      scales:baseScales({ y:{ grid:{color:COLOR.grid,drawBorder:false}, border:{display:false}, ticks:{font:{family:FONT,size:11},color:COLOR.text3,padding:6,callback:v=>v+'%'}, grace:'12%' } }) }
  });
}

// ─────────────────────────────────────────────────────────────
// 종목 랭킹 (거래대금·거래량·시가총액 통합 · 툴바 필터 + 헤더 클릭 정렬)
// ─────────────────────────────────────────────────────────────
const MARKETS = ['ALL','KOSPI','KOSDAQ'];

// 종목 랭킹 통합 탭 — basis: 'amount' | 'volume' | 'marketcap'
const RANK_STATE = { basis:'amount', market:'ALL', sector:'ALL', sortKey:'amount', sortDir:-1 };
const RANK_BASIS = [['amount','거래대금'],['volume','거래량'],['marketcap','시가총액']];

function setRankBasis(b){
  RANK_STATE.basis = b;
  RANK_STATE.sortKey = b==='amount' ? 'amount' : b==='volume' ? 'volume' : 'marketCap';
  RANK_STATE.sortDir = -1;
  RANK_STATE.sector = 'ALL';
  renderRanking();
}
window.setRankBasis = setRankBasis;
function setRankFilter(kind, val){
  if(kind==='market'){ RANK_STATE.market = val; RANK_STATE.sector = 'ALL'; }
  else RANK_STATE.sector = decodeURIComponent(val);
  renderRanking();
}
window.setRankFilter = setRankFilter;
function setRankSort(key){
  if(RANK_STATE.sortKey===key) RANK_STATE.sortDir *= -1;
  else { RANK_STATE.sortKey = key; RANK_STATE.sortDir = -1; }
  renderRanking();
}
window.setRankSort = setRankSort;

function thSort(key, label, st){
  const on = st.sortKey===key;
  return `<th class="num sortable" onclick="setRankSort('${key}')">${label}<span class="arr">${on?(st.sortDir<0?'▼':'▲'):''}</span></th>`;
}

function renderRanking(){
  const st = RANK_STATE;
  const base = st.basis==='amount' ? topAmountList() : st.basis==='volume' ? DATA.volume : DATA.marketcap;
  const basisLabel = st.basis==='amount' ? '거래대금' : st.basis==='volume' ? '거래량' : '시가총액';
  // 기준 토글
  el('ranking-basis').innerHTML = RANK_BASIS.map(([k,l])=>`<button class="${st.basis===k?'on':''}" onclick="setRankBasis('${k}')">${l} 상위</button>`).join('');
  el('ranking-title').innerHTML = `${basisLabel} 상위 <span class="sub">컬럼 제목을 누르면 정렬 기준이 바뀝니다</span>`;

  // 툴바 (시장 세그 + 섹터칩 + 결과수)
  const inMarket = base.filter(s=>st.market==='ALL'||s.market===st.market);
  const counts = {}; inMarket.forEach(s=>{ const k=s.sector||'기타'; counts[k]=(counts[k]||0)+1; });
  const sectors = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const rows = inMarket.filter(s=>st.sector==='ALL'||(s.sector||'기타')===st.sector);
  rows.sort((a,b)=> ((Number(b[st.sortKey])||0) - (Number(a[st.sortKey])||0)) * (st.sortDir===-1?1:-1));
  el('ranking-toolbar').innerHTML = `<div class="list-toolbar">
    <div class="seg">${MARKETS.map(m=>`<button class="${m===st.market?'on':''}" onclick="setRankFilter('market','${m}')">${m==='ALL'?'전체':m}</button>`).join('')}</div>
    <div class="sector-scroll">
      <button class="chip ${st.sector==='ALL'?'on':''}" onclick="setRankFilter('sector','ALL')">전체 섹터<small>${inMarket.length}</small></button>
      ${sectors.map(s=>`<button class="chip ${s===st.sector?'on':''}" onclick="setRankFilter('sector','${encodeURIComponent(s)}')">${h(s)}<small>${counts[s]}</small></button>`).join('')}
    </div>
    <span class="result-count">${rows.length}종목</span>
  </div>`;

  el('ranking-table').innerHTML = `
    <thead><tr><th>#</th><th>종목</th><th>시장</th><th>섹터</th>
      ${thSort('price','현재가',st)}${thSort('change','등락률',st)}${thSort('volume','거래량',st)}${thSort('amount','거래대금',st)}${thSort('marketCap','시가총액',st)}</tr></thead>
    <tbody>${rows.map((s,i)=>`
      <tr onclick="openAnalysis('${s.code}')">
        <td class="muted">${i+1}</td>
        <td><div class="td-name">${h(s.name)}</div><div class="td-code">${h(s.code)}</div></td>
        <td>${h(s.market)}</td><td class="muted">${h(s.sector)}</td>
        <td class="num">${num(s.price)}</td>
        <td class="num ${cls(s.change)}">${pct(s.change)}</td>
        <td class="num">${num(s.volume)}</td>
        <td class="num">${fmtCap(Math.round((s.amount||0)/1e8))}</td>
        <td class="num">${fmtCap(s.marketCap)}</td>
      </tr>`).join('')}</tbody>`;
}

// ─────────────────────────────────────────────────────────────
// 비교
// ─────────────────────────────────────────────────────────────
let compareSector = 'ALL';
let comparePage = 0;
let compareQuery = '';
const COMPARE_PAGE_SIZE = 5;
function renderCompare(){
  // 선택된 종목 태그
  el('compare-selected').innerHTML = compareSel.map(c=>{
    const s = getStock(c); if(!s) return '';
    return `<span class="cmp-tag">${h(s.name)}<button class="x" onclick="toggleCompare('${c}')" title="제거">✕</button></span>`;
  }).join('');
  // 섹터 칩 (랭킹 탭과 동일 방식)
  const counts = {}; STOCKS.forEach(s=>{ const k=s.sector||'기타'; counts[k]=(counts[k]||0)+1; });
  const sectors = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  el('compare-sectors').innerHTML =
    `<button class="chip ${compareSector==='ALL'?'on':''}" onclick="setCompareSector('ALL')">전체<small>${STOCKS.length}</small></button>` +
    sectors.map(s=>`<button class="chip ${s===compareSector?'on':''}" onclick="setCompareSector('${encodeURIComponent(s)}')">${h(s)}<small>${counts[s]}</small></button>`).join('');
  // 섹터별 종목 목록(페이지형 선택)
  const q = compareQuery.trim().toLowerCase();
  const list = STOCKS.filter(s=>(compareSector==='ALL'||(s.sector||'기타')===compareSector) &&
                    (!q || [s.name,s.code,s.market,s.sector].some(v=>(v||'').toLowerCase().includes(q))))
                     .sort((a,b)=>b.marketCap-a.marketCap);
  const pages = Math.max(1, Math.ceil(list.length/COMPARE_PAGE_SIZE));
  comparePage = clampN(comparePage, 0, pages-1);
  const pageItems = list.slice(comparePage*COMPARE_PAGE_SIZE, (comparePage+1)*COMPARE_PAGE_SIZE);
  const full = compareSel.length>=3;
  el('compare-list').innerHTML = `
    <div class="cmp-list-controls">
      <input class="cmp-combo-input" value="${h(compareQuery)}" ${full?'disabled':''}
        onfocus="this.select()" oninput="setCompareQuery(this.value)" onkeydown="compareInputKey(event)"
        placeholder="${full?'최대 3종목까지 선택됨':'종목 선택'}">
      <div class="cmp-pager">
        <button class="cmp-page-btn" ${comparePage<=0?'disabled':''} onclick="setComparePage(${comparePage-1})" title="이전 페이지">‹</button>
        <span class="cmp-page-state">${comparePage+1} / ${pages}</span>
        <button class="cmp-page-btn" ${comparePage>=pages-1?'disabled':''} onclick="setComparePage(${comparePage+1})" title="다음 페이지">›</button>
      </div>
      <div class="cmp-page-list">
        ${pageItems.length?pageItems.map(s=>{
    const on = compareSel.includes(s.code);
    const dis = full && !on;
    return `<div class="cmp-page-row ${on?'on':''} ${dis?'dis':''}" ${dis?'':`onclick="toggleCompare('${s.code}')"`}>
      <div><div class="cmp-row-name">${h(s.name)}</div><div class="cmp-row-meta">${h(s.code)} · ${h(s.market||'')} · ${h(s.sector||'')}</div></div>
      <span class="cmp-row-state">${on?'선택됨':'선택'}</span>
    </div>`;
  }).join(''):`<div class="cmp-page-row dis"><div><div class="cmp-row-name">검색 결과 없음</div><div class="cmp-row-meta">검색어를 줄이거나 섹터를 전체로 바꿔보세요</div></div></div>`}
      </div>
    </div>`;
  renderCompareBody();
}
function setCompareSector(s){ compareSector = decodeURIComponent(s); comparePage = 0; renderCompare(); }
window.setCompareSector = setCompareSector;
function setComparePage(p){ comparePage = p; renderCompare(); }
window.setComparePage = setComparePage;
function setCompareQuery(q){
  compareQuery = q || '';
  comparePage = 0;
  renderCompare();
  setTimeout(()=>{
    const input=document.querySelector('.cmp-combo-input');
    if(input){ input.focus(); const p=input.value.length; input.setSelectionRange(p,p); }
  },0);
}
window.setCompareQuery = setCompareQuery;
function compareInputKey(e){
  if(e.key!=='Enter') return;
  const first = STOCKS.filter(s=>(compareSector==='ALL'||(s.sector||'기타')===compareSector) &&
    (!compareQuery.trim() || [s.name,s.code,s.market,s.sector].some(v=>(v||'').toLowerCase().includes(compareQuery.trim().toLowerCase()))) &&
    !compareSel.includes(s.code)).sort((a,b)=>b.marketCap-a.marketCap)[0];
  if(first){ e.preventDefault(); toggleCompare(first.code); compareQuery=''; }
}
window.compareInputKey = compareInputKey;
function addCompareFromSelect(code){ if(code) toggleCompare(code); }
window.addCompareFromSelect = addCompareFromSelect;
function toggleCompare(code){
  const i = compareSel.indexOf(code);
  if(i>=0) compareSel.splice(i,1);
  else { if(compareSel.length>=3) return; compareSel.push(code); compareQuery=''; comparePage=0; }
  renderCompare();
}
window.toggleCompare = toggleCompare;

function compareRowsDef(){
  const last = (arr)=> (arr&&arr.length)?arr[arr.length-1]:null;
  return [
    ['시가총액', s=>fmtCap(s.marketCap), s=>s.marketCap, 'max'],
    ['거래량', s=>num(s.volume), s=>s.volume, 'max'],
    ['PER', s=>s.per>0?s.per.toFixed(1)+'배':'N/A', s=>s.per>0?s.per:null, 'min'],
    ['ROE', s=>ratio(s.roe), s=>s.roe, 'max'],
    ['영업이익률', s=>ratio(s.opMarginNow), s=>s.opMarginNow, 'max'],
    ['부채비율', s=>{const d=last(s.debtRatio); return d!=null?d.toFixed(0)+'%':'N/A';}, s=>last(s.debtRatio), 'min'],
    ['매출 성장률(YoY)', s=>{const g=yoy(s.revenue); return g==null?'N/A':`<span class="${cls(g)}">${pct(g)}</span>`;}, s=>yoy(s.revenue), 'max'],
    ['최근 매출', s=>fmtEok(last(s.revenue)), s=>last(s.revenue), 'max'],
    ['최근 영업이익', s=>fmtEok(last(s.operatingProfit)), s=>last(s.operatingProfit), 'max'],
    ['최근 순이익', s=>fmtEok(last(s.netProfit)), s=>last(s.netProfit), 'max'],
  ];
}
function compareRowHtml(picks, r){
  const [label, fmt, raw, best] = r;
  let bestIdx = -1;
  if(raw && best){
    const vals = picks.map(s=>raw(s));
    const valid = vals.map((v,i)=>[v,i]).filter(([v])=>v!=null && isFinite(v));
    if(valid.length>1){
      valid.sort((a,b)=> best==='max' ? b[0]-a[0] : a[0]-b[0]);
      if(valid[0][0]!==valid[1][0]) bestIdx = valid[0][1];
    }
  }
  return `<tr><td>${label}</td>${picks.map((s,i)=>`<td class="${i===bestIdx?'best':''}">${fmt(s)}</td>`).join('')}</tr>`;
}
function renderCompareMetricTable(picks){
  const box=el('compare-metric-table'); if(!box) return;
  if(picks.length<2){
    box.innerHTML=`<div class="heat-empty">2종목 이상 선택하면 핵심 지표표가 표시됩니다.</div>`;
    return;
  }
  box.innerHTML = `<div class="compare-table-wrap"><table class="compare-table">
    <thead><tr><th>지표</th>${picks.map(s=>`<th>${h(s.name)}<div class="td-code" style="text-transform:none">${h(s.market)}</div></th>`).join('')}</tr></thead>
    <tbody>${compareRowsDef().map(r=>compareRowHtml(picks,r)).join('')}</tbody>
  </table></div>
  <div style="font-size:11px;color:var(--text3);margin-top:8px">항목별 우위 표시 · PER·부채비율은 낮을수록 우위</div>`;
}

async function renderCompareBody(){
  const picks = compareSel.map(getStock).filter(Boolean);
  const pickKey = picks.map(s=>s.code).join(',');
  if(picks.length<2){
    renderCompareMetricTable(picks);
    el('compare-body').innerHTML = `<div class="empty-state"><div class="ico">⚖️</div><h3>2종목 이상 선택하세요</h3><p>위에서 비교할 종목을 골라주세요.</p></div>`;
    return;
  }
  await Promise.all(picks.map(s=>ensureFinancials(s.code)));
  if(compareSel.join(',') !== pickKey) return;
  renderCompareMetricTable(picks);
  // 안정성 업종 보정 안내 (#1)
  const adjPicks = picks.filter(s=>STAB_DENOM[s.sector]);
  const adjNote = adjPicks.length
    ? `<div class="adj-note"><b>안정성 업종 보정</b> — ${adjPicks.map(s=>`${h(s.name)}(${h(s.sector)})`).join(', ')}는 업종 특성상 부채비율이 구조적으로 높아, 일반 기준(부채비율 250%=0점) 대신 업종 기준(${adjPicks.map(s=>`${h(s.sector)} ${STAB_DENOM[s.sector]}%`).join(', ')}=0점)으로 안정성을 환산했습니다. 부채비율 원본 수치는 아래 표에 그대로 표기됩니다.</div>`
    : '';

  el('compare-body').innerHTML = `
    <div class="compare-viz">
      <div class="chart-card vis-card compare-cap-card">
        <h3>시가총액 비교</h3>
        <div class="ch-sub">선택 종목 비중</div>
        <div class="chart-wrap"><canvas id="chart-compare-cap"></canvas></div>
      </div>
      <div class="chart-card vis-card">
        <h3>실적 비교</h3>
        <div class="ch-sub">최근 연간 실적을 항목별 상대지수로 표시</div>
        <div class="chart-wrap"><canvas id="chart-compare-performance"></canvas></div>
      </div>
      <div class="chart-card vis-card">
        <h3>밸류에이션 비교</h3>
        <div class="ch-sub">PER·PBR·ROE·배당수익률</div>
        <div id="compare-valuation"></div>
      </div>
    </div>${adjNote}`;
  renderCompareVisuals(picks);
}

// 안정성 업종 보정: 부채비율 0점 기준(denominator). 일반=250%, 고레버리지 업종은 완화.
const STAB_DENOM = { '금융':2000, '지주':600, '건설':600, '운송':600 };
function stabilityScore(s){
  if(s.debtNow==null) return 50;
  return clampN(100 - s.debtNow/(STAB_DENOM[s.sector]||250)*100, 0, 100);
}
const COMP_AXES = ['수익성','마진','안정성','성장성','밸류에이션'];
function compScores(s){
  const g = yoy(s.revenue);
  return [
    s.roe!=null         ? clampN(s.roe/25*100, 0, 100) : 0,
    s.opMarginNow!=null ? clampN(s.opMarginNow/25*100, 0, 100) : 0,
    stabilityScore(s),
    g!=null             ? clampN((g+20)/60*100, 0, 100) : 50,
    (s.per&&s.per>0)    ? clampN(100-(s.per-5)*(90/55), 10, 100) : 30,
  ].map(v=>+v.toFixed(0));
}
function renderCompareCap(picks){
  const canvas = el('chart-compare-cap');
  if(!canvas || typeof Chart==='undefined') return;
  const palette = [COLOR.navy, COLOR.teal, COLOR.gold];
  const list = picks.filter(s=>s && s.marketCap>0);
  const total = list.reduce((a,s)=>a+s.marketCap,0);
  const empty = !list.length || total<=0;
  mountChart('chart-compare-cap', {
    type:'doughnut',
    data:{
      labels: empty ? ['선택 없음'] : list.map(s=>s.name),
      datasets:[{
        data: empty ? [1] : list.map(s=>s.marketCap),
        backgroundColor: empty ? ['#E8EDF3'] : list.map((_,i)=>palette[i%palette.length]),
        borderColor:'#fff', borderWidth:3, hoverOffset:6,
      }]
    },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', animation:{duration:450,easing:'easeOutQuart'},
      plugins:{ legend:{display:!empty, position:'right', labels:{font:{family:FONT,size:11,weight:'700'}, color:COLOR.text2, usePointStyle:true, boxHeight:7}},
        centerText:{ lines: empty ? ['선택 없음','-'] : ['합산 시총', fmtCap(total)] },
        tooltip:{ ...baseTooltip(), callbacks:{ label:ctx=>{
          if(empty) return ' 비교할 종목을 선택하세요';
          const pctShare = total ? (ctx.raw/total*100).toFixed(1) : '0.0';
          return ` ${ctx.label}: ${fmtCap(ctx.raw)} (${pctShare}%)`;
        } } } }
    },
    plugins:[centerTextPlugin]
  });
}
function renderCompareVisuals(picks){
  renderCompareCap(picks);
  renderComparePerformance(picks);
  renderCompareValuation(picks);
}
function renderComparePerformance(picks){
  const last = arr => (arr&&arr.length)?arr[arr.length-1]:null;
  const metrics = [
    {key:'revenue', label:'매출', color:COLOR.navy, raw:s=>last(s.revenue)},
    {key:'op', label:'영업이익', color:COLOR.teal, raw:s=>last(s.operatingProfit)},
    {key:'net', label:'순이익', color:COLOR.gold, raw:s=>last(s.netProfit)},
  ];
  const raw = metrics.map(m=>picks.map(s=>m.raw(s)));
  const maxByMetric = raw.map(arr=>Math.max(...arr.map(v=>Math.abs(Number(v)||0)), 1));
  mountChart('chart-compare-performance', {
    type:'bar',
    data:{
      labels:picks.map(s=>s.name),
      datasets:metrics.map((m,mi)=>({
        label:m.label,
        data:raw[mi].map(v=>v==null?null:+((Number(v)||0)/maxByMetric[mi]*100).toFixed(1)),
        backgroundColor:m.color,
        borderRadius:4,
        maxBarThickness:30,
      }))
    },
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},animation:{duration:450,easing:'easeOutQuart'},
      plugins:{legend:baseLegend(),tooltip:{...baseTooltip(),callbacks:{label:ctx=>{
        const v=raw[ctx.datasetIndex]?.[ctx.dataIndex];
        return ` ${ctx.dataset.label}: ${v!=null?fmtEok(v):'N/A'}원`;
      }}}},
      scales:baseScales({y:{min:-100,max:100,grid:{color:COLOR.grid},border:{display:false},ticks:{font:{family:FONT,size:10.5},color:COLOR.text3,callback:v=>v}}})}
  });
}
function renderCompareValuation(picks){
  const box=el('compare-valuation'); if(!box) return;
  const metrics=[
    ['PER', s=>s.per>0?s.per:null, '배'],
    ['PBR', s=>pbrOfBest(s), '배'],
    ['ROE', s=>s.roe, '%'],
    ['배당', s=>divYieldOf(s), '%'],
  ];
  const valsByMetric=metrics.map(([_,fn])=>picks.map(fn));
  const maxByMetric=valsByMetric.map(vals=>Math.max(...vals.filter(v=>v!=null && isFinite(v)).map(v=>Math.abs(v)), 1));
  box.innerHTML=`<div class="valuation-grid">
    <div class="valuation-row head"><div>종목명</div>${metrics.map(([m])=>`<div>${m}</div>`).join('')}</div>
    ${picks.map(s=>`<div class="valuation-row">
      <div class="valuation-name">${h(s.name)}</div>
      ${metrics.map(([_,fn,unit],mi)=>{
        const v=fn(s);
        const w=v!=null&&isFinite(v)?Math.max(5,Math.min(100,Math.abs(v)/maxByMetric[mi]*100)):0;
        return `<div class="valuation-cell"><span class="bar" style="width:${w}%"></span><span class="v">${v!=null&&isFinite(v)?Number(v).toFixed(unit==='%'?1:2):'N/A'}${v!=null&&isFinite(v)?unit:''}</span></div>`;
      }).join('')}
    </div>`).join('')}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// 관심종목
// ─────────────────────────────────────────────────────────────
function renderWatchlist(){
  const wl = loadWatchlist();
  const picks = wl.map(getStock).filter(Boolean);
  if(!picks.length){
    el('watchlist-body').innerHTML = `<div class="empty-state"><div class="ico">⭐</div><h3>관심종목이 비어 있습니다</h3><p>종목 분석 화면에서 ☆ 버튼을 눌러 추가하세요.</p></div>`;
    return;
  }
  el('watchlist-body').innerHTML = `
    <div class="table-wrap"><div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>종목</th><th>시장</th><th>섹터</th>
          <th class="num">현재가</th><th class="num">등락률</th><th class="num">거래량</th><th class="num">시가총액</th><th></th></tr></thead>
        <tbody>${picks.map(s=>`
          <tr onclick="openAnalysis('${s.code}')">
            <td><div class="td-name">${h(s.name)}</div><div class="td-code">${h(s.code)}</div></td>
            <td>${h(s.market)}</td><td class="muted">${h(s.sector)}</td>
            <td class="num">${num(s.price)}</td>
            <td class="num ${cls(s.change)}">${pct(s.change)}</td>
            <td class="num">${num(s.volume)}</td>
            <td class="num">${fmtCap(s.marketCap)}</td>
            <td class="num"><button class="chip" style="padding:4px 10px" onclick="event.stopPropagation();removeWatch('${s.code}')">해제</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div></div>`;
}
function removeWatch(code){ toggleWatch(code); renderWatchlist(); }
window.removeWatch = removeWatch;

// ─────────────────────────────────────────────────────────────
// 검색 (nav) — 유니버스 종목으로 이동
// ─────────────────────────────────────────────────────────────
let searchTimer = null, searchActive = -1, searchResults = [];
function setupSearch(){
  const input = el('nav-search-input'), pop = el('nav-search-pop');
  if(!input || !pop) return;
  const close = ()=>{ pop.classList.remove('show'); searchActive=-1; };
  const go = (code)=>{ input.value=''; close(); openAnalysis(code); };
  window._searchGo = go;

  input.addEventListener('input', ()=>{
    const q = input.value.trim();
    clearTimeout(searchTimer);
    if(!q){ close(); return; }
    searchTimer = setTimeout(async ()=>{
      let list = [];
      if(API_OK){ try{ const r = await api('search',{q}); if(r.ok) list = r.list; }catch(e){} }
      if(!API_OK || !list.length){
        const ql=q.toLowerCase();
        list = STOCKS.filter(s=> s.name.toLowerCase().includes(ql) || s.code.includes(q)).slice(0,12)
                     .map(s=>({code:s.code,name:s.name,market:s.market,sector:s.sector}));
      }
      const inUniverse = list.filter(it=>getStock(it.code));
      searchResults = inUniverse; searchActive=-1;
      if(!inUniverse.length){
        pop.innerHTML = `<div class="nsr-empty">${list.length?'전체 시장에는 있지만, 분석 유니버스 종목만 제공합니다.':'검색 결과가 없습니다.'}</div>`;
        pop.classList.add('show'); return;
      }
      pop.innerHTML = inUniverse.map((it,i)=>`
        <button class="nsr-item" data-i="${i}" onclick="_searchGo('${it.code}')">
          <div class="nsr-main"><div class="nsr-name">${h(it.name)}</div><div class="nsr-code">${h(it.code)}</div></div>
          <div class="nsr-tags"><span class="nsr-tag">${h(it.market||'')}</span>${it.sector?`<span class="nsr-tag">${h(it.sector)}</span>`:''}</div>
        </button>`).join('');
      pop.classList.add('show');
    }, 180);
  });

  input.addEventListener('keydown', (e)=>{
    if(!pop.classList.contains('show') || !searchResults.length) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); searchActive=Math.min(searchActive+1,searchResults.length-1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); searchActive=Math.max(searchActive-1,0); }
    else if(e.key==='Enter'){ e.preventDefault(); const pick=searchResults[searchActive>=0?searchActive:0]; if(pick) go(pick.code); return; }
    else if(e.key==='Escape'){ close(); return; }
    qsa('#nav-search-pop .nsr-item').forEach(b=>b.classList.toggle('active', +b.dataset.i===searchActive));
  });
  document.addEventListener('click', (e)=>{ if(!e.target.closest('.nav-search')) close(); });
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
function ensureChartJs(cb){
  if(typeof Chart!=='undefined'){ cb(); return; }
  const sc=document.createElement('script');
  sc.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  sc.onload=cb; document.head.appendChild(sc);
}

document.addEventListener('DOMContentLoaded', async ()=>{
  qsa('.nav-tab').forEach(t=>t.addEventListener('click', ()=>switchTab(t.dataset.tab)));
  setupSearch();
  // 모달 바깥 클릭/ESC 닫기
  const mbg = el('chart-modal-bg');
  if(mbg) mbg.addEventListener('click', (e)=>{ if(e.target===mbg) closeChartModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && mbg && mbg.classList.contains('show')) closeChartModal(); });

  await loadData();
  selectedCode = defaultAnalysisCode();

  const valid=['dashboard','analysis','ranking','compare','watchlist'];
  const hash=(location.hash||'').replace('#','');
  const start = (hash && valid.includes(hash)) ? hash : 'dashboard';
  currentTab = start;
  qsa('.tab-view').forEach(v=>v.classList.toggle('active', v.id==='tab-'+start));
  qsa('.nav-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===start));

  ensureChartJs(()=> renderCurrentTab());

  window.addEventListener('hashchange', ()=>{
    const hh=(location.hash||'').replace('#','');
    if(hh && valid.includes(hh) && hh!==currentTab) switchTab(hh, true);
  });
});

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
    ctx.setLineDash([]);
    const label = num(opts.price);
    ctx.font = `700 10.5px Pretendard,sans-serif`;
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = col;
    roundRectPath(ctx, right-w, y-10, w, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, right-w/2, y+0.5);
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
const DATA = { volume:[], marketcap:[], overview:null, basisDate:null };
const sparkCache = {};

function getStock(code){ return STOCKS.find(s=>s.code===code) || null; }

async function loadData(){
  try{
    const [ov, cap, vol] = await Promise.all([ api('overview'), api('marketcap'), api('volume') ]);
    if(!(cap.list&&cap.list.length) && !(vol.list&&vol.list.length)) throw new Error('빈 응답');
    DATA.overview  = ov && ov.ok ? ov : null;
    DATA.basisDate = (cap.basisDate || vol.basisDate || (ov&&ov.basisDate)) || null;
    DATA.marketcap = (cap.list||[]).map(normListItem);
    DATA.volume    = (vol.list||[]).map(normListItem);
    const m={}; [...DATA.marketcap, ...DATA.volume].forEach(s=>{ if(!m[s.code]) m[s.code]=s; });
    STOCKS = Object.values(m);
    API_OK = true;
  }catch(e){
    API_OK = false;
    STOCKS = (window.STOCKS_SEED||[]).map(normSeed);
    DATA.marketcap = [...STOCKS].sort((a,b)=>b.marketCap-a.marketCap);
    DATA.volume    = [...STOCKS].sort((a,b)=>b.volume-a.volume);
    DATA.overview  = null;
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
    case 'volume':    renderVolume();    break;
    case 'marketcap': renderMarketCap(); break;
    case 'compare':   renderCompare();   break;
    case 'watchlist': renderWatchlist(); break;
  }
}

// ─────────────────────────────────────────────────────────────
// 대시보드 (3단 목록 + 행 클릭 미니차트)
// ─────────────────────────────────────────────────────────────
function renderDashboard(){
  const badge = el('hero-badge');
  if(badge) badge.innerHTML = `<span class="hero-badge-dot"></span>${ API_OK ? (DATA.basisDate? h(DATA.basisDate)+' 종가 기준' : '공공데이터·DART 기준') : '오프라인 시드 데이터' }`;

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

  el('dash-volume-list').innerHTML = DATA.volume.slice(0,6).map((s,i)=>rankItemHtml(s,i,'volume','vol')).join('');
  el('dash-mcap-list').innerHTML = DATA.marketcap.slice(0,6).map((s,i)=>rankItemHtml(s,i,'mcap','cap')).join('');
  const topChg = [...STOCKS].filter(s=>s.amount>5e8 || !API_OK).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,6);
  el('dash-change-list').innerHTML = topChg.map((s,i)=>rankItemHtml(s,i,'change','chg')).join('');
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
  if(mode==='vol')      right = `<div class="rank-num"><div class="v">${fmtVol(s.volume)}</div><div class="chg ${cls(s.change)}">${pct(s.change)}</div></div>`;
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
  qsa(`#dash-${panel==='volume'?'volume':panel==='mcap'?'mcap':'change'}-list .rank-chart`).forEach(b=>{ b.style.display='none'; });
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

function openAnalysis(code){ selectedCode = code; pushRecent(code); switchTab('analysis'); }
window.openAnalysis = openAnalysis;

// ─────────────────────────────────────────────────────────────
// 종목 분석 — 선택(피커+퀵칩) / 캔들차트 / 재무
// ─────────────────────────────────────────────────────────────
function renderAnalysis(){
  setupPicker();
  if(!selectedCode || !getStock(selectedCode)) selectedCode = STOCKS.length ? STOCKS[0].code : null;
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
  const close = ()=>{ pop.classList.remove('show'); pickerActive=-1; };
  const renderPop = (list, emptyMsg)=>{
    pickerResults = list; pickerActive=-1;
    pop.innerHTML = list.length ? list.map((it,i)=>`
      <button class="nsr-item" data-i="${i}" onclick="pickStock('${it.code}')">
        <div class="nsr-main"><div class="nsr-name">${h(it.name)}</div><div class="nsr-code">${h(it.code)}</div></div>
        <div class="nsr-tags"><span class="nsr-tag">${h(it.market||'')}</span><span class="nsr-tag">${h(it.sector||'')}</span></div>
      </button>`).join('')
      : `<div class="nsr-empty">${emptyMsg||'검색 결과가 없습니다.'}</div>`;
    pop.classList.add('show');
  };
  input.addEventListener('focus', ()=>{ input.select(); renderPop(STOCKS.slice(0,12), null); });
  input.addEventListener('input', ()=>{
    const q = input.value.trim();
    clearTimeout(pickerTimer);
    if(!q){ renderPop(STOCKS.slice(0,12)); return; }
    pickerTimer = setTimeout(async ()=>{
      const ql = q.toLowerCase();
      let list = STOCKS.filter(s=> s.name.toLowerCase().includes(ql) || s.code.includes(q)).slice(0,12);
      let emptyMsg = null;
      if(!list.length && API_OK){
        try{
          const r = await api('search',{q});
          if(r.ok && r.list.length) emptyMsg = '전체 시장에는 있지만, 분석은 시총·거래량 상위 종목만 제공합니다.';
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
  updateWatchBtn();
  curSpark = null;

  el('analysis-body').innerHTML = `
    <div class="analysis-hero">
      <div class="ah-left">
        <div class="ah-tags"><span class="ah-tag">${h(s.market)}</span><span class="ah-tag">${h(s.sector)}</span></div>
        <div class="ah-name">${h(s.name)}</div>
        <div class="ah-code">${h(s.code)}</div>
      </div>
      <div class="ah-spark"><canvas id="ah-spark-canvas"></canvas></div>
      <div class="ah-right">
        <div class="ah-price">${num(s.price)}<small>원</small></div>
        <div class="ah-chg ${cls(s.change)}">${arrow(s.change)} ${pct(s.change)}</div>
      </div>
      <div class="ah-band" id="ah-band" style="display:none"></div>
    </div>
    <div class="metric-row" id="analysis-metrics"></div>
    <div class="growth-strip" id="growth-strip" style="display:none"></div>
    <div class="analysis-note" id="analysis-note"><strong>한 줄 분석</strong>재무 데이터 불러오는 중…</div>

    <div class="chart-card full" style="margin-bottom:16px">
      <div class="chart-toolbar">
        <div><h3>가격 차트</h3><div class="ch-sub" id="price-sub">불러오는 중…</div></div>
        <div class="chart-ctrls" id="price-controls"></div>
      </div>
      <div class="chart-wrap" style="height:340px"><canvas id="chart-price"></canvas></div>
    </div>

    <div id="analysis-charts"></div>`;

  renderAnalysisMetrics(s);

  // 가격 이력 → 히어로 스파크 + 52주 밴드 + 캔들차트
  ensureSpark(s.code).then(sp=>{
    if(s.code !== selectedCode) return;
    curSpark = sp;
    if(sp) drawSpark('ah-spark-canvas', sp.series, s.change, true);
    renderBand(s, sp);
    renderPriceArea();
  });

  await ensureFinancials(s.code);
  if(s.code !== selectedCode) return;
  renderAnalysisMetrics(s);
  renderGrowthStrip(s);
  el('analysis-note').innerHTML = `<strong>한 줄 분석</strong>${h(s.comment || genComment(s))}`;

  if(s._finEmpty){
    el('analysis-charts').innerHTML = `<div class="fin-empty"><div class="ico">📄</div>이 종목은 DART 재무제표를 제공하지 않습니다.<br>(우선주·리츠·스팩 등은 별도 재무가 없을 수 있습니다.)</div>`;
    return;
  }
  el('analysis-charts').innerHTML = `
    <div class="chart-grid">
      <div class="chart-card full">
        <h3>매출 · 영업이익 · 순이익 추이</h3>
        <div class="ch-sub">최근 ${s.years.length}개 연도 · ${API_OK?'DART 연결재무제표':'시드'} (단위: 억원)</div>
        <div class="chart-wrap"><canvas id="chart-income"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>부채비율 추이</h3>
        <div class="ch-sub">부채총계 / 자본총계 (단위: %)</div>
        <div class="chart-wrap"><canvas id="chart-debt"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>영업이익률 · ROE</h3>
        <div class="ch-sub">수익성 지표 (단위: %)</div>
        <div class="chart-wrap"><canvas id="chart-profitability"></canvas></div>
      </div>
    </div>`;
  renderIncomeChart(s);
  renderDebtChart(s);
  renderProfitabilityChart(s);
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
  const sub = el('price-sub');
  if(curSpark && curSpark.dates && curSpark.dates.length){
    const ivName = {D:'일봉',W:'주봉',M:'월봉'}[chartState.interval];
    if(sub) sub.textContent = `${dashD(curSpark.dates[0])} ~ ${dashD(curSpark.dates[curSpark.dates.length-1])} · ${ivName} · ${curSpark.open?'캔들(시가·고가·저가·종가)+거래량':'종가 라인'}`;
  } else if(sub){ sub.textContent = '가격 이력이 아직 없습니다'; }
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

  // 이동평균 — 전체 bars 기준 계산 후 표시 구간만 슬라이스 (가장자리 끊김 방지)
  const allCloses = bars.map(b=>b.c);
  const maDefs = chartState.interval==='D' ? [[5,'#C8973A'],[20,'#2D7D6F'],[60,'#7C5CDB']]
               : chartState.interval==='W' ? [[4,'#C8973A'],[13,'#2D7D6F']]
               : [[3,'#C8973A'],[6,'#2D7D6F']];
  const s0 = startIdx<0 ? 0 : startIdx;
  const maSets = maDefs.map(([n,col])=>({
    type:'line', label:`MA${n}`, data:calcMA(allCloses,n).slice(s0),
    borderColor:col, borderWidth:1.6, pointRadius:0, pointHoverRadius:0, fill:false, tension:.25,
    yAxisID:'y', order:0, spanGaps:true,
  }));

  const labels = vis.map(b=>fmtD(b.d, chartState.interval==='M'));
  const wick = vis.map(b=>[b.l,b.h]);
  const body = vis.map(b=>{
    let lo=Math.min(b.o,b.c), hi=Math.max(b.o,b.c);
    if(hi-lo < hi*0.0015) hi = lo + Math.max(hi*0.0015, 1);   // 보합 시 최소 두께
    return [lo,hi];
  });
  const up = vis.map(b=> b.c>=b.o);
  const bodyCol  = up.map(u=> u ? '#E8453C' : '#2D63E8');
  const bodyEdge = up.map(u=> u ? '#C12F27' : '#1E4ACB');
  const volCol   = up.map(u=> u ? 'rgba(232,69,60,.28)' : 'rgba(45,99,232,.28)');
  const maxV = Math.max(...vis.map(b=>b.v||0), 1);
  const isBig = canvasId==='chart-price-big';
  const lastBar = vis[vis.length-1];

  mountChart(canvasId, {
    data:{ labels, datasets:[
      ...maSets,
      { type:'bar', label:'캔들', data:body, backgroundColor:bodyCol, borderColor:bodyEdge, borderWidth:1,
        yAxisID:'y', order:1, barPercentage:.78, categoryPercentage:.92, borderSkipped:false, borderRadius:2, maxBarThickness:isBig?26:20 },
      { type:'bar', label:'심지', data:wick, backgroundColor:bodyEdge, yAxisID:'y', order:2,
        barPercentage:.14, categoryPercentage:.92, borderSkipped:false, maxBarThickness:3.5 },
      { type:'bar', label:'거래량', data:vis.map(b=>b.v), backgroundColor:volCol, yAxisID:'yv', order:3,
        barPercentage:.6, categoryPercentage:.92, borderRadius:2, maxBarThickness:isBig?22:16 },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:{duration:240,easing:'easeOutQuart'},
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{ display:true, align:'start', labels:{
          font:{family:FONT,size:11,weight:'700'}, color:COLOR.text2, usePointStyle:true, pointStyleWidth:14, boxHeight:5, padding:14,
          filter: item=>String(item.text).startsWith('MA'),
        }},
        tooltip:{ ...baseTooltip(), displayColors:false, animation:{duration:80}, position:'nearest', caretSize:5,
          backgroundColor:'rgba(8,20,36,.95)', borderColor:'rgba(200,151,58,.4)', borderWidth:1, padding:12,
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
        lastPrice:{ price:lastBar.c, up:up[up.length-1] },
      },
      scales:{
        x:{ grid:{display:false}, border:{color:'rgba(0,0,0,.08)'}, ticks:{maxTicksLimit:isBig?14:10,autoSkip:true,font:{family:FONT,size:10.5},color:COLOR.text3} },
        y:{ position:'right', grid:{color:'rgba(15,37,64,.05)'}, border:{display:false}, ticks:{maxTicksLimit:7,font:{family:FONT,size:10.5},color:COLOR.text3,callback:v=>num(v)}, grace:'5%' },
        yv:{ display:false, max:maxV*4.4 }
      }
    },
    plugins:[crosshairPlugin, lastPricePlugin]
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

function renderIncomeChart(s){
  const labels = s.years.map(y=>y+'');
  mountChart('chart-income', {
    data:{ labels, datasets:[
      { type:'bar', label:'매출액', data:s.revenue, backgroundColor:'rgba(30,58,95,.18)', borderColor:COLOR.navy, borderWidth:1, borderRadius:4, order:3, yAxisID:'y' },
      { type:'line', label:'영업이익', data:s.operatingProfit, borderColor:COLOR.teal, backgroundColor:COLOR.teal, borderWidth:2.5, tension:.35, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:COLOR.teal, pointBorderColor:'#fff', pointBorderWidth:2, order:1, yAxisID:'y' },
      { type:'line', label:'순이익', data:s.netProfit, borderColor:COLOR.gold, backgroundColor:COLOR.gold, borderWidth:2.5, tension:.35, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:COLOR.gold, pointBorderColor:'#fff', pointBorderWidth:2, borderDash:[4,3], order:2, yAxisID:'y' }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, animation:{duration:500,easing:'easeOutQuart'},
      plugins:{ legend:baseLegend(), tooltip:baseTooltip(v=>fmtEok(v)+'원') },
      scales:baseScales({ y:{ grid:{color:COLOR.grid,drawBorder:false}, border:{display:false}, ticks:{font:{family:FONT,size:11},color:COLOR.text3,padding:6,callback:v=>fmtEok(v)}, grace:'10%' } }) }
  });
}
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
// 거래량 / 시가총액 상위 (툴바 필터 + 헤더 클릭 정렬)
// ─────────────────────────────────────────────────────────────
const MARKETS = ['ALL','KOSPI','KOSDAQ'];
const LIST_STATE = {
  vol: { market:'ALL', sector:'ALL', sortKey:'volume',    sortDir:-1 },
  cap: { market:'ALL', sector:'ALL', sortKey:'marketCap', sortDir:-1 },
};

function setListFilter(tab, kind, val){
  const st = LIST_STATE[tab];
  if(kind==='market'){ st.market = val; st.sector = 'ALL'; }
  else st.sector = decodeURIComponent(val);
  tab==='vol' ? renderVolume() : renderMarketCap();
}
window.setListFilter = setListFilter;
function setSort(tab, key){
  const st = LIST_STATE[tab];
  if(st.sortKey===key) st.sortDir *= -1;
  else { st.sortKey = key; st.sortDir = -1; }
  tab==='vol' ? renderVolume() : renderMarketCap();
}
window.setSort = setSort;

function toolbarHtml(tab, base, st){
  const inMarket = base.filter(s=>st.market==='ALL'||s.market===st.market);
  const counts = {};
  inMarket.forEach(s=>{ const k=s.sector||'기타'; counts[k]=(counts[k]||0)+1; });
  const sectors = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const n = inMarket.filter(s=>st.sector==='ALL'||(s.sector||'기타')===st.sector).length;
  return `<div class="list-toolbar">
    <div class="seg">${MARKETS.map(m=>`<button class="${m===st.market?'on':''}" onclick="setListFilter('${tab}','market','${m}')">${m==='ALL'?'전체':m}</button>`).join('')}</div>
    <div class="sector-scroll">
      <button class="chip ${st.sector==='ALL'?'on':''}" onclick="setListFilter('${tab}','sector','ALL')">전체 섹터<small>${inMarket.length}</small></button>
      ${sectors.map(s=>`<button class="chip ${s===st.sector?'on':''}" onclick="setListFilter('${tab}','sector','${encodeURIComponent(s)}')">${h(s)}<small>${counts[s]}</small></button>`).join('')}
    </div>
    <span class="result-count">${n}종목</span>
  </div>`;
}
function thSort(tab, key, label, st){
  const on = st.sortKey===key;
  return `<th class="num sortable" onclick="setSort('${tab}','${key}')">${label}<span class="arr">${on?(st.sortDir<0?'▼':'▲'):''}</span></th>`;
}
function filteredSorted(base, st){
  const rows = base.filter(s=>(st.market==='ALL'||s.market===st.market) && (st.sector==='ALL'||(s.sector||'기타')===st.sector));
  const k = st.sortKey, dir = st.sortDir;
  rows.sort((a,b)=> ((Number(b[k])||0) - (Number(a[k])||0)) * (dir===-1?1:-1));
  return rows;
}

function renderVolume(){
  const st = LIST_STATE.vol, base = DATA.volume;
  el('volume-toolbar').innerHTML = toolbarHtml('vol', base, st);
  const rows = filteredSorted(base, st);
  el('volume-table').innerHTML = `
    <thead><tr><th>#</th><th>종목</th><th>시장</th><th>섹터</th>
      ${thSort('vol','price','현재가',st)}${thSort('vol','change','등락률',st)}${thSort('vol','volume','거래량',st)}${thSort('vol','amount','거래대금',st)}${thSort('vol','marketCap','시가총액',st)}</tr></thead>
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

function renderMarketCap(){
  const st = LIST_STATE.cap, base = DATA.marketcap;
  el('marketcap-toolbar').innerHTML = toolbarHtml('cap', base, st);
  const rows = filteredSorted(base, st);
  el('marketcap-table').innerHTML = `
    <thead><tr><th>#</th><th>종목</th><th>시장</th><th>섹터</th>
      ${thSort('cap','price','현재가',st)}${thSort('cap','change','등락률',st)}${thSort('cap','marketCap','시가총액',st)}${thSort('cap','volume','거래량',st)}</tr></thead>
    <tbody>${rows.map((s,i)=>`
      <tr onclick="openAnalysis('${s.code}')">
        <td class="muted">${i+1}</td>
        <td><div class="td-name">${h(s.name)}</div><div class="td-code">${h(s.code)}</div></td>
        <td>${h(s.market)}</td><td class="muted">${h(s.sector)}</td>
        <td class="num">${num(s.price)}</td>
        <td class="num ${cls(s.change)}">${pct(s.change)}</td>
        <td class="num">${fmtCap(s.marketCap)}</td>
        <td class="num">${num(s.volume)}</td>
      </tr>`).join('')}</tbody>`;
}

// ─────────────────────────────────────────────────────────────
// 비교
// ─────────────────────────────────────────────────────────────
function renderCompare(){
  if(!compareSel.length) compareSel = STOCKS.slice(0,2).map(s=>s.code);
  el('compare-chips').innerHTML = STOCKS.slice(0,40).map(s=>{
    const on = compareSel.includes(s.code);
    return `<button class="cmp-chip ${on?'on':''}" onclick="toggleCompare('${s.code}')">${h(s.name)}</button>`;
  }).join('');
  el('compare-hint').textContent = compareSel.length>=3 ? '최대 3종목까지 선택할 수 있습니다.' : `${compareSel.length}/3 선택됨`;
  renderCompareBody();
}
function toggleCompare(code){
  const i = compareSel.indexOf(code);
  if(i>=0) compareSel.splice(i,1);
  else { if(compareSel.length>=3) return; compareSel.push(code); }
  renderCompare();
}
window.toggleCompare = toggleCompare;

async function renderCompareBody(){
  const picks = compareSel.map(getStock).filter(Boolean);
  if(picks.length<2){
    el('compare-body').innerHTML = `<div class="empty-state"><div class="ico">⚖️</div><h3>2종목 이상 선택하세요</h3><p>위에서 비교할 종목을 골라주세요.</p></div>`;
    return;
  }
  await Promise.all(picks.map(s=>ensureFinancials(s.code)));
  const last = (arr)=> (arr&&arr.length)?arr[arr.length-1]:null;
  // raw: 우위 판정용 숫자값, best: 'max'|'min' (없으면 판정 안 함)
  const rowsDef = [
    ['현재가', s=>num(s.price)],
    ['등락률', s=>`<span class="${cls(s.change)}">${pct(s.change)}</span>`],
    ['시가총액', s=>fmtCap(s.marketCap), s=>s.marketCap, 'max'],
    ['거래량', s=>num(s.volume)],
    ['PER', s=>s.per>0?s.per.toFixed(1)+'배':'N/A', s=>s.per>0?s.per:null, 'min'],
    ['ROE', s=>ratio(s.roe), s=>s.roe, 'max'],
    ['영업이익률', s=>ratio(s.opMarginNow), s=>s.opMarginNow, 'max'],
    ['부채비율', s=>{const d=last(s.debtRatio); return d!=null?d.toFixed(0)+'%':'N/A';}, s=>last(s.debtRatio), 'min'],
    ['매출 성장률(YoY)', s=>{const g=yoy(s.revenue); return g==null?'N/A':`<span class="${cls(g)}">${pct(g)}</span>`;}, s=>yoy(s.revenue), 'max'],
    ['최근 매출', s=>fmtEok(last(s.revenue)), s=>last(s.revenue), 'max'],
    ['최근 영업이익', s=>fmtEok(last(s.operatingProfit)), s=>last(s.operatingProfit), 'max'],
    ['최근 순이익', s=>fmtEok(last(s.netProfit)), s=>last(s.netProfit), 'max'],
  ];
  const rowHtml = (r)=>{
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
    return `<tr><td class="td-name">${label}</td>${picks.map((s,i)=>`<td class="num ${i===bestIdx?'best':''}">${fmt(s)}</td>`).join('')}</tr>`;
  };
  el('compare-body').innerHTML = `
    <div class="compare-viz">
      <div class="chart-card">
        <h3>종합 역량 비교</h3>
        <div class="ch-sub">수익성·마진·안정성·성장성·밸류에이션 정규화 점수 (0~100)</div>
        <div class="chart-wrap" style="height:300px"><canvas id="chart-radar"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>연도별 매출 비교</h3>
        <div class="ch-sub">선택 종목 매출 추이 (단위: 억원)</div>
        <div class="chart-wrap" style="height:300px"><canvas id="chart-compare"></canvas></div>
      </div>
    </div>
    <div class="table-wrap"><div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>지표</th>${picks.map(s=>`<th class="num">${h(s.name)}<div class="td-code" style="text-transform:none">${h(s.market)}</div></th>`).join('')}</tr></thead>
        <tbody>${rowsDef.map(rowHtml).join('')}</tbody>
      </table>
    </div></div>
    <div style="font-size:11.5px;color:var(--text3);margin-top:8px;padding:0 4px">✦ 항목별 우위 종목 표시 · PER·부채비율은 낮을수록, 나머지는 높을수록 우위</div>`;
  renderCompareRadar(picks);
  renderCompareChart(picks.filter(s=>s.years&&s.years.length));
}

// 레이더: 5개 축 정규화 점수
function radarScores(s){
  const g = yoy(s.revenue);
  return [
    s.roe!=null        ? clampN(s.roe/25*100, 0, 100) : 0,                        // 수익성(ROE 25%↑=만점)
    s.opMarginNow!=null? clampN(s.opMarginNow/25*100, 0, 100) : 0,                // 마진(영업이익률 25%↑=만점)
    s.debtNow!=null    ? clampN(100 - s.debtNow/250*100, 0, 100) : 50,            // 안정성(부채비율 0%=만점, 250%↑=0)
    g!=null            ? clampN((g+20)/60*100, 0, 100) : 50,                      // 성장성(매출 -20%~+40%)
    (s.per&&s.per>0)   ? clampN(100-(s.per-5)*(90/55), 10, 100) : 30,             // 밸류(PER 5배=만점, 60배↑=바닥)
  ].map(v=>+v.toFixed(0));
}
function renderCompareRadar(picks){
  const axes = ['수익성','마진','안정성','성장성','밸류에이션'];
  const colA = [ 'rgba(30,58,95,', 'rgba(45,125,111,', 'rgba(200,151,58,' ];
  mountChart('chart-radar', {
    type:'radar',
    data:{ labels:axes, datasets:picks.map((s,i)=>({
      label:s.name, data:radarScores(s),
      borderColor:colA[i%3]+'1)', backgroundColor:colA[i%3]+'.14)',
      borderWidth:2.2, pointRadius:3.5, pointHoverRadius:6, pointBackgroundColor:colA[i%3]+'1)', pointBorderColor:'#fff', pointBorderWidth:1.5,
    }))},
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:550,easing:'easeOutQuart'},
      plugins:{ legend:baseLegend(), tooltip:{ ...baseTooltip(), callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${ctx.raw}점` } } },
      scales:{ r:{
        min:0, max:100, ticks:{display:false, stepSize:25},
        grid:{color:'rgba(15,37,64,.08)', circular:true},
        angleLines:{color:'rgba(15,37,64,.08)'},
        pointLabels:{font:{family:FONT,size:12,weight:'700'}, color:COLOR.text2}
      }}}
  });
}
function renderCompareChart(picks){
  if(!picks.length) return;
  const baseYears = picks.reduce((a,s)=> s.years.length>a.length?s.years:a, []);
  const labels = baseYears.map(y=>y+'');
  const palette = [COLOR.navy, COLOR.teal, COLOR.gold];
  mountChart('chart-compare', {
    type:'line',
    data:{ labels, datasets:picks.map((s,i)=>({
      label:s.name, data:s.revenue, borderColor:palette[i%3], backgroundColor:palette[i%3],
      borderWidth:2.5, tension:.35, pointRadius:4, pointHoverRadius:6, pointBorderColor:'#fff', pointBorderWidth:2, fill:false, spanGaps:true
    }))},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, animation:{duration:500,easing:'easeOutQuart'},
      plugins:{ legend:baseLegend(), tooltip:baseTooltip(v=>fmtEok(v)+'원') },
      scales:baseScales({ y:{ grid:{color:COLOR.grid,drawBorder:false}, border:{display:false}, ticks:{font:{family:FONT,size:11},color:COLOR.text3,padding:6,callback:v=>fmtEok(v)}, grace:'10%' } }) }
  });
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
        pop.innerHTML = `<div class="nsr-empty">${list.length?'전체 시장에는 있지만, 분석은 시총·거래량 상위 종목만 제공합니다.':'검색 결과가 없습니다.'}</div>`;
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
  if(STOCKS.length) selectedCode = STOCKS[0].code;

  const valid=['dashboard','analysis','volume','marketcap','compare','watchlist'];
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

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

// 내부 표준 종목 모델로 정규화
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
async function ensureSpark(code){
  if(code in sparkCache) return sparkCache[code];
  let series = null;
  if(API_OK){ try{ const sp = await api('spark',{code}); if(sp.ok && sp.series && sp.series.length) series = sp.series; }catch(e){} }
  sparkCache[code] = series;
  return series;
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

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
const WL_KEY = 'stock_lounge_wl';
let currentTab = 'dashboard';
let selectedCode = null;
let compareSel = [];

function loadWatchlist(){ try{ return JSON.parse(localStorage.getItem(WL_KEY)||'[]'); }catch(e){ return []; } }
function saveWatchlist(arr){ try{ localStorage.setItem(WL_KEY, JSON.stringify(arr)); }catch(e){} }
function isWatched(code){ return loadWatchlist().includes(code); }
function toggleWatch(code){
  const wl = loadWatchlist(); const i = wl.indexOf(code);
  if(i>=0) wl.splice(i,1); else wl.push(code);
  saveWatchlist(wl); return wl.includes(code);
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
// 대시보드
// ─────────────────────────────────────────────────────────────
function renderDashboard(){
  // hero badge
  const badge = el('hero-badge');
  if(badge) badge.innerHTML = `<span class="hero-badge-dot"></span>${ API_OK ? (DATA.basisDate? h(DATA.basisDate)+' 종가 기준' : '공공데이터·DART 기준') : '오프라인 시드 데이터' }`;

  // hero stats
  const ov = DATA.overview;
  if(ov && ov.breadth){
    const k=ov.kospi, q=ov.kosdaq, b=ov.breadth;
    el('hero-stats').innerHTML = `
      ${heroIndex('KOSPI', k)}
      ${heroIndex('KOSDAQ', q)}
      <div class="hero-stat"><div class="v"><span class="up">${b.up}</span> <span style="font-size:15px;opacity:.6">/</span> <span class="dn">${b.down}</span></div><div class="l">상승 / 하락 종목</div></div>
      <div class="hero-stat"><div class="v">${ov.usdKrw?Number(ov.usdKrw).toFixed(1):'-'}</div><div class="l">원/달러 환율</div></div>`;
  } else {
    const ups=STOCKS.filter(s=>s.change>0).length, downs=STOCKS.filter(s=>s.change<0).length;
    const turnover=STOCKS.reduce((a,s)=>a+(s.amount||0)/1e8,0);
    el('hero-stats').innerHTML = `
      <div class="hero-stat"><div class="v up">${ups}<span style="font-size:14px"> 종목</span></div><div class="l">상승</div></div>
      <div class="hero-stat"><div class="v dn">${downs}<span style="font-size:14px"> 종목</span></div><div class="l">하락</div></div>
      <div class="hero-stat"><div class="v">${STOCKS.length-ups-downs}<span style="font-size:14px"> 종목</span></div><div class="l">보합</div></div>
      <div class="hero-stat"><div class="v">${fmtCap(Math.round(turnover))}</div><div class="l">추정 거래대금</div></div>`;
  }

  const topVol = DATA.volume.slice(0,6);
  el('dash-volume-cards').innerHTML = topVol.map(stockCardHtml).join('');
  topVol.forEach(s=> ensureSpark(s.code).then(series=> drawSpark('spark-'+s.code, series, s.change)) );

  el('dash-mcap-list').innerHTML = DATA.marketcap.slice(0,6).map((s,i)=>rankRowHtml(s,i,fmtCap(s.marketCap),'cap')).join('');

  const topChg = [...STOCKS].filter(s=>s.amount>5e8 || !API_OK).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,6);
  el('dash-change-list').innerHTML = topChg.map((s,i)=>rankRowHtml(s,i,null,'chg')).join('');
}
function heroIndex(label, idx){
  if(!idx) return `<div class="hero-stat"><div class="v">-</div><div class="l">${label}</div></div>`;
  const c = idx.rate>0?'up':idx.rate<0?'dn':'';
  return `<div class="hero-stat"><div class="v">${Number(idx.price).toLocaleString('ko-KR',{maximumFractionDigits:2})}</div><div class="l">${label} <span class="${c}" style="font-weight:700">${pct(idx.rate)}</span></div></div>`;
}

function stockCardHtml(s){
  return `<div class="stock-card" onclick="openAnalysis('${s.code}')">
    <div class="stock-card-top">
      <div>
        <div class="stock-card-market"><span class="market-tag">${h(s.market)}</span><span class="sector-tag">${h(s.sector)}</span></div>
        <div class="stock-card-name">${h(s.name)}</div>
        <div class="stock-card-code">${h(s.code)}</div>
      </div>
      <div class="stock-card-price">
        <span class="scp-price">${num(s.price)}</span>
        <span class="scp-chg ${cls(s.change)}">${arrow(s.change)} ${pct(s.change)}</span>
      </div>
    </div>
    <div class="spark-wrap"><canvas id="spark-${s.code}"></canvas></div>
    <div class="stock-card-divider"></div>
    <div class="stock-card-stats">
      <div class="scs-item"><span class="l">거래량</span><span class="v">${fmtVol(s.volume)}</span></div>
      <div class="scs-item"><span class="l">거래대금</span><span class="v">${fmtCap(Math.round((s.amount||0)/1e8))}</span></div>
      <div class="scs-item"><span class="l">시총</span><span class="v">${fmtCap(s.marketCap)}</span></div>
    </div>
    <div class="stock-card-foot">
      <span class="stock-card-comment">${h(s.sector)} · ${s.market}</span>
      <span class="stock-card-more">분석 →</span>
    </div>
  </div>`;
}

function rankRowHtml(s, i, rightVal, mode){
  const right = mode==='chg'
    ? `<div class="rank-num"><div class="v">${num(s.price)}</div><div class="chg ${cls(s.change)}">${arrow(s.change)} ${pct(s.change)}</div></div>`
    : `<div class="rank-num"><div class="v">${rightVal}</div><div class="chg ${cls(s.change)}">${pct(s.change)}</div></div>`;
  return `<div class="rank-row" onclick="openAnalysis('${s.code}')">
    <div class="rank-no">${i+1}</div>
    <div class="rank-info"><div class="rank-name">${h(s.name)}</div><div class="rank-meta">${h(s.market)} · ${h(s.sector)}</div></div>
    ${right}
  </div>`;
}

function openAnalysis(code){ selectedCode = code; switchTab('analysis'); }
window.openAnalysis = openAnalysis;

// ─────────────────────────────────────────────────────────────
// 종목 분석
// ─────────────────────────────────────────────────────────────
function renderAnalysis(){
  const sel = el('stock-select');
  const opts = STOCKS.map(s=>`<option value="${s.code}">${h(s.name)} (${h(s.code)}) · ${h(s.market)}</option>`).join('');
  if(sel.dataset.count != String(STOCKS.length)){
    sel.innerHTML = opts; sel.dataset.count = String(STOCKS.length);
    if(!sel._bound){ sel.addEventListener('change', ()=>{ selectedCode = sel.value; renderAnalysisBody(); }); sel._bound=true; }
  }
  if(!selectedCode || !getStock(selectedCode)) selectedCode = STOCKS.length ? STOCKS[0].code : null;
  sel.value = selectedCode || '';
  el('watch-toggle').onclick = ()=>{ if(selectedCode){ toggleWatch(selectedCode); updateWatchBtn(); } };
  renderAnalysisBody();
}
function updateWatchBtn(){
  const on = isWatched(selectedCode);
  const btn = el('watch-toggle');
  btn.classList.toggle('on', on);
  btn.innerHTML = on ? '★ 관심종목 해제' : '☆ 관심종목 추가';
}

async function renderAnalysisBody(){
  const s = getStock(selectedCode);
  if(!s){ el('analysis-body').innerHTML = `<div class="fin-empty"><div class="ico">🔍</div>종목을 선택하세요.</div>`; return; }
  updateWatchBtn();

  // 1) hero + metrics 즉시 렌더 (시세는 이미 보유)
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
    </div>
    <div class="metric-row" id="analysis-metrics"></div>
    <div class="analysis-note" id="analysis-note"><strong>한 줄 분석</strong>재무 데이터 불러오는 중…</div>
    <div id="analysis-charts"></div>`;

  // 스파크라인
  ensureSpark(s.code).then(series=> drawSpark('ah-spark-canvas', series, s.change, true));

  renderAnalysisMetrics(s);

  // 2) 재무 로드 후 차트
  await ensureFinancials(s.code);
  // 사용자가 그 사이 종목을 바꿨다면 중단
  if(s.code !== selectedCode) return;
  renderAnalysisMetrics(s);
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
// 거래량 / 시가총액 상위 (시장 + 섹터 필터)
// ─────────────────────────────────────────────────────────────
const MARKETS = ['ALL','KOSPI','KOSDAQ'];
let volMarket='ALL', volSector='ALL', capMarket='ALL', capSector='ALL';

function sectorsOf(list){ return ['ALL', ...[...new Set(list.map(s=>s.sector||'기타'))].sort((a,b)=>a.localeCompare(b,'ko'))]; }
function marketChips(active, fn){ return MARKETS.map(m=>`<button class="chip ${m===active?'on':''}" onclick="${fn}('mkt','${m}')">${m==='ALL'?'전체 시장':m}</button>`).join(''); }
function sectorChips(list, active, fn){ return sectorsOf(list).map(s=>`<button class="chip ${s===active?'on':''}" onclick="${fn}('sec','${encodeURIComponent(s)}')">${s==='ALL'?'전체 섹터':h(s)}</button>`).join(''); }

function setVolFilter(kind, val){ if(kind==='mkt') volMarket=val; else volSector=decodeURIComponent(val); renderVolume(); }
window.setVolFilter = setVolFilter;
function renderVolume(){
  const base = DATA.volume;
  el('volume-chips').innerHTML =
    `<div class="filter-chips">${marketChips(volMarket,'setVolFilter')}</div>`+
    `<div class="filter-chips">${sectorChips(base, volSector,'setVolFilter')}</div>`;
  const rows = base.filter(s=>(volMarket==='ALL'||s.market===volMarket) && (volSector==='ALL'||(s.sector||'기타')===volSector));
  el('volume-table').innerHTML = `
    <thead><tr><th>#</th><th>종목</th><th>시장</th><th>섹터</th>
      <th class="num">현재가</th><th class="num">등락률</th><th class="num">거래량</th><th class="num">거래대금</th><th class="num">시가총액</th></tr></thead>
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

function setCapFilter(kind, val){ if(kind==='mkt') capMarket=val; else capSector=decodeURIComponent(val); renderMarketCap(); }
window.setCapFilter = setCapFilter;
function renderMarketCap(){
  const base = DATA.marketcap;
  el('marketcap-chips').innerHTML =
    `<div class="filter-chips">${marketChips(capMarket,'setCapFilter')}</div>`+
    `<div class="filter-chips">${sectorChips(base, capSector,'setCapFilter')}</div>`;
  const rows = base.filter(s=>(capMarket==='ALL'||s.market===capMarket) && (capSector==='ALL'||(s.sector||'기타')===capSector));
  el('marketcap-table').innerHTML = `
    <thead><tr><th>#</th><th>종목</th><th>시장</th><th>섹터</th>
      <th class="num">현재가</th><th class="num">등락률</th><th class="num">시가총액</th><th class="num">거래량</th></tr></thead>
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
  const rowsDef = [
    ['현재가', s=>num(s.price)],
    ['등락률', s=>`<span class="${cls(s.change)}">${pct(s.change)}</span>`],
    ['시가총액', s=>fmtCap(s.marketCap)],
    ['거래량', s=>num(s.volume)],
    ['PER', s=>s.per>0?s.per.toFixed(1)+'배':'N/A'],
    ['ROE', s=>ratio(s.roe)],
    ['영업이익률', s=>ratio(s.opMarginNow)],
    ['부채비율', s=>{const d=last(s.debtRatio); return d!=null?d.toFixed(0)+'%':'N/A';}],
    ['최근 매출', s=>fmtEok(last(s.revenue))],
    ['최근 영업이익', s=>fmtEok(last(s.operatingProfit))],
    ['최근 순이익', s=>fmtEok(last(s.netProfit))],
  ];
  el('compare-body').innerHTML = `
    <div class="table-wrap" style="margin-bottom:18px"><div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>지표</th>${picks.map(s=>`<th class="num">${h(s.name)}<div class="td-code" style="text-transform:none">${h(s.market)}</div></th>`).join('')}</tr></thead>
        <tbody>${rowsDef.map(r=>`<tr><td class="td-name">${r[0]}</td>${picks.map(s=>`<td class="num">${r[1](s)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div></div>
    <div class="chart-card">
      <h3>연도별 매출 비교</h3>
      <div class="ch-sub">선택 종목 매출 추이 (단위: 억원)</div>
      <div class="chart-wrap"><canvas id="chart-compare"></canvas></div>
    </div>`;
  renderCompareChart(picks.filter(s=>s.years&&s.years.length));
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
// 검색 (nav)
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
      searchResults = list; searchActive=-1;
      if(!list.length){ pop.innerHTML = `<div class="nsr-empty">검색 결과가 없습니다.</div>`; pop.classList.add('show'); return; }
      pop.innerHTML = list.map((it,i)=>`
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
    qsa('.nsr-item').forEach(b=>b.classList.toggle('active', +b.dataset.i===searchActive));
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

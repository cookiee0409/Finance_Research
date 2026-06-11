// 종목 분석 — stocks-seed.js
// 국내 주요 종목 MOCK 데이터 (실제 수치 아님, 시연용 가상 데이터).
// 각 종목: 종목명/티커/시장/섹터/현재가/등락률/거래량/시가총액/PER/PBR/배당수익률/ROE
//          + 최근 5개 연도 재무제표(매출/영업이익/순이익/부채비율) + 한 줄 요약 코멘트.
// 단위: 가격=원, 시총=억원, 매출/영업이익/순이익=억원, 거래량=주, 부채비율/ROE/배당수익률=%
// app.js보다 먼저 로드되어 window.STOCKS_SEED 로 노출됩니다.

window.STOCKS_SEED = [
  {
    name:'삼성전자', code:'005930', market:'KOSPI', sector:'반도체',
    price:78400, change:1.62, volume:14820000, marketCap:4682000,
    per:14.8, pbr:1.42, dividendYield:1.85, roe:9.8,
    years:[2020,2021,2022,2023,2024],
    revenue:[2368000,2796000,3022000,2589000,3009000],
    operatingProfit:[359900,516300,433800,65700,329500],
    netProfit:[264000,399000,556500,154900,341000],
    debtRatio:[37.1,39.9,26.4,25.4,27.9],
    comment:'메모리 업황 반등과 HBM 비중 확대로 영업이익 회복세, 밸류에이션은 역사적 평균 수준.'
  },
  {
    name:'SK하이닉스', code:'000660', market:'KOSPI', sector:'반도체',
    price:201500, change:3.41, volume:5120000, marketCap:1466000,
    per:11.2, pbr:2.18, dividendYield:0.62, roe:21.4,
    years:[2020,2021,2022,2023,2024],
    revenue:[319000,429000,446000,327000,661000],
    operatingProfit:[50100,124100,68100,-77300,234000],
    netProfit:[47600,96200,22400,-91400,197000],
    debtRatio:[37.0,49.5,63.6,87.0,55.2],
    comment:'AI 수요 기반 HBM 독점적 지위로 흑자 전환, ROE 업종 최고 수준이나 변동성 유의.'
  },
  {
    name:'LG에너지솔루션', code:'373220', market:'KOSPI', sector:'2차전지',
    price:372000, change:-2.10, volume:680000, marketCap:870000,
    per:62.5, pbr:3.05, dividendYield:0.15, roe:5.1,
    years:[2020,2021,2022,2023,2024],
    revenue:[141000,178000,255000,337000,257000],
    operatingProfit:[3880,7680,12100,21600,5750],
    netProfit:[-4520,9300,7800,16400,4150],
    debtRatio:[166.0,88.4,72.5,79.1,86.3],
    comment:'전기차 캐즘으로 단기 실적 둔화, 북미 IRA 보조금 효과와 ESS 확대가 관전 포인트.'
  },
  {
    name:'현대차', code:'005380', market:'KOSPI', sector:'자동차',
    price:243000, change:0.83, volume:920000, marketCap:508000,
    per:5.1, pbr:0.62, dividendYield:4.85, roe:12.6,
    years:[2020,2021,2022,2023,2024],
    revenue:[1039000,1176000,1426000,1626000,1751000],
    operatingProfit:[23900,66800,98200,151300,142400],
    netProfit:[19200,56600,79800,122700,133000],
    debtRatio:[171.0,168.0,162.0,158.0,152.0],
    comment:'하이브리드·고급차 믹스 개선으로 이익체력 강화, 저PER·고배당의 대표 가치주.'
  },
  {
    name:'기아', code:'000270', market:'KOSPI', sector:'자동차',
    price:109800, change:1.20, volume:1310000, marketCap:438000,
    per:4.4, pbr:0.86, dividendYield:5.30, roe:20.8,
    years:[2020,2021,2022,2023,2024],
    revenue:[591000,698000,864000,996000,1074000],
    operatingProfit:[20700,50700,72300,116100,126700],
    netProfit:[14600,46500,54900,87800,99800],
    debtRatio:[98.0,92.0,85.0,78.0,72.0],
    comment:'업종 최고 수준 ROE와 적극적 주주환원, 밸류에이션 매력은 여전히 높음.'
  },
  {
    name:'NAVER', code:'035420', market:'KOSPI', sector:'인터넷',
    price:178500, change:-1.05, volume:740000, marketCap:285000,
    per:18.6, pbr:1.12, dividendYield:0.55, roe:6.2,
    years:[2020,2021,2022,2023,2024],
    revenue:[53000,68000,82000,96700,106000],
    operatingProfit:[12200,13300,13000,14900,19800],
    netProfit:[8500,164800,6600,9800,11500],
    debtRatio:[44.0,48.0,52.0,49.0,46.0],
    comment:'커머스·핀테크 성장과 AI 검색 적용으로 수익성 개선, 광고 경기 민감도 유의.'
  },
  {
    name:'카카오', code:'035720', market:'KOSPI', sector:'인터넷',
    price:41200, change:-0.72, volume:2240000, marketCap:183000,
    per:42.0, pbr:1.35, dividendYield:0.14, roe:3.4,
    years:[2020,2021,2022,2023,2024],
    revenue:[41600,61400,71100,80700,79500],
    operatingProfit:[4560,5970,5800,5020,4900],
    netProfit:[1730,16400,10800,-2880,-410],
    debtRatio:[62.0,71.0,78.0,84.0,80.0],
    comment:'본업 광고·커머스 회복 더디나 AI·콘텐츠 자회사 구조조정으로 체질 개선 시도 중.'
  },
  {
    name:'셀트리온', code:'068270', market:'KOSPI', sector:'바이오',
    price:182000, change:2.34, volume:980000, marketCap:396000,
    per:39.5, pbr:2.45, dividendYield:0.78, roe:6.5,
    years:[2020,2021,2022,2023,2024],
    revenue:[18500,19100,22800,21900,35600],
    operatingProfit:[7120,7530,6470,6360,4920],
    netProfit:[5040,5950,5410,5370,3450],
    debtRatio:[34.0,28.0,31.0,36.0,42.0],
    comment:'합병 후 매출 외형 확대, 바이오시밀러 신제품 출시로 중장기 성장 기대.'
  },
  {
    name:'삼성바이오로직스', code:'207940', market:'KOSPI', sector:'바이오',
    price:962000, change:1.08, volume:120000, marketCap:684000,
    per:58.0, pbr:5.10, dividendYield:0.00, roe:10.9,
    years:[2020,2021,2022,2023,2024],
    revenue:[11600,15700,30000,37000,45000],
    operatingProfit:[2930,5370,9840,11100,13000],
    netProfit:[2410,3940,7980,8580,9600],
    debtRatio:[35.0,42.0,68.0,61.0,55.0],
    comment:'대규모 CDMO 수주잔고와 4공장 가동으로 외형·이익 동반 성장, 프리미엄 밸류.'
  },
  {
    name:'POSCO홀딩스', code:'005490', market:'KOSPI', sector:'철강',
    price:312500, change:-1.84, volume:610000, marketCap:264000,
    per:13.7, pbr:0.48, dividendYield:3.40, roe:3.6,
    years:[2020,2021,2022,2023,2024],
    revenue:[578000,763000,847000,771000,728000],
    operatingProfit:[24000,92400,48600,35700,21800],
    netProfit:[16400,71900,33600,18500,9200],
    debtRatio:[68.0,62.0,71.0,74.0,76.0],
    comment:'철강 시황 부진으로 이익 둔화, 2차전지 소재 사업 가시화가 밸류 리레이팅 관건.'
  },
  {
    name:'KB금융', code:'105560', market:'KOSPI', sector:'금융',
    price:84600, change:0.95, volume:1450000, marketCap:332000,
    per:6.8, pbr:0.58, dividendYield:4.20, roe:9.1,
    years:[2020,2021,2022,2023,2024],
    revenue:[0,0,0,0,0],
    operatingProfit:[46300,61000,62300,63900,70200],
    netProfit:[34600,44100,44100,46300,51200],
    debtRatio:[0,0,0,0,0],
    comment:'밸류업 프로그램 수혜 기대, 안정적 순이익과 높은 배당으로 대표 금융 가치주.'
  },
  {
    name:'에코프로비엠', code:'247540', market:'KOSDAQ', sector:'2차전지',
    price:163000, change:-3.20, volume:1820000, marketCap:159000,
    per:48.0, pbr:4.80, dividendYield:0.20, roe:11.2,
    years:[2020,2021,2022,2023,2024],
    revenue:[8550,14860,53570,69000,44000],
    operatingProfit:[550,1150,3820,1980,-540],
    netProfit:[470,980,2660,1100,-720],
    debtRatio:[120.0,98.0,145.0,158.0,140.0],
    comment:'양극재 대장주이나 전방 수요 둔화·메탈가 하락으로 단기 적자, 증설 부담 상존.'
  },
  {
    name:'알테오젠', code:'196170', market:'KOSDAQ', sector:'바이오',
    price:328000, change:4.10, volume:540000, marketCap:175000,
    per:95.0, pbr:12.4, dividendYield:0.00, roe:14.5,
    years:[2020,2021,2022,2023,2024],
    revenue:[420,650,790,960,2400],
    operatingProfit:[-80,90,150,210,1100],
    netProfit:[-120,60,110,180,950],
    debtRatio:[22.0,18.0,24.0,20.0,16.0],
    comment:'피하주사(SC) 변환 플랫폼 기술수출 본격화로 실적 레벨업, 고밸류 정당화가 과제.'
  },
  {
    name:'HLB', code:'028300', market:'KOSDAQ', sector:'바이오',
    price:81500, change:-2.65, volume:3650000, marketCap:107000,
    per:0.0, pbr:6.20, dividendYield:0.00, roe:-8.4,
    years:[2020,2021,2022,2023,2024],
    revenue:[480,1100,1350,1500,1620],
    operatingProfit:[-620,-540,-480,-520,-460],
    netProfit:[-840,-680,-590,-610,-510],
    debtRatio:[31.0,28.0,34.0,38.0,41.0],
    comment:'리보세라닙 FDA 승인 기대가 주가 핵심 변수, 신약 모멘텀 의존도 높아 변동성 큼.'
  },
  {
    name:'레인보우로보틱스', code:'277810', market:'KOSDAQ', sector:'로봇',
    price:188000, change:5.30, volume:760000, marketCap:36500,
    per:0.0, pbr:9.80, dividendYield:0.00, roe:-3.2,
    years:[2020,2021,2022,2023,2024],
    revenue:[54,90,136,153,210],
    operatingProfit:[-12,10,13,-5,-30],
    netProfit:[-8,14,17,-2,-22],
    debtRatio:[18.0,12.0,15.0,19.0,22.0],
    comment:'삼성전자 지분 참여 이후 휴머노이드 기대감 부각, 실적 대비 밸류 부담은 매우 높음.'
  },
  {
    name:'펄어비스', code:'263750', market:'KOSDAQ', sector:'게임',
    price:42800, change:-1.40, volume:1120000, marketCap:27300,
    per:55.0, pbr:2.10, dividendYield:0.00, roe:3.8,
    years:[2020,2021,2022,2023,2024],
    revenue:[4890,4038,3860,3335,3200],
    operatingProfit:[1573,430,166,-164,90],
    netProfit:[1372,580,310,-50,120],
    debtRatio:[58.0,45.0,40.0,42.0,38.0],
    comment:'신작 붉은사막 출시 기대가 주가 모멘텀, 기존 라인업 매출 감소 구간 통과 중.'
  }
];

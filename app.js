/** PLANT MATTER RAINFOREST MEMORIES — BETA 03. Public demo data + local IndexedDB records. */
const DB_NAME = 'plant-matter-field';
const STORE = 'observations';
const VERSION = 1;
const state = { tab:'home', records:[], selectedMap:'DEMO-001', search:'', onlyMine:false, photoData:null, landPath:'', db:null,
  projection: (localStorage.getItem('pm-map-projection') === 'mercator' ? 'mercator' : 'equal-earth'),
  equalZoom:1, equalCenter:{x:450,y:225}, detailMode:false, detailFocus:null, leaflet:null,
  authClient:null, user:null, profile:null, authMode:'signin', busy:false, settingsOpen:false, editingId:null };
const MAP_NAMES = { 'mercator':'메르카토르 도법 (Mercator)', 'equal-earth':'이퀄 어스 도법 (Equal Earth)' };

const content = document.querySelector('#content');
const overlay = document.querySelector('#detail-overlay');
const $ = (selector, root=document) => root.querySelector(selector);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt = (v) => String(v ?? '').trim();
const show = (v) => v === '' || v === null || v === undefined ? '미기록' : esc(v);
const fmt = (v) => { try { return new Date(v).toLocaleDateString('ko-KR'); } catch { return '-'; } };
const localDate = () => { const d = new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const numberOrNull = v => v === '' || v === null || v === undefined ? null : Number(v);
const STATUS={unidentified:'미동정',proposed:'동정 제안',review:'검토 중',verified:'검증 완료'};
const DEMO = [
 {id:'DEMO-001',isDemo:true,scientificName:'Ficus sp.',family:'Moraceae',country:'Malaysia',locality:'Fraser’s Hill',latitude:3.71,longitude:101.74,elevation:1250,habitat:'산지 열대우림',habit:'착생·포복',substrate:'이끼가 덮인 수피',phenology:'영양생장',lux:'920',temperature:'22.8',humidity:'87',measurementSource:'sample',observedAt:'2026-11-05T09:20:00Z',privacy:'coarse',notes:'실제 관찰 데이터가 아닌 UI 예시입니다.',identificationStatus:'unidentified',suggestions:[]},
 {id:'DEMO-002',isDemo:true,scientificName:'Sonerila sp.',family:'Melastomataceae',country:'Thailand',locality:'Khao Yai',latitude:14.38,longitude:101.4,elevation:860,habitat:'습윤한 숲 하층',habit:'지생',substrate:'낙엽층',phenology:'개화',lux:'620',temperature:'26.1',humidity:'91',measurementSource:'sample',observedAt:'2026-10-12T04:10:00Z',privacy:'coarse',notes:'실제 관찰 데이터가 아닌 UI 예시입니다.',identificationStatus:'unidentified',suggestions:[]},
 {id:'DEMO-003',isDemo:true,scientificName:'Lepanthes sp.',family:'Orchidaceae',country:'Ecuador',locality:'Andean cloud forest',latitude:-0.32,longitude:-78.8,elevation:1820,habitat:'운무림',habit:'착생',substrate:'이끼가 낀 가지',phenology:'개화',lux:'1100',temperature:'18.3',humidity:'95',measurementSource:'sample',observedAt:'2026-09-18T14:05:00Z',privacy:'coarse',notes:'실제 관찰 데이터가 아닌 UI 예시입니다.',identificationStatus:'unidentified',suggestions:[]},
 {id:'DEMO-004',isDemo:true,scientificName:'Begonia sp.',family:'Begoniaceae',country:'Cameroon',locality:'Mount Cameroon',latitude:4.19,longitude:9.18,elevation:1370,habitat:'산지림',habit:'암생',substrate:'습윤한 암면',phenology:'영양생장',lux:'1450',temperature:'21.1',humidity:'89',measurementSource:'sample',observedAt:'2026-08-25T10:30:00Z',privacy:'coarse',notes:'실제 관찰 데이터가 아닌 UI 예시입니다.',identificationStatus:'unidentified',suggestions:[]},
];
const samples=()=>[...state.records,...DEMO];
const getRecord=id=>samples().find(o=>o.id===id);
const toast=(message)=>{const el=$('#toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.add('hidden'),4400)};
function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbAction(mode, callback){return new Promise((resolve,reject)=>{if(!state.db){reject(new Error('IndexedDB를 사용할 수 없습니다.'));return;}const tx=state.db.transaction(STORE,mode);const req=callback(tx.objectStore(STORE));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);});}
async function reload(){state.records=(await dbAction('readonly',store=>store.getAll())).sort((a,b)=>new Date(b.observedAt)-new Date(a.observedAt));}
async function storeRecord(record){await dbAction('readwrite', store=>store.put(record));await reload();}
async function deleteRecord(id){await dbAction('readwrite',store=>store.delete(id));await reload();}
const r1=(v,n=1)=>Math.round(v*10**n)/10**n;
function project(lat, lon){
 const A1=1.340264,A2=-.081106,A3=.000893,A4=.003796,t=Math.asin(Math.sqrt(3)/2*Math.sin(lat*Math.PI/180)),t2=t*t,t6=t2*t2*t2;
 const x=2*Math.sqrt(3)*(lon*Math.PI/180)*Math.cos(t)/(3*(A1+3*A2*t2+7*A3*t6+9*A4*t6*t2));
 const y=A1*t+A2*t*t2+A3*t*t6+A4*t*t6*t2;
 return {x:450+153*x,y:225-153*y};
}
function publicPoint(record){
 if(!['public','coarse'].includes(record.privacy) || !Number.isFinite(record.latitude)||!Number.isFinite(record.longitude))return null;
 if(record.privacy==='public')return {latitude:record.latitude,longitude:record.longitude};
 return {latitude:Math.floor(record.latitude)+.5,longitude:Math.floor(record.longitude)+.5};
}
function graticule(){let paths=[];for(let lat=-60;lat<=60;lat+=30){let d='';for(let lon=-180;lon<=180;lon+=5){const p=project(lat,lon);d+=(lon===-180?'M':'L')+r1(p.x)+','+r1(p.y)+' ';}paths.push(d)}for(let lon=-150;lon<=180;lon+=30){let d='';for(let lat=-90;lat<=90;lat+=5){const p=project(lat,lon);d+=(lat===-90?'M':'L')+r1(p.x)+','+r1(p.y)+' ';}paths.push(d)}return paths;}
const gridPaths=graticule();
const botanicalSvg=`<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><path d="M59 110Q53 82 62 54Q66 40 77 30" stroke="#285943" stroke-width="3"/><path d="M62 76Q25 43 19 56Q19 82 62 76M64 61Q97 28 104 40Q104 61 64 61" fill="#658b68"/><path d="M70 43Q45 7 36 18Q39 43 70 43" fill="#90af88"/><path d="M62 92Q84 73 98 80Q94 103 62 92" fill="#6e9b78"/></svg>`;
function isSafePhoto(s){return typeof s==='string'&&/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(s);}
function artwork(r){return `<div class="botanical">${isSafePhoto(r.photoData)?`<img alt="관찰 식물 사진" src="${r.photoData}"/>`:botanicalSvg}</div>`;}
function recordCard(r){return `<button class="record-card" data-detail="${esc(r.id)}">${artwork(r)}<span class="record-info"><span class="record-status">${r.isDemo?'<span class="tiny-tag">DEMO</span> ':''}${esc(STATUS[r.identificationStatus]||'미동정')}</span><em>${esc(r.scientificName||'미동정 식물')}</em><p>${esc([r.locality,r.country].filter(Boolean).join(' · ')||'위치 미입력')}</p><small>${fmt(r.observedAt)} · ${esc(r.habit||'미기록')}</small></span><span class="record-arrow">›</span></button>`;}
function mapMarkup(){
 if(state.projection==='mercator' || state.detailMode) {
  const showingDetail=state.projection==='equal-earth';
  return `<div class="map-frame tiled-map"><div id="leaflet-map" class="leaflet-map" aria-label="확대 축소 가능한 상세 지도"></div><div class="map-badge">${showingDetail?'EQUAL EARTH → WEB MERCATOR DETAIL':'WEB MERCATOR / EPSG:3857'}</div>${showingDetail?'<button class="map-back" type="button" data-action="equal-back">← 세계 지도로 돌아가기</button>':''}</div>`;
 }
 const cx=state.equalCenter.x,cy=state.equalCenter.y,z=state.equalZoom,w=900/z,h=450/z;
 const left=Math.max(-45,Math.min(cx-w/2,945-w)),top=Math.max(-25,Math.min(cy-h/2,475-h));
 const markers=samples().map(r=>{const point=publicPoint(r);if(!point)return '';const {x,y}=project(point.latitude,point.longitude),active=r.id===state.selectedMap;return `<g class="map-pin" data-map-id="${esc(r.id)}" role="button" tabindex="0" aria-label="${esc(r.scientificName||'미동정 식물')} 관찰 기록"><circle cx="${x}" cy="${y}" r="${active?12:8}" fill="${r.isDemo?'#8f8f8f':'#202020'}" stroke="#fff" stroke-width="3"/><circle cx="${x}" cy="${y}" r="18" fill="transparent"/></g>`;}).join('');
 return `<div class="map-frame equal-map"><svg id="equal-svg" viewBox="${left} ${top} ${w} ${h}" role="img" aria-label="확대 축소 및 이동 가능한 이퀄 어스 세계 지도" xmlns="http://www.w3.org/2000/svg"><rect x="-600" y="-450" width="2100" height="1500" fill="#f7f7f7"/>${gridPaths.map(d=>`<path d="${d}" stroke="#dddddd" stroke-width="1" fill="none"/>`).join('')}<path d="${state.landPath}" fill="#cdcdcd" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>${markers}</svg><div class="map-badge">EQUAL EARTH / EPSG:8857</div><div class="map-zoom"><button type="button" data-action="zoom-in" aria-label="지도 확대">＋</button><button type="button" data-action="zoom-out" aria-label="지도 축소">－</button></div></div>`;
}
function pinSummary(){const records=samples();let selected=getRecord(state.selectedMap);if(!publicPoint(selected||{}))selected=records.find(r=>publicPoint(r));return selected?`<button class="selected-record" data-detail="${esc(selected.id)}">${artwork(selected)}<span class="record-info"><span class="record-status">SELECTED OBSERVATION ${selected.isDemo?'· DEMO':''}</span><em>${esc(selected.scientificName)}</em><p>${esc([selected.locality,selected.country].filter(Boolean).join(' · '))}</p></span><span class="record-arrow">›</span></button>`:'<p class="info">지도에 표시할 공개 위치가 없습니다.</p>'}
function mapScreen(){
 return `<section class="page"><div class="eyebrow">GLOBAL BOTANICAL OBSERVATIONS</div><h1>FIELD MAP</h1><p class="lead">지도 도법은 OPTIONS에서 변경할 수 있습니다.</p><div class="section-heading"><h2>${esc(MAP_NAMES[state.projection])}</h2><button type="button" class="text-button" data-nav="options">지도 설정 ↗</button></div>${mapMarkup()}<div class="map-help">${state.projection==='equal-earth'&&!state.detailMode?'두 손가락 확대·축소, 드래그 이동 가능. 4배 이상 확대하거나 관찰 위치에서 ‘상세 지도’를 선택하면 도로·지형 지도가 열립니다.':'핀을 선택하거나 두 손가락으로 확대해 상세 지역을 탐색할 수 있습니다.'}</div>${state.projection==='equal-earth'&&!state.detailMode?'<button class="light-button wide" type="button" data-action="open-detail-map">선택한 관찰 지역 상세 지도 ↗</button>':''}<div class="legend"><span><i class="dot"></i>나의 관찰</span><span><i class="dot demo"></i>DEMO · 가상 기록</span></div>${pinSummary()}<div class="info">이퀄 어스의 세계 도법은 유지하지만 상세 도로·산림 지도는 표준 웹 메르카토르(EPSG:3857) 타일로 전환됩니다. 상세 지도의 온라인 지형 데이터는 OpenStreetMap 기반이며, 현장 오프라인 타일 저장 기능은 아직 없습니다.</div></section>`;
}
function homeScreen(){
 const records=samples();return `<section class="page"><div class="home-intro"><span class="eyebrow">PLANT MATTER / RAINFOREST MEMORIES</span><h1>RAINFOREST<br>MEMORIES</h1><p class="lead">식물을 발견한 순간의 자연을 기록합니다.<br>세계의 자생지와 생태를 함께 남기는 식물 관찰 아카이브.</p></div><div class="home-hero"><img src="./assets/staurogyne-reference.jpg" alt="식물 자료 사진"/><span>BOTANICAL FIELD NOTES</span></div><div class="stats"><div class="stat"><strong>${String(state.records.length).padStart(2,'0')}</strong><span>내 기록</span></div><div class="stat"><strong>${String(records.length).padStart(2,'0')}</strong><span>전체 (DEMO 포함)</span></div><div class="stat"><strong>02</strong><span>지도 도법</span></div></div><div class="section-heading"><h2>DISCOVER THE WORLD</h2><button class="text-button" type="button" data-nav="map">MAP ↗</button></div>${mapMarkup()}<div class="section-heading"><h2>RECENT FIELD RECORDS</h2><button class="text-button" type="button" data-nav="explore">MORE ↗</button></div>${records.slice(0,3).map(recordCard).join('')}</section>`;
}
function mountMap(){
 if(state.projection==='equal-earth'&&!state.detailMode){setupEqualInteractions();return;}
 if(typeof window.L==='undefined'){const el=$('#leaflet-map');if(el)el.innerHTML='<div class="map-unavailable">상세 지도 라이브러리를 불러오지 못했습니다.<br>인터넷 연결을 확인해 주세요.</div>';return;}
 const target=$('#leaflet-map');if(!target)return;
 if(state.leaflet){state.leaflet.remove();state.leaflet=null;}
 const focus=state.detailFocus || publicPoint(getRecord(state.selectedMap)||{}) || {latitude:15,longitude:0};
 const isDetail=!!state.detailMode;const zoom=isDetail?12:2;
 const m=window.L.map(target,{zoomControl:true,worldCopyJump:true,attributionControl:true,maxZoom:19}).setView([focus.latitude,focus.longitude],zoom);
 window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(m);
 for(const r of samples()){
  const p=publicPoint(r);if(!p)continue;
  const marker=window.L.circleMarker([p.latitude,p.longitude],{radius:7,color:'#fff',weight:2,fillColor:r.isDemo?'#888':'#222',fillOpacity:1}).addTo(m);
  marker.bindTooltip(`${r.isDemo?'[DEMO] ':''}${esc(r.scientificName||'미동정 식물')}`);
  marker.on('click',()=>{state.selectedMap=r.id;const summary=document.querySelector('#selected-map-card');if(summary)summary.outerHTML=pinSummary().replace('class="selected-record"','id="selected-map-card" class="selected-record"');});
 }
 state.leaflet=m;setTimeout(()=>m.invalidateSize(),50);
}
function changeEqualZoom(multiplier,at){
 if(state.projection!=='equal-earth'||state.detailMode)return;
 const old=state.equalZoom,newZ=Math.min(5,Math.max(1,old*multiplier));
 if(newZ>=4.3){openDetailMap();return;}
 const anchor=at||state.equalCenter;
 state.equalCenter={x:Math.max(0,Math.min(900,anchor.x+(state.equalCenter.x-anchor.x)*old/newZ)),y:Math.max(0,Math.min(450,anchor.y+(state.equalCenter.y-anchor.y)*old/newZ))};
 state.equalZoom=newZ;updateEqualView();
}
function updateEqualView(){const svg=$('#equal-svg');if(!svg)return;let w=900/state.equalZoom,h=450/state.equalZoom;let x=Math.max(-45,Math.min(state.equalCenter.x-w/2,945-w));let y=Math.max(-25,Math.min(state.equalCenter.y-h/2,475-h));svg.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);}
function equalPointToCoords(x,y){
 const A1=1.340264,A2=-.081106,A3=.000893,A4=.003796;
 const yp=(225-y)/153;let a=-Math.PI/2,b=Math.PI/2;
 for(let i=0;i<45;i++){const m=(a+b)/2,t2=m*m,t6=t2*t2*t2,v=A1*m+A2*m*t2+A3*m*t6+A4*m*t6*t2;if(v<yp)a=m;else b=m;}
 const theta=(a+b)/2,t2=theta*theta,t6=t2*t2*t2;
 const latitude=Math.asin(Math.max(-1,Math.min(1,2/Math.sqrt(3)*Math.sin(theta))))*180/Math.PI;
 const lon=((x-450)/153)*3*(A1+3*A2*t2+7*A3*t6+9*A4*t6*t2)/(2*Math.sqrt(3)*Math.max(.0001,Math.cos(theta)))*180/Math.PI;
 return {latitude:Math.max(-85,Math.min(85,latitude)),longitude:Math.max(-180,Math.min(180,lon))};
}
function openDetailMap(selected=false){state.detailMode=true;const r=getRecord(state.selectedMap),point=publicPoint(r||{});
 state.detailFocus=(selected&&point)?point:equalPointToCoords(state.equalCenter.x,state.equalCenter.y);render();}

function setupEqualInteractions(){const svg=$('#equal-svg');if(!svg)return;const active=new Map();let dragStart=null,pinchDistance=0,pinchZoom=1;const pt=e=>{const rect=svg.getBoundingClientRect();return {x:e.clientX,y:e.clientY,w:rect.width,h:rect.height}};
 svg.addEventListener('pointerdown',e=>{if(e.target.closest?.('.map-pin'))return;svg.setPointerCapture(e.pointerId);active.set(e.pointerId,pt(e));if(active.size===1)dragStart={from:pt(e),center:{...state.equalCenter}};if(active.size===2){const [a,b]=[...active.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);pinchZoom=state.equalZoom;}});
 svg.addEventListener('pointermove',e=>{if(!active.has(e.pointerId))return;active.set(e.pointerId,pt(e));if(active.size===1&&dragStart){const p=pt(e),factor=900/(state.equalZoom*Math.max(1,p.w));state.equalCenter={x:dragStart.center.x-(p.x-dragStart.from.x)*factor,y:dragStart.center.y-(p.y-dragStart.from.y)*factor};updateEqualView();}else if(active.size===2&&pinchDistance){const [a,b]=[...active.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);const target=pinchZoom*distance/Math.max(10,pinchDistance);if(target>4.3){openDetailMap();return;}state.equalZoom=Math.max(1,Math.min(4.2,target));updateEqualView();}});
 const end=e=>{active.delete(e.pointerId);dragStart=null;pinchDistance=0;};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
 svg.addEventListener('wheel',e=>{e.preventDefault();changeEqualZoom(e.deltaY<0?1.3:1/1.3);},{passive:false});
}
function libraryResults(){const q=state.search.trim().toLowerCase();const results=samples().filter(r=>(!state.onlyMine||!r.isDemo)&&[r.scientificName,r.family,r.locality,r.country,r.habitat].join(' ').toLowerCase().includes(q));return `<div class="mini-muted" style="margin:13px 0">${results.length} OBSERVATIONS</div>${results.map(recordCard).join('')||'<div class="empty"><strong>검색 결과가 없습니다.</strong>학명이나 지역을 다시 입력해 보세요.</div>'}`;}
function libraryScreen(){return `<section class="page"><div class="eyebrow">FIELD LIBRARY</div><h1>식물 관찰 아카이브</h1><p class="lead">기록된 식물을 학명과 자생 환경으로 검색하세요.</p><label for="search" class="inline-label">OBSERVATION SEARCH</label><input id="search" class="search" autocomplete="off" placeholder="학명 · 국가 · 지역 · 서식지" value="${esc(state.search)}"/><div class="pill-row" style="margin-top:13px"><button type="button" class="pill ${state.onlyMine?'':'active'}" data-filter="all">전체 기록</button><button type="button" class="pill ${state.onlyMine?'active':''}" data-filter="mine">나의 기록</button></div><div id="library-list">${libraryResults()}</div></section>`;}
function fieldInput(name,label,placeholder='',type='text',extra=''){return `<label class="form-field"><span>${label}</span><input name="${name}" type="${type}" placeholder="${esc(placeholder)}" ${extra}/></label>`;}
function fieldSelect(name,label,options){return `<label class="form-field"><span>${label}</span><select name="${name}">${options.map(([val,label],i)=>`<option value="${esc(val)}" ${i===0?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;}
function formScreen(){
 const editing=state.editingId && state.records.find(r=>r.id===state.editingId && !r.isDemo);
 return `<section class="page"><div class="eyebrow">${editing?'EDIT FIELD OBSERVATION':'NEW FIELD OBSERVATION'}</div><h1>${editing?'관찰 기록 수정':'새로운 식물 기록'}</h1><p class="lead">${editing?'이미 등록한 기록의 사진·학명·위치·환경 데이터를 언제든 수정할 수 있습니다. 기존 기록 ID와 동정 의견은 유지됩니다.':'사진과 서식 환경을 기록하세요. 현재 데이터는 서버가 아닌 이 기기에 저장돼요.'}</p><form id="observation-form" autocomplete="off"><div class="form-section"><h2>01 / PHOTOGRAPH</h2><div id="photo-box" class="photo-box"><span class="photo-symbol">✳</span><strong>식물 사진 추가</strong><span>학명을 몰라도 기록할 수 있습니다.</span></div><div class="small-actions" style="margin-top:11px"><button type="button" class="light-button" data-action="gallery">▧ 앨범에서 선택</button><button type="button" class="light-button" data-action="camera">◉ 사진 촬영</button><button type="button" class="light-button" data-action="remove-photo" ${state.photoData?'':'disabled'}>사진 제거</button></div><input id="gallery-input" class="hidden-input" type="file" accept="image/*"/><input id="camera-input" class="hidden-input" type="file" accept="image/*" capture="environment"/></div><div class="form-section"><h2>02 / TAXONOMY</h2>${fieldInput('scientificName','학명 / Scientific name','예: Ficus sp. (미동정 가능)')}${fieldInput('family','과명 / Family','예: Moraceae')}${fieldSelect('identificationStatus','동정 상태',[['unidentified','미동정'],['proposed','동정 제안'],['review','검토 중']])}</div><div class="form-section"><h2>03 / LOCATION</h2><div class="two-col">${fieldInput('country','국가','Malaysia')}${fieldInput('locality','발견 지명','Fraser’s Hill')}</div><button class="light-button wide" type="button" data-action="gps">◎ 현재 GPS 좌표 가져오기</button><div class="two-col" style="margin-top:14px">${fieldInput('latitude','위도 / Latitude','3.710000','number','step="any" min="-90" max="90"')}${fieldInput('longitude','경도 / Longitude','101.740000','number','step="any" min="-180" max="180"')}</div><div class="two-col">${fieldInput('elevation','해발 고도 (m)','1250','number','step="any"')}${fieldInput('gpsAccuracy','GPS 정확도 (m)','12','number','step="any" min="0"')}</div><div class="form-field"><span>위치 공개 수준 (미리보기 지도에 적용)</span><label class="privacy-option"><input type="radio" name="privacy" value="private" checked/><span><b>정확한 위치 비공개 — 권장</b><small>관찰 기록에만 정확한 좌표 저장, 지도 핀 없음</small></span></label><label class="privacy-option"><input type="radio" name="privacy" value="coarse"/><span><b>대략적인 지역</b><small>1° 격자 중심으로 위치 일반화 (민감 서식지에는 주의)</small></span></label><label class="privacy-option"><input type="radio" name="privacy" value="public"/><span><b>정확한 위치 표시</b><small>로컬 지도에 표시. 향후 공유 전 주의 필요</small></span></label></div></div><div class="form-section"><h2>04 / FIELD NOTES</h2>${fieldInput('observedAt','발견 일시','','datetime-local',`value="${localDate()}"`)}${fieldSelect('habit','생육 형태',[['지생','지생'],['착생','착생'],['암생','암생'],['포복','포복'],['덩굴','덩굴'],['관목','관목'],['교목','교목'],['수생','수생'],['기타','기타']])}${fieldSelect('phenology','생육 상태',[['영양생장','영양생장'],['개화','개화'],['결실','결실'],['포자 형성','포자 형성'],['휴면','휴면']])}${fieldInput('habitat','서식지 유형','운무림 / 산지 열대우림')}${fieldInput('substrate','기질 / Substrate','이끼, 암면, 낙엽층 등')}<label class="form-field"><span>현장 메모</span><textarea name="notes" placeholder="잎·줄기·꽃의 특징, 동반 식생, 환경 등"></textarea></label></div><button type="button" class="advanced-toggle" data-action="advanced">＋ 전문 환경 측정 및 표본 기록 펼치기</button><div id="advanced-fields" class="advanced"><div class="form-section"><h2>05 / ENVIRONMENTAL MEASUREMENTS</h2><div class="two-col">${fieldInput('lux','조도 (lx)','850','number','step="any"')}${fieldInput('ppfd','PPFD (µmol/m²/s)','25','number','step="any"')}</div><div class="two-col">${fieldInput('temperature','기온 (°C)','23.5','number','step="any"')}${fieldInput('humidity','상대습도 (%)','88','number','step="any" min="0" max="100"')}</div>${fieldSelect('measurementSource','측정 근거',[['not-recorded','미기록'],['instrument','계측 장비를 사용한 실측'],['estimated','추정값 또는 외부 자료'],['unspecified','출처 미지정']])}${fieldInput('measurementDevice','측정 장비','조도계 모델 / 측정 높이')}${fieldInput('measuredAt','측정 시각','','datetime-local')}</div><div class="form-section"><h2>06 / COLLECTION & RESEARCH</h2>${fieldInput('fieldNumber','필드 번호 / Field number','PMF-001')}${fieldInput('collector','관찰자 / Observer','')}${fieldInput('population','개체군 / Abundance','작은 군락 형태')}${fieldInput('associatedSpecies','동반 식생 / Associated species','')}${fieldInput('voucher','표본·바우처 / Voucher','표본 미채집 / 기관·번호')}</div></div><div class="info warning" style="margin:18px 0">야생 희귀식물의 정확한 GPS는 공유하지 마세요. 사진은 저장하기 전에 크기를 줄이고 EXIF 메타데이터를 제거합니다.</div><button class="primary-button wide" type="submit" id="save-button">${editing?'변경 사항 저장하기':'관찰 기록 저장하기'}</button>${editing?'<button class="light-button wide cancel-edit" type="button" data-action="cancel-edit">수정 취소</button>':''}<p class="footnote" style="text-align:center">현재는 내 아이폰의 브라우저 저장소에만 보관됩니다. 정기적으로 JSON 백업을 만들어 주세요.</p></form></section>`;
}
function fieldScreen(){const mine=state.records.length,countries=new Set(state.records.map(r=>r.country).filter(Boolean)).size;return `<section class="page"><div class="eyebrow">MY FIELD NOTEBOOK</div><h1>PROFILE</h1><p class="lead">${esc(state.profile?.display_name || state.user?.user_metadata?.display_name || '나의 식물 기록')} · 개인 탐사 아카이브</p><div class="stats"><div class="stat"><strong>${mine}</strong><span>관찰 기록</span></div><div class="stat"><strong>${countries}</strong><span>국가</span></div><div class="stat"><strong>${state.records.filter(r=>r.suggestions?.length).length}</strong><span>개인 동정 메모</span></div></div><div class="section-heading"><h2>DATA BACKUP</h2><span>LOCAL DEVICE ONLY</span></div><div class="profile-actions"><button type="button" class="light-button" data-action="export">JSON 내보내기</button><button type="button" class="light-button" data-action="import">JSON 가져오기</button></div><input type="file" class="hidden-input" accept="application/json,.json" id="import-input"/><div class="info">관찰 데이터는 BETA 02와 동일한 기기 IndexedDB에 저장됩니다. 로그인하더라도 다른 기기에 자동 동기화되지 않습니다. 정확한 GPS가 포함될 수 있는 JSON 백업을 안전하게 보관하세요.</div><div class="section-heading"><h2>MY OBSERVATIONS</h2></div>${state.records.map(recordCard).join('')||'<div class="empty">아직 관찰 기록이 없습니다.</div>'}</section>`;}
function mapSettingCard(){return `<div class="option-section"><h2>MAP PROJECTION</h2><p class="setting-description">세계 지도를 표시할 도법을 선택하세요. 선택은 이 기기에 저장됩니다.</p><label class="option-radio"><input type="radio" name="projection" value="mercator" ${state.projection==='mercator'?'checked':''}/><span><b>메르카토르 도법</b><small>Mercator · EPSG:3857 기반 상세 지도</small></span></label><label class="option-radio"><input type="radio" name="projection" value="equal-earth" ${state.projection==='equal-earth'?'checked':''}/><span><b>이퀄 어스 도법</b><small>Equal Earth · EPSG:8857 세계 지도, 깊은 확대 시 상세 지도로 전환</small></span></label><div class="info">두 선택 모두 확대·축소가 가능합니다. 이퀄 어스는 세계·광역 화면에 적용하고 세부 도로·산림 자료는 웹 메르카토르 타일로 표시합니다.</div></div>`;}
function accountEditor(){
 const email=state.user?.email||'';const profile=state.profile||{};
 return `<div class="option-section"><h2>ACCOUNT MANAGEMENT</h2><p class="setting-description">로그인 계정: ${esc(email)}</p><form id="profile-form"><label class="form-field"><span>표시 이름</span><input name="displayName" maxlength="50" required value="${esc(profile.display_name||state.user?.user_metadata?.display_name||'')}" placeholder="앱에 공개할 이름"/></label><label class="option-radio"><input type="checkbox" name="emailVisible" ${profile.email_visible?'checked':''}/><span><b>이메일 주소 공개</b><small>기본값은 비공개. 다른 사용자에게 이메일 공개를 허용합니다.</small></span></label><button class="primary-button wide" type="submit">계정 설정 저장</button></form><div class="settings-actions"><button class="light-button wide" type="button" data-action="signout">로그아웃</button><button class="danger-button wide" type="button" data-action="delete-account">회원 탈퇴</button></div><div class="info warning">회원 탈퇴는 실제 서버 삭제 함수가 배포되어야 작동하며, 현재 기기에만 저장된 관찰 기록은 별도로 백업하거나 삭제해야 합니다.</div></div>`;
}
function authPanel(){
 if(!state.authClient)return `<div class="option-section"><h2>GOOGLE / EMAIL ACCOUNT</h2><div class="info warning"><strong>인증 서버 연결 전</strong><br>현재 빌드에는 Supabase 프로젝트 주소와 공개키가 설정되지 않았습니다. 실제 회원가입·로그인·탈퇴는 아직 사용할 수 없습니다. OPTIONS의 설정 화면과 개인 기록 기능은 테스트할 수 있습니다.</div><p class="footnote">Supabase 프로젝트 생성 후 config.js에 URL과 공개키를 넣고 SQL 정책을 적용하면 기능을 활성화할 수 있습니다. 비밀 키는 GitHub에 올리지 마세요.</p></div>`;
 if(state.user)return accountEditor();
 const signup=state.authMode==='signup';
 return `<div class="option-section"><h2>${signup?'CREATE ACCOUNT':'SIGN IN'}</h2><button type="button" class="google-button" data-action="google-login">Google 계정으로 계속하기</button><p class="divider-label">또는 이메일</p><form id="auth-form"><label class="form-field"><span>이메일</span><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"/></label>${signup?'<label class="form-field"><span>표시 이름</span><input name="displayName" maxlength="50" required placeholder="기록에 사용할 이름"/></label>':''}<label class="form-field"><span>비밀번호</span><input name="password" type="password" minlength="8" required autocomplete="${signup?'new-password':'current-password'}" placeholder="8자 이상"/></label>${signup?'<label class="option-radio"><input type="checkbox" name="emailVisible"/><span><b>이메일을 다른 사용자에게 공개</b><small>기본적으로 비공개로 설정됩니다.</small></span></label>':''}<button class="primary-button wide" type="submit">${signup?'이메일로 가입하기':'이메일로 로그인'}</button></form><div class="auth-switch"><button type="button" class="text-button" data-action="auth-toggle">${signup?'이미 계정이 있어요 · 로그인':'새 계정 만들기'}</button><button type="button" class="text-button" data-action="reset-password">비밀번호 찾기</button></div><p class="footnote">가입 시 이메일 확인 링크를 보내도록 Supabase 설정을 권장합니다. 로그인 후에도 기존 기기 기록은 자동 클라우드 공유되지 않습니다.</p></div>`;
}
function optionsScreen(){return `<section class="page"><div class="eyebrow">PREFERENCES & ACCOUNT</div><h1>OPTIONS</h1><p class="lead">계정과 지도 표기를 관리할 수 있습니다.</p>${mapSettingCard()}${authPanel()}<div class="option-section"><h2>APPLICATION</h2><p class="setting-description">PLANT MATTER RAINFOREST MEMORIES<br>BETA 03 · Pretendard Regular 400</p><p class="footnote">Google/이메일 인증 및 데이터 공유는 별도의 Supabase 설정이 필요합니다. 원본 기록과 GPS 보안에 유의해 주세요.</p></div></section>`;}
function render(){
 if(state.leaflet){state.leaflet.remove();state.leaflet=null;}
 const screens={home:homeScreen,map:mapScreen,record:formScreen,explore:libraryScreen,profile:fieldScreen,options:optionsScreen};
 content.innerHTML=(screens[state.tab]||homeScreen)();
 document.querySelectorAll('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.nav===state.tab));
 if(state.tab==='map'||state.tab==='home'){
  if(state.tab==='map'){$('#content').querySelector('.selected-record')?.setAttribute('id','selected-map-card');}
  mountMap();
 }
 if(state.tab==='record' && state.editingId)populateEditForm();
 window.scrollTo({top:0,behavior:'instant'});
}
function nav(tab){if(!['home','map','record','explore','profile','options'].includes(tab))return;if(state.editingId && state.tab==='record'&&!confirm('수정 중인 내용이 저장되지 않습니다. 화면을 이동할까요?'))return;state.editingId=null;state.tab=tab;state.photoData=null;state.search='';state.onlyMine=false;closeDetail();render();}
// Convert ISO times to the device-local format expected by datetime-local.
function toDateTimeLocal(value){
 if(!value)return '';
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function populateEditForm(){
 const r=state.records.find(x=>x.id===state.editingId && !x.isDemo), form=$('#observation-form');
 if(!r||!form)return;
 for(const field of Array.from(form.elements)){
  if(!field.name||field.type==='file'||field.name==='privacy')continue;
  if(!Object.prototype.hasOwnProperty.call(r,field.name))continue;
  const value=(field.name==='observedAt'||field.name==='measuredAt')?toDateTimeLocal(r[field.name]):r[field.name];
  if(value!==null && value!==undefined)field.value=String(value);
 }
 const privacy=form.querySelector(`input[name="privacy"][value="${['private','coarse','public'].includes(r.privacy)?r.privacy:'private'}"]`);
 if(privacy)privacy.checked=true;
 if(state.photoData && isSafePhoto(state.photoData)){
  const area=$('#photo-box');area.innerHTML=`<img alt="기존 관찰 식물 사진" src="${state.photoData}"/>`;
 }
 const advancedFields=['lux','ppfd','temperature','humidity','measurementDevice','measuredAt','fieldNumber','collector','population','associatedSpecies','voucher'];
 if(advancedFields.some(k=>r[k]!==null&&r[k]!==undefined&&r[k]!=='')){
  $('#advanced-fields')?.classList.add('open');
  const toggle=$('[data-action="advanced"]');if(toggle)toggle.textContent='− 전문 항목 접기';
 }
}
function editRecord(id){
 const r=state.records.find(x=>x.id===id&&!x.isDemo);
 if(!r)return toast('본인이 작성한 관찰 기록만 수정할 수 있습니다.');
 closeDetail();state.editingId=id;state.photoData=isSafePhoto(r.photoData)?r.photoData:null;state.tab='record';render();
}
function cancelEdit(){state.editingId=null;state.photoData=null;state.tab='profile';render();}
function recordRow(label,value){return `<div class="detail-row"><span>${label}</span><strong>${show(value)}</strong></div>`;}
function metric(label,value,unit){return `<div class="metric"><small>${label}</small><strong>${value===null||value===undefined||value===''?'미기록':`${esc(value)} ${unit}`}</strong></div>`;}
function detail(id){const r=getRecord(id);if(!r)return;const p=publicPoint(r);overlay.innerHTML=`<div class="detail-body"><div class="detail-header"><span class="eyebrow">FIELD RECORD / ${esc(r.id)}</span><button type="button" class="close" data-action="close">✕ 닫기</button></div><div class="detail-picture">${artwork(r)}</div>${r.isDemo?'<span class="tiny-tag">DEMO · 가상 관찰 데이터</span>':''}<h1>${esc(r.scientificName||'미동정 식물')}</h1><p class="lead">${esc(r.family||'과명 미기록')} · ${esc(STATUS[r.identificationStatus]||'미동정')}</p><div class="detail-section"><h2>OBSERVATION</h2>${recordRow('관찰 날짜',fmt(r.observedAt))}${r.updatedAt?recordRow('마지막 수정',new Date(r.updatedAt).toLocaleString('ko-KR')):''}${recordRow('국가 / 지역',[r.country,r.locality].filter(Boolean).join(' / '))}${recordRow('해발 고도',r.elevation==null?'미기록':`${r.elevation} m`)}${recordRow('GPS 정확도',r.gpsAccuracy==null?'미기록':`${r.gpsAccuracy} m`)}${recordRow('위치 공개',({private:'비공개',coarse:'대략적 위치',public:'정확한 위치'})[r.privacy]||'미기록')}${recordRow('지도 표시 좌표',p?`${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`:'비공개')}${recordRow('생육 형태',r.habit)}${recordRow('서식지',r.habitat)}${recordRow('기질',r.substrate)}${recordRow('생육 상태',r.phenology)}</div><div class="detail-section"><h2>ENVIRONMENTAL DATA</h2><div class="metrics">${metric('ILLUMINANCE',r.lux,'lx')}${metric('PPFD',r.ppfd,'µmol/m²/s')}${metric('TEMPERATURE',r.temperature,'°C')}${metric('HUMIDITY',r.humidity,'%RH')}</div>${recordRow('측정 근거',({instrument:'기기로 실측',estimated:'추정·외부 자료',sample:'가상 예시',unspecified:'미지정','not-recorded':'미측정'})[r.measurementSource]||'미기록')}${recordRow('측정 장비',r.measurementDevice)}${recordRow('측정 시각',r.measuredAt)}</div><div class="detail-section"><h2>FIELD NOTES</h2><p class="long-text">${esc(r.notes||'현장 메모가 없습니다.')}</p>${recordRow('필드 번호',r.fieldNumber)}${recordRow('관찰자',r.collector)}${recordRow('개체군',r.population)}${recordRow('동반 식생',r.associatedSpecies)}${recordRow('표본',r.voucher)}${r.editHistory?.length?recordRow('수정 이력',`${r.editHistory.length}회 수정됨`):''}</div><div class="detail-section"><h2>IDENTIFICATION HISTORY</h2>${(r.suggestions||[]).map(s=>recordRow(s.name,`${s.author||'내 기기'} · ${fmt(s.at)}`)).join('')||'<p class="mini-muted">동정 제안 이력이 없습니다.</p>'}${!r.isDemo?`<form id="suggest-form"><label class="form-field"><span>개인 동정 의견 (다른 사용자에게 공유되지 않음)</span><input name="name" maxlength="120" placeholder="예: Ficus punctata" required/></label><input type="hidden" name="recordId" value="${esc(r.id)}"/><button type="submit" class="light-button wide">동정 의견 추가</button></form>`:''}</div>${!r.isDemo?`<button type="button" class="primary-button wide" data-edit="${esc(r.id)}">이 관찰 기록 수정하기</button><button type="button" class="light-button wide detail-delete" data-delete="${esc(r.id)}">이 관찰 기록 삭제</button>`:''}<p class="footnote" style="margin-top:20px">${r.isDemo?'이 기록은 실제 식물 분포나 환경 측정값이 아닙니다.':'정확한 좌표는 현재 기기 저장소에 있습니다. JSON 백업 시 포함될 수 있습니다.'}</p></div>`;overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;}
function closeDetail(){overlay.classList.add('hidden');overlay.setAttribute('aria-hidden','true');}
async function compressPhoto(file){if(!file||!file.type.startsWith('image/'))throw Error('이미지 파일만 선택할 수 있습니다.');if(file.size>25*1024*1024)throw Error('25MB 이하 사진을 사용해 주세요.');const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));reader.readAsDataURL(file);});const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('사진을 불러오지 못했습니다.'));img.src=source;});const max=1400, scale=Math.min(1,max/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.77);}
async function choosePhoto(file){if(!file)return;try{state.photoData=await compressPhoto(file);$('#photo-box').innerHTML=`<img alt="선택한 식물 사진 미리보기" src="${state.photoData}"/>`;const rm=$('[data-action="remove-photo"]');if(rm)rm.disabled=false;toast('사진을 첨부했어요. EXIF 메타데이터는 저장되지 않습니다.');}catch(e){toast(e.message||'사진을 처리할 수 없습니다.');}}
function useGPS(){if(!navigator.geolocation){toast('이 브라우저에서는 GPS를 사용할 수 없습니다.');return;}toast('GPS 위치 권한을 확인하고 있습니다…');navigator.geolocation.getCurrentPosition(({coords})=>{const form=$('#observation-form');if(!form)return;form.elements.latitude.value=coords.latitude.toFixed(6);form.elements.longitude.value=coords.longitude.toFixed(6);form.elements.gpsAccuracy.value=coords.accuracy==null?'':Math.round(coords.accuracy);if(coords.altitude!==null)form.elements.elevation.value=Math.round(coords.altitude);toast('위치정보를 기록했어요. 공개 범위를 확인해 주세요.');},err=>toast('GPS를 사용할 수 없습니다. HTTPS 연결·위치 권한을 확인해 주세요.'),{enableHighAccuracy:true,timeout:16000,maximumAge:2000});}
async function saveForm(form){const data=new FormData(form), get=k=>txt(data.get(k)),lat=get('latitude'),lon=get('longitude');if(!get('scientificName')&&!state.photoData){toast('식물 사진이나 학명 중 하나는 필수예요.');return;}
 if((lat!==''||lon!=='')&&(lat===''||lon===''||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Number(lat)<-90||Number(lat)>90||Number(lon)<-180||Number(lon)>180)){toast('위도와 경도를 올바르게 입력해 주세요.');return;}
 const numericKeys=['elevation','gpsAccuracy','lux','ppfd','temperature','humidity'];const d=Object.fromEntries(data.entries());for(const key of numericKeys){if(d[key]!==undefined&&d[key]!==''&&!Number.isFinite(Number(d[key]))){toast(`${key} 값을 확인해 주세요.`);return;}}
 const previous=state.editingId?state.records.find(x=>x.id===state.editingId&&!x.isDemo):null;
 if(state.editingId&&!previous){toast('수정할 원본 기록을 찾을 수 없습니다.');return;}
 const now=new Date().toISOString();
 const record={...previous,...d,id:previous?.id||`PMF-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,isDemo:false,scientificName:get('scientificName')||'미동정 식물',latitude:numberOrNull(lat),longitude:numberOrNull(lon),gpsAccuracy:numberOrNull(get('gpsAccuracy')),elevation:numberOrNull(get('elevation')),observedAt:get('observedAt')?new Date(get('observedAt')).toISOString():new Date().toISOString(),createdAt:previous?.createdAt||now,updatedAt:previous?now:null,photoData:state.photoData,identificationStatus:get('identificationStatus')||'unidentified',measurementSource:get('measurementSource')||'not-recorded',suggestions:previous?.suggestions||[]};
 if(['lux','ppfd','temperature','humidity'].some(k=>get(k)!=='')&&record.measurementSource==='not-recorded')record.measurementSource='unspecified';
 if(previous){
  const changedFields=Object.keys(record).filter(k=>!['id','isDemo','createdAt','updatedAt','editHistory','suggestions'].includes(k)&&JSON.stringify(previous[k]??null)!==JSON.stringify(record[k]??null));
  record.editHistory=[...(previous.editHistory||[]),{at:now,changedFields}];
 }
 const btn=$('#save-button');btn.disabled=true;btn.textContent='저장 중…';
 try{await storeRecord(record);state.editingId=null;state.photoData=null;state.tab='profile';render();detail(record.id);toast(previous?'관찰 기록의 수정 사항을 저장했어요.':'새 관찰 기록을 이 기기에 저장했어요.');}
 catch(e){btn.disabled=false;btn.textContent=previous?'변경 사항 저장하기':'관찰 기록 저장하기';toast(`저장 실패: ${e.message||e}`);}}
async function addSuggestion(form){const id=form.elements.recordId.value,name=txt(form.elements.name.value),r=getRecord(id);if(!r||r.isDemo||!name)return;const updated={...r,identificationStatus:'proposed',suggestions:[...(r.suggestions||[]),{name,author:'내 기기',at:new Date().toISOString()}]};try{await storeRecord(updated);detail(id);toast('개인 동정 의견을 저장했어요.');}catch(e){toast('동정 의견 저장에 실패했습니다.');}}
function download(name,text){const blob=new Blob([text],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),45000);}
function exportRecords(){if(!state.records.length){toast('백업할 내 기록이 없습니다.');return;}if(!confirm('JSON 파일에는 비공개 GPS 원본 좌표와 사진이 포함될 수 있습니다. 신뢰할 수 있는 장소에만 보관할까요?'))return;download(`plant-matter-field-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({app:'PLANT MATTER FIELD',schemaVersion:1,exportedAt:new Date().toISOString(),observations:state.records},null,2));toast('백업 파일 다운로드를 요청했어요. 파일 앱에서 확인하세요.');}
async function importRecords(file){if(!file)return;try{if(file.size>40*1024*1024)throw Error('40MB 이하 파일을 사용해 주세요.');const payload=JSON.parse(await file.text());if(payload.app!=='PLANT MATTER FIELD'||!Array.isArray(payload.observations))throw Error('PLANT MATTER FIELD 백업 파일이 아닙니다.');const items=payload.observations.filter(r=>r&&typeof r.id==='string'&&r.id.startsWith('PMF-')&&!r.isDemo&&typeof r.scientificName==='string').slice(0,500);if(!items.length)throw Error('가져올 유효한 기록이 없습니다.');if(!confirm(`${items.length}개의 기록을 현재 기기로 가져옵니다. 같은 ID의 기록은 덮어씁니다. 계속할까요?`))return;for(const r of items){const safe={...r};if(!isSafePhoto(safe.photoData))safe.photoData=null;safe.suggestions=Array.isArray(safe.suggestions)?safe.suggestions:[];await dbAction('readwrite',s=>s.put(safe));}await reload();render();toast(`${items.length}개의 기록을 가져왔어요.`);}catch(e){toast(`가져오기 실패: ${e.message||e}`);}}
async function initAuth(){
 const cfg=window.PM_CONFIG||{};
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient){return;}
 try{
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  state.authClient=client;const {data:{session}}=await client.auth.getSession();state.user=session?.user||null;
  if(state.user)await readProfile();
  client.auth.onAuthStateChange((_evt,session)=>{
   const before=state.user?.id;state.user=session?.user||null;
   setTimeout(async()=>{if(state.user?.id!==before)await readProfile();if(state.tab==='options'||state.tab==='profile')render();},0);
  });
 }catch(e){console.warn('Auth unavailable',e);}
}
async function readProfile(){
 if(!state.authClient||!state.user){state.profile=null;return;}
 const {data,error}=await state.authClient.from('profiles').select('id,display_name,email_visible,public_email').eq('id',state.user.id).maybeSingle();
 if(error){console.warn('Profile fetch',error);state.profile=null;return;}state.profile=data;
}
async function signInGoogle(){
 if(!state.authClient)return toast('인증 서버가 연결되지 않았습니다.');
 const {error}=await state.authClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
 if(error)toast(`Google 로그인 실패: ${error.message}`);
}
async function submitAuth(form){
 if(!state.authClient)return toast('인증 서버 연결이 필요합니다.');
 const btn=form.querySelector('button[type=submit]');btn.disabled=true;
 try{
  const email=form.elements.email.value.trim(),password=form.elements.password.value;
  if(state.authMode==='signup'){
   const name=form.elements.displayName.value.trim(),visible=form.elements.emailVisible.checked;
   const {data,error}=await state.authClient.auth.signUp({email,password,options:{data:{display_name:name,email_visible:visible},emailRedirectTo:location.origin+location.pathname}});
   if(error)throw error;
   if(data.session){state.user=data.user;await readProfile();toast('계정이 생성되었습니다.');}else toast('가입 확인 이메일을 확인해 주세요.');
  }else{
   const {error}=await state.authClient.auth.signInWithPassword({email,password});if(error)throw error;
   await readProfile();toast('로그인했습니다.');
  }
  render();
 }catch(e){toast(`인증 오류: ${e.message||e}`);}finally{btn.disabled=false;}
}
async function submitProfile(form){
 if(!state.authClient||!state.user)return toast('로그인해 주세요.');
 const display_name=form.elements.displayName.value.trim(),email_visible=form.elements.emailVisible.checked;
 if(!display_name)return toast('표시 이름을 입력해 주세요.');
 const public_email=email_visible?state.user.email:null;
 const {error}=await state.authClient.from('profiles').upsert({id:state.user.id,display_name,email_visible,public_email},{onConflict:'id'});
 if(error)toast(`저장 실패: ${error.message}`);else{await readProfile();toast('계정 설정이 저장됐습니다.');render();}
}
async function resetPassword(){
 if(!state.authClient)return toast('인증 서버 연결이 필요합니다.');
 const email=prompt('비밀번호 재설정 이메일 주소를 입력하세요.');if(!email)return;
 const {error}=await state.authClient.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});
 toast(error?`재설정 실패: ${error.message}`:'비밀번호 재설정 이메일을 요청했습니다.');
}
async function signOut(){if(!state.authClient)return;const {error}=await state.authClient.auth.signOut();if(error)return toast(error.message);state.user=null;state.profile=null;render();toast('로그아웃했습니다.');}
async function deleteAccount(){
 if(!state.authClient||!state.user)return;
 if(!confirm('계정을 삭제하면 복구할 수 없습니다. 서버에 저장된 계정 정보가 삭제됩니다. 계속할까요?'))return;
 if(prompt('회원 탈퇴를 확인하려면 DELETE를 입력하세요.')!=='DELETE')return;
 const cfg=window.PM_CONFIG;
 const {data,error}=await state.authClient.functions.invoke(cfg.accountDeletionFunction||'delete-account',{method:'POST',body:{confirm:'DELETE'}});
 if(error||!data?.deleted)return toast('계정 삭제 함수를 사용할 수 없습니다. 관리자 서버 설정을 확인해 주세요.');
 await state.authClient.auth.signOut();state.user=null;state.profile=null;render();toast('계정 삭제가 완료됐습니다. 기기에 저장된 관찰 기록은 유지됩니다.');
}
// Event delegation keeps the static app dependency-free and compatible with GitHub Pages.
document.addEventListener('click',async event=>{
 const navBtn=event.target.closest('[data-nav]');if(navBtn){nav(navBtn.dataset.nav);return;}
 const pin=event.target.closest('[data-map-id]');if(pin){state.selectedMap=pin.dataset.mapId;const card=$('#selected-map-card');if(card)card.outerHTML=pinSummary().replace('class="selected-record"','id="selected-map-card" class="selected-record"');return;}
 const rec=event.target.closest('[data-detail]');if(rec){detail(rec.dataset.detail);return;}
 const edit=event.target.closest('[data-edit]');if(edit){editRecord(edit.dataset.edit);return;}
 const filter=event.target.closest('[data-filter]');if(filter){state.onlyMine=filter.dataset.filter==='mine';render();return;}
 const del=event.target.closest('[data-delete]');if(del){if(confirm('이 기록을 기기에서 완전히 삭제할까요? 복구할 수 없습니다.'))try{await deleteRecord(del.dataset.delete);closeDetail();render();toast('기록이 삭제되었습니다.')}catch(e){toast('삭제에 실패했습니다.')}return;}
 const action=event.target.closest('[data-action]');if(!action)return;
 switch(action.dataset.action){
  case 'close':closeDetail();break;
  case 'camera':$('#camera-input')?.click();break;
  case 'gallery':$('#gallery-input')?.click();break;
  case 'remove-photo':state.photoData=null;$('#photo-box').innerHTML='<span class="photo-symbol">✳</span><strong>사진 없음</strong><span>사진을 다시 추가할 수 있습니다.</span>';action.disabled=true;break;
  case 'cancel-edit':cancelEdit();break;
  case 'gps':useGPS();break;
  case 'advanced':$('#advanced-fields')?.classList.toggle('open');action.textContent=$('#advanced-fields').classList.contains('open')?'− 전문 항목 접기':'＋ 전문 환경 측정 및 표본 기록 펼치기';break;
  case 'export':exportRecords();break;
  case 'import':$('#import-input')?.click();break;
  case 'zoom-in':changeEqualZoom(1.5);break;
  case 'zoom-out':changeEqualZoom(1/1.5);break;
  case 'open-detail-map':openDetailMap(true);break;
  case 'equal-back':state.detailMode=false;render();break;
  case 'google-login':await signInGoogle();break;
  case 'auth-toggle':state.authMode=state.authMode==='signin'?'signup':'signin';render();break;
  case 'reset-password':await resetPassword();break;
  case 'signout':await signOut();break;
  case 'delete-account':await deleteAccount();break;
 }
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDetail();if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-map-id]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
document.addEventListener('input',event=>{if(event.target.id==='search'){state.search=event.target.value;const list=$('#library-list');if(list)list.innerHTML=libraryResults();}});
document.addEventListener('change',event=>{if(event.target.name==='projection'){
  state.projection=event.target.value==='mercator'?'mercator':'equal-earth';localStorage.setItem('pm-map-projection',state.projection);
  state.detailMode=false;state.equalZoom=1;state.equalCenter={x:450,y:225};render();toast(`${MAP_NAMES[state.projection]}로 변경했습니다.`);return;}
if(event.target.id==='gallery-input'||event.target.id==='camera-input'){choosePhoto(event.target.files?.[0]);event.target.value='';}if(event.target.id==='import-input'){importRecords(event.target.files?.[0]);event.target.value='';}});
document.addEventListener('submit',event=>{if(event.target.id==='observation-form'){event.preventDefault();saveForm(event.target);}if(event.target.id==='suggest-form'){event.preventDefault();addSuggestion(event.target);}if(event.target.id==='auth-form'){event.preventDefault();submitAuth(event.target);}if(event.target.id==='profile-form'){event.preventDefault();submitProfile(event.target);}});
(async function init(){
 try{state.db=await openDatabase();await reload();}catch(e){console.error('IndexedDB unavailable',e);toast('기기 저장소를 열 수 없습니다. 사생활 보호 모드 또는 브라우저 설정을 확인하세요.');}
 try{const res=await fetch('./assets/landPath.json');if(!res.ok)throw Error('지도 경계 파일 없음');state.landPath=await res.json();}catch(e){console.error('Map boundary unavailable',e);}
 await initAuth();
 render();
 if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('ServiceWorker registration failed',e));}
})();

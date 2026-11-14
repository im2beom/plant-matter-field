/** PLANT MATTER RAINFOREST MEMORIES — BETA 04. Local-first field research and optional invitation-only online beta. */
const DB_NAME = 'plant-matter-field';
const STORE = 'observations';
const VERSION = 2;
const state = { tab:'home', records:[], sharedRecords:[], projects:[], draft:null, draftTimer:null, fullMap:false, member:false, onlineBusy:false, onlineError:'', realtimeChannel:null, mapPhotoList:[], activeExpeditionId:null, routeMap:null, routeTrackingId:null, routeTrackingProject:null, selectedMap:null, search:'', onlyMine:false, photoData:null, landPath:'', db:null,
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
const samples=()=>[...state.records.filter(r=>r.syncPending || !state.sharedRecords.some(shared=>shared.id===r.id)),...state.sharedRecords,...DEMO];
const getRecord=id=>samples().find(o=>o.id===id);
const canEdit=r=>r&&!r.isDemo&&(state.records.some(x=>x.id===r.id)||(r.isCloud&&r.ownerId===state.user?.id));
const isRemotePhoto=s=>typeof s==='string'&&s.startsWith('https://')&&state.authClient&&s.startsWith(new URL(window.PM_CONFIG.supabaseUrl).origin+'/storage/v1/object/sign/');
const photoSource=r=>isSafePhoto(r?.photoData)?r.photoData:(r?.photoUrl&&isRemotePhoto(r.photoUrl)?r.photoUrl:null);
const photoMarkup=r=>photoSource(r)?`<img src="${esc(photoSource(r))}" alt="관찰 식물 사진"/>`:botanicalSvg;

const toast=(message)=>{const el=$('#toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.add('hidden'),4400)};
function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{for(const name of [STORE,'expeditions','drafts'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
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
function artwork(r){return `<div class="botanical" ${photoSource(r)?`data-action="photo-view" data-photo-id="${esc(r.id)}" role="button" aria-label="사진 확대"`:''}>${photoMarkup(r)}</div>`;}
function recordCard(r){return `<button class="record-card" data-detail="${esc(r.id)}">${artwork(r)}<span class="record-info"><span class="record-status">${r.isDemo?'<span class="tiny-tag">DEMO</span> ':r.isCloud?'<span class="tiny-tag">ONLINE</span> ':''}${esc(STATUS[r.identificationStatus]||'미동정')}</span><em>${esc(r.scientificName||'미동정 식물')}</em><p>${esc([r.locality,r.country].filter(Boolean).join(' · ')||'위치 미입력')}</p><small>${fmt(r.observedAt)} · ${esc(r.habit||'미기록')}</small></span><span class="record-arrow">›</span></button>`;}
function mapMarkup(){
 if(state.projection==='mercator' || state.detailMode) {
  const showingDetail=state.projection==='equal-earth';
  return `<div class="map-frame tiled-map"><div id="leaflet-map" class="leaflet-map" aria-label="확대 축소 가능한 상세 지도"></div><div class="map-badge">${showingDetail?'EQUAL EARTH → WEB MERCATOR DETAIL':'WEB MERCATOR / EPSG:3857'}</div>${showingDetail?'<button class="map-back" type="button" data-action="equal-back">← 세계 지도로 돌아가기</button>':''}</div>`;
 }
 const cx=state.equalCenter.x,cy=state.equalCenter.y,z=state.equalZoom,w=900/z,h=450/z;
 const left=Math.max(-45,Math.min(cx-w/2,945-w)),top=Math.max(-25,Math.min(cy-h/2,475-h));
 const markers=mapRecords().map(r=>{const point=publicPoint(r);if(!point)return '';const {x,y}=project(point.latitude,point.longitude),active=r.id===state.selectedMap;return `<g class="map-pin" data-map-id="${esc(r.id)}" role="button" tabindex="0" aria-label="${esc(r.scientificName||'미동정 식물')} 관찰 기록"><circle cx="${x}" cy="${y}" r="${active?12:8}" fill="${r.isDemo?'#8f8f8f':'#202020'}" stroke="#fff" stroke-width="3"/><circle cx="${x}" cy="${y}" r="18" fill="transparent"/></g>`;}).join('');
 return `<div class="map-frame equal-map"><svg id="equal-svg" viewBox="${left} ${top} ${w} ${h}" role="img" aria-label="확대 축소 및 이동 가능한 이퀄 어스 세계 지도" xmlns="http://www.w3.org/2000/svg"><rect x="-600" y="-450" width="2100" height="1500" fill="#f7f7f7"/>${gridPaths.map(d=>`<path d="${d}" stroke="#dddddd" stroke-width="1" fill="none"/>`).join('')}<path d="${state.landPath}" fill="#cdcdcd" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>${markers}</svg><div class="map-badge">EQUAL EARTH / EPSG:8857</div><div class="map-zoom"><button type="button" data-action="zoom-in" aria-label="지도 확대">＋</button><button type="button" data-action="zoom-out" aria-label="지도 축소">－</button></div></div>`;
}
function pinSummary(){
 const records=mapRecords();let selected=records.find(r=>r.id===state.selectedMap);
 if(!selected||!publicPoint(selected))return '<p class="mini-muted">지도에서 식물 스팟을 선택하면 간략한 정보를 볼 수 있습니다.</p>';
 return `<div class="spot-card"><div class="spot-card-top"><span>OBSERVATION PREVIEW ${selected.isDemo?'· DEMO':''}</span><button type="button" data-action="close-pin" aria-label="팝업 닫기">✕</button></div><div class="spot-row">${artwork(selected)}<div><em>${esc(selected.scientificName||'미동정 식물')}</em><div class="mini-muted">${esc(selected.family||'과명 미상')}</div><p>${esc([selected.locality,selected.country].filter(Boolean).join(' · ')||'위치 비공개')}</p><small>${selected.elevation==null?'고도 미기록':esc(selected.elevation)+' m'} · ${esc(STATUS[selected.identificationStatus]||'미동정')}</small></div></div><button type="button" class="light-button wide" data-detail="${esc(selected.id)}">관찰 기록 자세히 보기 →</button></div>`;
}

function mapRecords(){
 const q=state.search.trim().toLocaleLowerCase();return samples().filter(r=>!state.onlyMine||canEdit(r)).filter(r=>[r.scientificName,r.family,r.country,r.locality,r.habitat].join(' ').toLocaleLowerCase().includes(q));
}
function mapSearchUi(){return `<div class="map-search-row"><input class="search" id="search" placeholder="학명 · 국가 · 지역 검색" value="${esc(state.search)}" aria-label="식물 검색"/><button class="light-button" type="button" data-action="map-filter-mine">${state.onlyMine?'내 기록 ✓':'내 기록만'}</button></div>`}
function mapScreen(){
 if(state.fullMap)return `<section class="fullscreen-map-page"><div class="fullscreen-toolbar"><button class="light-button" type="button" data-action="collapse-map">← 닫기</button><span>${esc(MAP_NAMES[state.projection])}</span><button class="light-button" type="button" data-nav="options">설정</button></div>${mapSearchUi()}<div class="fullscreen-map-content">${mapMarkup()}</div><div id="map-pin-popup" class="map-pin-popup hidden">${pinSummary()}</div></section>`;
 return `<section class="page"><div class="eyebrow">GLOBAL BOTANICAL OBSERVATIONS</div><h1>FIELD MAP</h1><p class="lead">학명과 지역을 검색하거나 식물 스팟을 선택해 보세요.</p>${mapSearchUi()}<div class="section-heading"><h2>${esc(MAP_NAMES[state.projection])}</h2><button type="button" class="text-button" data-action="expand-map">전체 화면 ↗</button></div><div class="map-inline-shell">${mapMarkup()}<button class="map-expand" data-action="expand-map" type="button">⛶ 전체 화면</button></div><p class="map-help">지도를 누르면 전체 화면으로 전환됩니다. 이퀄 어스를 깊게 확대하면 상세 지도 도법으로 전환됩니다.</p><div class="map-help">식물 스팟은 두 지도에서 확대해도 유지됩니다. 위치 비공개 기록은 지도에 표시되지 않습니다.</div><div id="map-pin-popup" class="map-pin-popup hidden">${pinSummary()}</div><div class="section-heading"><h2>OBSERVATIONS</h2><span>${mapRecords().length} RECORDS</span></div>${mapRecords().map(recordCard).join('')||'<div class="empty">검색된 관찰 기록이 없습니다.</div>'}</section>`;
}

function homeScreen(){const records=samples();return `<section class="page"><div class="home-intro"><span class="eyebrow">PLANT MATTER / RAINFOREST MEMORIES</span><h1>RAINFOREST<br>MEMORIES</h1><p class="lead">식물을 발견한 순간의 자연을 기록합니다.<br>세계의 자생지와 생태를 함께 남기는 식물 관찰 아카이브.</p></div><div class="home-hero" data-action="home-photo" role="button" tabindex="0"><img src="./assets/staurogyne-reference.jpg" alt="식물 필드 사진"/><span>BOTANICAL FIELD NOTES</span></div><div class="stats"><div class="stat"><strong>${String(state.records.length).padStart(2,'0')}</strong><span>이 기기 기록</span></div><div class="stat"><strong>${String(state.sharedRecords.length).padStart(2,'0')}</strong><span>온라인 공유</span></div><div class="stat"><strong>${String(state.projects.length).padStart(2,'0')}</strong><span>탐사 프로젝트</span></div></div><div class="section-heading"><h2>DISCOVER THE WORLD</h2><button class="text-button" type="button" data-nav="map">MAP ↗</button></div><div class="map-inline-shell">${mapMarkup()}<button class="map-expand" data-action="expand-map" type="button">⛶ 전체 화면</button></div><div class="section-heading"><h2>RECENT FIELD RECORDS</h2><button class="text-button" type="button" data-nav="map">MORE ↗</button></div>${records.slice(0,3).map(recordCard).join('')}</section>`;}

function mountMap(){
 if(state.projection==='equal-earth'&&!state.detailMode){setupEqualInteractions();return;}
 if(typeof window.L==='undefined'){const el=$('#leaflet-map');if(el)el.innerHTML='<div class="map-unavailable">상세 지도 라이브러리를 불러오지 못했습니다.<br>인터넷 연결을 확인해 주세요.</div>';return;}
 const target=$('#leaflet-map');if(!target)return;
 if(state.leaflet){state.leaflet.remove();state.leaflet=null;}
 const focus=state.detailFocus || publicPoint(getRecord(state.selectedMap)||{}) || {latitude:15,longitude:0};
 const isDetail=!!state.detailMode;const zoom=isDetail?12:2;
 const m=window.L.map(target,{zoomControl:true,worldCopyJump:true,attributionControl:true,maxZoom:19}).setView([focus.latitude,focus.longitude],zoom);
 window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(m);
 for(const r of mapRecords()){
  const p=publicPoint(r);if(!p)continue;
  const marker=window.L.circleMarker([p.latitude,p.longitude],{radius:7,color:'#fff',weight:2,fillColor:r.isDemo?'#888':'#222',fillOpacity:1}).addTo(m);
  marker.bindTooltip(`${r.isDemo?'[DEMO] ':''}${esc(r.scientificName||'미동정 식물')}`);
  marker.on('click',e=>{window.L.DomEvent.stopPropagation(e.originalEvent);if(state.tab==='home'){state.tab='map';state.fullMap=true;render();}selectSpot(r.id);});
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
 const editing=state.editingId && getRecord(state.editingId);
 return `<section class="page"><div class="eyebrow">${editing?'EDIT FIELD OBSERVATION':'NEW FIELD OBSERVATION'}</div><h1>${editing?'관찰 기록 수정':'새로운 식물 기록'}</h1><p class="lead">${editing?'이미 등록한 기록의 사진·학명·위치·환경 데이터를 언제든 수정할 수 있습니다. 기존 기록 ID와 동정 의견은 유지됩니다.':'사진과 서식 환경을 기록하세요. 입력 내용은 자동 임시 저장됩니다. 온라인 공유는 별도로 선택해요.'}</p><form id="observation-form" autocomplete="off"><p id="draft-status" class="draft-status">오프라인 기록 · 자동 임시 저장</p><div class="form-section"><h2>01 / PHOTOGRAPH</h2><div id="photo-box" class="photo-box"><span class="photo-symbol">✳</span><strong>식물 사진 추가</strong><span>학명을 몰라도 기록할 수 있습니다.</span></div><div class="small-actions" style="margin-top:11px"><button type="button" class="light-button" data-action="gallery">▧ 앨범에서 선택</button><button type="button" class="light-button" data-action="camera">◉ 사진 촬영</button><button type="button" class="light-button" data-action="remove-photo" ${state.photoData?'':'disabled'}>사진 제거</button></div><input id="gallery-input" class="hidden-input" type="file" accept="image/*"/><input id="camera-input" class="hidden-input" type="file" accept="image/*" capture="environment"/></div><div class="form-section"><h2>02 / TAXONOMY</h2>${fieldInput('scientificName','학명 / Scientific name','예: Ficus sp. (미동정 가능)')}${fieldInput('family','과명 / Family','예: Moraceae')}${fieldSelect('identificationStatus','동정 상태',[['unidentified','미동정'],['proposed','동정 제안'],['review','검토 중']])}</div><div class="form-section"><h2>03 / LOCATION</h2><div class="two-col">${fieldInput('country','국가','Malaysia')}${fieldInput('locality','발견 지명','Fraser’s Hill')}</div><button class="light-button wide" type="button" data-action="gps">◎ 현재 GPS 좌표 가져오기</button><div class="two-col" style="margin-top:14px">${fieldInput('latitude','위도 / Latitude','3.710000','number','step="any" min="-90" max="90"')}${fieldInput('longitude','경도 / Longitude','101.740000','number','step="any" min="-180" max="180"')}</div><div class="two-col">${fieldInput('elevation','해발 고도 (m)','1250','number','step="any"')}${fieldInput('gpsAccuracy','GPS 정확도 (m)','12','number','step="any" min="0"')}</div><div class="privacy-group"><div class="privacy-group-title">위치 공개 수준</div><label class="privacy-option"><input type="radio" name="privacy" value="private" checked/><span><b>정확한 위치 비공개 — 권장</b><small>관찰 기록에만 정확한 좌표 저장, 지도 핀 없음</small></span></label><label class="privacy-option"><input type="radio" name="privacy" value="coarse"/><span><b>대략적인 지역</b><small>1° 격자 중심으로 위치 일반화 (민감 서식지에는 주의)</small></span></label><label class="privacy-option"><input type="radio" name="privacy" value="public"/><span><b>정확한 위치 표시</b><small>공유 동의 시 그룹 지도에 정확한 좌표 표시</small></span></label></div></div><div class="form-section"><h2>04 / FIELD NOTES</h2><label class="form-field"><span>탐사 프로젝트 / Expedition</span><select name="projectId"><option value="">프로젝트 없이 기록</option>${state.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>${fieldInput('observedAt','발견 일시','','datetime-local',`value="${localDate()}"`)}${fieldSelect('habit','생육 형태',[['지생','지생'],['착생','착생'],['암생','암생'],['포복','포복'],['덩굴','덩굴'],['관목','관목'],['교목','교목'],['수생','수생'],['기타','기타']])}${fieldSelect('phenology','생육 상태',[['영양생장','영양생장'],['개화','개화'],['결실','결실'],['포자 형성','포자 형성'],['휴면','휴면']])}${fieldInput('habitat','서식지 유형','운무림 / 산지 열대우림')}${fieldInput('substrate','기질 / Substrate','이끼, 암면, 낙엽층 등')}<label class="form-field"><span>현장 메모</span><textarea name="notes" placeholder="잎·줄기·꽃의 특징, 동반 식생, 환경 등"></textarea></label></div><button type="button" class="advanced-toggle" data-action="advanced">＋ 전문 환경 측정 및 표본 기록 펼치기</button><div id="advanced-fields" class="advanced"><div class="form-section"><h2>05 / ENVIRONMENTAL MEASUREMENTS</h2><div class="two-col">${fieldInput('lux','조도 (lx)','850','number','step="any"')}${fieldInput('ppfd','PPFD (µmol/m²/s)','25','number','step="any"')}</div><div class="two-col">${fieldInput('temperature','기온 (°C)','23.5','number','step="any"')}${fieldInput('humidity','상대습도 (%)','88','number','step="any" min="0" max="100"')}</div>${fieldSelect('measurementSource','측정 근거',[['not-recorded','미기록'],['instrument','계측 장비를 사용한 실측'],['estimated','추정값 또는 외부 자료'],['unspecified','출처 미지정']])}${fieldInput('measurementDevice','측정 장비','조도계 모델 / 측정 높이')}${fieldInput('measuredAt','측정 시각','','datetime-local')}</div><div class="form-section"><h2>06 / COLLECTION & RESEARCH</h2>${fieldInput('fieldNumber','필드 번호 / Field number','PMF-001')}${fieldInput('collector','관찰자 / Observer','')}${fieldInput('population','개체군 / Abundance','작은 군락 형태')}${fieldInput('associatedSpecies','동반 식생 / Associated species','')}${fieldInput('voucher','표본·바우처 / Voucher','표본 미채집 / 기관·번호')}</div></div><div class="info warning" style="margin:18px 0">야생 희귀식물의 정확한 GPS는 공유하지 마세요. 사진은 저장하기 전에 크기를 줄이고 EXIF 메타데이터를 제거합니다.</div><button class="primary-button wide" type="submit" id="save-button">${editing?'변경 사항 저장하기':'관찰 기록 저장하기'}</button>${editing?'<button class="light-button wide cancel-edit" type="button" data-action="cancel-edit">수정 취소</button>':''}<p class="footnote" style="text-align:center">현재는 내 아이폰의 브라우저 저장소에만 보관됩니다. 초안은 자동 저장됩니다. 중요 데이터는 JSON으로 백업해 주세요.</p></form></section>`;
}
// EXPEDITION ROUTES: private local-first waypoints + optional foreground GPS trail.
// Connecting points is a recorded itinerary, NOT a calculated road/trail route.
const routeStopsFor=p=>Array.isArray(p?.routeStops)?p.routeStops:[];
const routeTrackFor=p=>Array.isArray(p?.routeTrack)?p.routeTrack:[];
const routeCoords=s=>Number.isFinite(Number(s?.latitude))&&Number.isFinite(Number(s?.longitude))&&
 s.latitude!==''&&s.longitude!==''&&s.latitude!==null&&s.longitude!==null&&Math.abs(Number(s.latitude))<=90&&Math.abs(Number(s.longitude))<=180;
function expeditionRouteScreen(){
 const p=state.projects.find(x=>x.id===state.activeExpeditionId);
 if(!p){state.activeExpeditionId=null;return fieldScreen();}
 const stops=routeStopsFor(p),track=routeTrackFor(p);
 const rows=stops.map((s,i)=>{const role=i===0?'출발지':i===stops.length-1?'목적지':'경유지';return `<div class="route-stop-row"><div class="route-stop-index">${String(i+1).padStart(2,'0')}</div><div class="route-stop-copy"><strong>${esc(s.name)}</strong><small>${role} · ${esc(s.arrivalDate||'날짜 미기록')}${s.departureDate?' ~ '+esc(s.departureDate):''}</small>${s.note?`<p>${esc(s.note)}</p>`:''}</div><div class="route-stop-actions"><button type="button" class="route-mini" data-action="route-move-up" data-index="${i}" aria-label="위로 이동" ${i===0?'disabled':''}>↑</button><button type="button" class="route-mini" data-action="route-move-down" data-index="${i}" aria-label="아래로 이동" ${i===stops.length-1?'disabled':''}>↓</button><button type="button" class="route-mini" data-action="route-edit" data-index="${i}">수정</button><button type="button" class="route-mini" data-action="route-delete" data-index="${i}">삭제</button></div></div>`;}).join('');
 return `<section class="page expedition-route-page"><div class="eyebrow">EXPEDITION / TRAVEL LOG</div><button class="text-button route-back" data-action="route-close" type="button">← PROFILE로 돌아가기</button><h1>${esc(p.name)}</h1><p class="lead">출발지, 경유지, 목적지를 순서대로 등록하면 지도에 경로선이 자동으로 연결돼요.</p><div class="route-map-wrapper"><div id="expedition-route-map" aria-label="탐사 이동 경로 지도"></div><div class="route-map-caption">지도 터치 → 아래 입력창에 GPS 좌표 입력 · 회색 점선: 지정한 방문 순서</div></div><div class="info">탐사 일정과 이동 좌표는 <strong>현재 기기에만 비공개 저장</strong>돼요. 지도에서 이어지는 점선은 실제 도로·등산로 경로 탐색 결과가 아닌 방문 순서 연결선이에요.</div><div class="section-heading"><h2>JOURNEY STOPS</h2><span>${stops.length} POINTS</span></div>${rows||'<p class="mini-muted">아직 등록한 이동 지점이 없어요. 아래에서 출발지를 추가해 주세요.</p>'}<form id="route-stop-form" class="project-form"><input type="hidden" name="stopId" value=""/><label class="form-field"><span>장소 이름 / 출발지·경유지·목적지</span><input name="name" required maxlength="90" placeholder="예: 쿠알라룸푸르 공항" /></label><div class="two-col"><label class="form-field"><span>도착 / 머문 시작 날짜</span><input name="arrivalDate" type="date" /></label><label class="form-field"><span>출발 / 머문 종료 날짜</span><input name="departureDate" type="date" /></label></div><div class="two-col"><label class="form-field"><span>위도</span><input name="latitude" type="number" step="any" min="-90" max="90" required placeholder="3.716"/></label><label class="form-field"><span>경도</span><input name="longitude" type="number" step="any" min="-180" max="180" required placeholder="101.737"/></label></div><div class="small-actions"><button class="light-button" type="button" data-action="route-gps">◎ 현재 위치</button><button class="light-button" type="button" data-action="route-clear-form">새 지점 입력</button></div><label class="form-field" style="margin-top:14px"><span>현장 메모 / 이동 수단</span><textarea name="note" maxlength="1000" placeholder="예: 도보 이동, 현장에서 2일 체류"></textarea></label><button type="submit" class="primary-button wide" id="route-save-btn">＋ 지점 저장 및 경로 연결</button></form><div class="section-heading"><h2>ACTUAL GPS TRACK</h2><span>FOREGROUND ONLY</span></div><p class="mini-muted">탐사 중 앱 화면을 켜둔 상태에서 실제 GPS 이동 궤적을 기록할 수 있어요. 다른 앱으로 이동하거나 화면이 꺼지면 iPhone PWA에서 지속 기록이 보장되지 않아요.</p><div class="small-actions"><button class="light-button" type="button" data-action="route-track-start" ${state.routeTrackingId!==null?'disabled':''}>● GPS 기록 시작</button><button class="light-button" type="button" data-action="route-track-stop" ${state.routeTrackingId===null?'disabled':''}>■ 기록 종료</button></div><p class="draft-status">${state.routeTrackingId!==null?'GPS 기록 중 · 앱을 열린 상태로 유지해 주세요.':'저장된 실제 GPS 위치: '+track.length+'개'} <span class="route-tracking-count"></span> · 세부 지형도는 온라인 연결 필요</p><button type="button" class="light-button wide" data-action="route-export-gpx">↓ GPX 경로 내보내기</button><p class="footnote">GPS 이동 기록과 일정 기록은 자동 공개되지 않으며, 백업 파일에 포함되므로 외부 공유에 주의해 주세요.</p></section>`;
}
function mountExpeditionRoute(){
 const el=$('#expedition-route-map'),p=state.projects.find(x=>x.id===state.activeExpeditionId);if(!el||!p)return;
 if(!window.L){el.innerHTML='<p class="map-unavailable">지도를 불러올 수 없습니다. 장소와 GPS 좌표는 오프라인에서도 입력·저장할 수 있어요.</p>';return;}
 const m=window.L.map(el,{zoomControl:true,attributionControl:true,maxZoom:19}).setView([15,105],4);
 window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);
 const stops=routeStopsFor(p).filter(routeCoords),trail=routeTrackFor(p).filter(routeCoords),bounds=[];
 if(stops.length>1){const poly=window.L.polyline(stops.map(s=>[s.latitude,s.longitude]),{color:'#333',weight:3,opacity:.85,dashArray:'6 6'}).addTo(m);bounds.push(...poly.getLatLngs());}
 stops.forEach((s,i)=>{const latlng=[+s.latitude,+s.longitude];bounds.push(latlng);const marker=window.L.marker(latlng,{icon:window.L.divIcon({className:'route-pin',html:`<span>${i+1}</span>`,iconSize:[26,26],iconAnchor:[13,13]})}).addTo(m);marker.bindPopup(`<strong>${esc(s.name)}</strong><br>${esc(s.arrivalDate||'날짜 미기록')}${s.departureDate?' ~ '+esc(s.departureDate):''}`);});
 if(trail.length>1){const line=window.L.polyline(trail.map(pt=>[pt.latitude,pt.longitude]),{color:'#2b795b',weight:3,opacity:.9}).addTo(m);bounds.push(...line.getLatLngs());}
 if(bounds.length>1)m.fitBounds(bounds,{padding:[25,25],maxZoom:14});else if(bounds.length===1)m.setView(bounds[0],12);
 m.on('click',e=>{const f=$('#route-stop-form');if(!f)return;f.elements.latitude.value=e.latlng.lat.toFixed(6);f.elements.longitude.value=e.latlng.lng.toFixed(6);toast('지도에서 GPS 좌표를 선택했어요. 장소 이름과 날짜를 입력해 주세요.');});
 state.routeMap=m;setTimeout(()=>m.invalidateSize(),100);
}
async function updateExpedition(id,update){const p=state.projects.find(x=>x.id===id);if(!p)throw Error('탐사 프로젝트 없음');await namedStore('expeditions','readwrite',s=>s.put({...p,...update,updatedAt:new Date().toISOString()}));await loadExtras();}
async function saveRouteStop(form){
 const p=state.projects.find(x=>x.id===state.activeExpeditionId);if(!p)return;
 const data=new FormData(form),name=txt(data.get('name')),lat=txt(data.get('latitude')),lon=txt(data.get('longitude'));
 if(!name||lat===''||lon==='')return toast('장소 이름과 GPS 좌표를 입력해 주세요.');
 const latitude=Number(lat),longitude=Number(lon);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return toast('위도·경도 값이 올바르지 않습니다.');
 const arrivalDate=txt(data.get('arrivalDate')),departureDate=txt(data.get('departureDate'));
 if(arrivalDate&&departureDate&&departureDate<arrivalDate)return toast('출발 날짜는 도착 날짜보다 빠를 수 없어요.');
 const stops=[...routeStopsFor(p)],stopId=txt(data.get('stopId'));
 const point={id:stopId||'STP-'+crypto.randomUUID(),name,latitude,longitude,arrivalDate,departureDate,note:txt(data.get('note'))};
 const idx=stops.findIndex(s=>s.id===stopId);if(idx>=0)stops[idx]=point;else stops.push(point);
 await updateExpedition(p.id,{routeStops:stops});render();toast(idx>=0?'이동 지점을 수정했어요.':'이동 지점을 추가하고 경로를 연결했어요.');
}
function routeEditStop(index){const p=state.projects.find(x=>x.id===state.activeExpeditionId),s=routeStopsFor(p)[index],f=$('#route-stop-form');if(!s||!f)return;
 for(const key of ['stopId','name','latitude','longitude','arrivalDate','departureDate','note']){const el=f.elements[key==='stopId'?'stopId':key];if(el)el.value=key==='stopId'?s.id:(s[key]??'');}
 $('#route-save-btn').textContent='지점 수정 저장';f.scrollIntoView({behavior:'smooth',block:'center'});
}
async function routeReorderStop(index,delta){const p=state.projects.find(x=>x.id===state.activeExpeditionId);if(!p)return;const a=[...routeStopsFor(p)],j=index+delta;if(index<0||j<0||j>=a.length)return;[a[index],a[j]]=[a[j],a[index]];await updateExpedition(p.id,{routeStops:a});render();}
async function routeRemoveStop(index){const p=state.projects.find(x=>x.id===state.activeExpeditionId);if(!p)return;const a=[...routeStopsFor(p)];if(!a[index]||!confirm(`'${a[index].name}' 이동 지점을 삭제할까요?`))return;a.splice(index,1);await updateExpedition(p.id,{routeStops:a});render();}
function routeUseGPS(){if(!navigator.geolocation)return toast('GPS를 지원하지 않는 브라우저입니다.');navigator.geolocation.getCurrentPosition(({coords})=>{const f=$('#route-stop-form');if(!f)return;f.elements.latitude.value=coords.latitude.toFixed(6);f.elements.longitude.value=coords.longitude.toFixed(6);toast('현재 위치를 불러왔어요.');},()=>toast('위치 권한과 HTTPS 연결을 확인해 주세요.'),{enableHighAccuracy:true,timeout:20000});}
function geoMeters(a,b){const R=6371000,rad=Math.PI/180,x=(b.longitude-a.longitude)*rad*Math.cos((a.latitude+b.latitude)*rad/2),y=(b.latitude-a.latitude)*rad;return R*Math.sqrt(x*x+y*y);}
function startRouteTracking(){
 const id=state.activeExpeditionId;if(!id||!navigator.geolocation)return toast('GPS 사용이 불가능해요.');if(state.routeTrackingId!==null)return;
 if(!confirm('정확한 GPS 이동 기록을 이 기기에 비공개 저장합니다. 앱을 화면에 켜 두고 이동할 때만 사용하세요. 시작할까요?'))return;
 state.routeTrackingProject=id;
 state.routeTrackingId=navigator.geolocation.watchPosition(async ({coords,timestamp})=>{
  const p=state.projects.find(x=>x.id===id);if(!p)return;const track=[...routeTrackFor(p)],pt={latitude:+coords.latitude,longitude:+coords.longitude,at:new Date(timestamp).toISOString(),accuracy:coords.accuracy};
  if(!Number.isFinite(pt.latitude)||!Number.isFinite(pt.longitude)||coords.accuracy>100)return;
  const last=track[track.length-1];if(last&&geoMeters(last,pt)<12&&(new Date(pt.at)-new Date(last.at)<30000))return;
  if(track.length>=20000){stopRouteTracking();toast('GPS 기록 최대치에 도달했어요. GPX로 백업해 주세요.');return;}
  track.push(pt);await updateExpedition(id,{routeTrack:track});
  if(state.tab==='profile'&&state.activeExpeditionId===id){const el=$('#expedition-route-map');if(el){if(state.routeMap){state.routeMap.remove();state.routeMap=null;}mountExpeditionRoute();}const text=$('.route-tracking-count');if(text)text.textContent=track.length+' GPS 점 기록됨';}
 },err=>{stopRouteTracking();toast('GPS 추적 중단: 위치 권한이나 신호 상태를 확인해 주세요.');},{enableHighAccuracy:true,maximumAge:0,timeout:25000});
 render();toast('GPS 이동 경로 기록을 시작했어요.');
}
function stopRouteTracking(notice=true){if(state.routeTrackingId!==null){navigator.geolocation.clearWatch(state.routeTrackingId);state.routeTrackingId=null;state.routeTrackingProject=null;if(notice)toast('GPS 이동 기록을 종료하고 저장했어요.');}if(state.tab==='profile'&&state.activeExpeditionId)render();}
function exportRouteGPX(){const p=state.projects.find(x=>x.id===state.activeExpeditionId);if(!p)return;const xml=s=>esc(s);
 const wpts=routeStopsFor(p).filter(routeCoords).map(s=>`<wpt lat="${s.latitude}" lon="${s.longitude}"><name>${xml(s.name)}</name>${s.arrivalDate?`<time>${s.arrivalDate}T00:00:00Z</time>`:''}<desc>${xml(s.note||'')}</desc></wpt>`).join('');
 const pts=routeTrackFor(p).filter(routeCoords).map(s=>`<trkpt lat="${s.latitude}" lon="${s.longitude}">${s.at?`<time>${xml(s.at)}</time>`:''}</trkpt>`).join('');
 if(!wpts&&!pts)return toast('내보낼 경로 지점이 없어요.');
 if(!confirm('GPX 파일에는 정확한 GPS 좌표가 포함돼요. 개인 보관용으로 내보낼까요?'))return;
 download(`PM-EXPEDITION-${p.id}.gpx`,`<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="PLANT MATTER"><name>${xml(p.name)}</name>${wpts}${pts?`<trk><name>${xml(p.name)}</name><trkseg>${pts}</trkseg></trk>`:''}</gpx>`);toast('경로 GPX 파일을 내보냈어요.');
}

function fieldScreen(){
 const mine=state.records.length,countries=new Set(state.records.map(r=>r.country).filter(Boolean)).size;
 const projectCards=state.projects.map(p=>{const count=state.records.filter(r=>r.projectId===p.id).length;return `<div class="project-card"><div><strong>${esc(p.name)}</strong><small>${esc([p.country,p.locality].filter(Boolean).join(' · ')||'지역 미설정')} · ${count}개 기록</small></div><div class="project-actions"><button class="light-button" type="button" data-action="project-route" data-project-id="${esc(p.id)}">이동 경로 / 일정</button><button class="light-button" type="button" data-action="project-use" data-project-id="${esc(p.id)}">식물 기록</button></div></div>`}).join('');
 const pending=state.records.filter(r=>r.syncPending).length;
 return `<section class="page"><div class="eyebrow">MY FIELD NOTEBOOK</div><h1>PROFILE</h1><p class="lead">${esc(state.profile?.display_name||state.user?.user_metadata?.display_name||'나의 식물 기록')} · 개인 탐사 아카이브</p><div class="stats"><div class="stat"><strong>${mine}</strong><span>내 기록</span></div><div class="stat"><strong>${countries}</strong><span>국가</span></div><div class="stat"><strong>${state.projects.length}</strong><span>탐사 프로젝트</span></div></div><div class="section-heading"><h2>EXPEDITIONS</h2><span>탐사별 기록 분류</span></div><form id="project-form" class="project-form"><label class="form-field"><span>탐사명</span><input type="text" name="name" maxlength="90" placeholder="예: Fraser's Hill 2026" required/></label><div class="two-col">${fieldInput('country','국가','Malaysia')}${fieldInput('locality','지역','Fraser’s Hill')}</div><button class="light-button wide" type="submit">＋ 탐사 프로젝트 추가</button></form>${projectCards||'<p class="mini-muted">아직 만든 탐사가 없습니다.</p>'}<div class="section-heading"><h2>ONLINE SHARING</h2><span>${state.member?'INVITED TESTER':state.authClient?'NOT CONNECTED':'SETUP REQUIRED'}</span></div><div class="info">${state.member?`지인 그룹과 공유할 기록을 선택해서 게시할 수 있습니다. 대기 중인 업로드: ${pending}개. 인터넷이 연결되면 공유 예약된 기록을 동기화합니다.`:'내 기록은 현재 기기에 저장됩니다. 온라인 공유는 Supabase 프로젝트 연결과 초대 승인이 필요합니다.'}</div><button type="button" class="light-button wide" data-action="sync-now" ${state.member?'':'disabled'}>↻ 온라인 기록 동기화</button><div class="section-heading"><h2>DATA BACKUP</h2><span>PRIVATE GPS INCLUDED</span></div><div class="profile-actions"><button type="button" class="light-button" data-action="export">JSON 내보내기</button><button type="button" class="light-button" data-action="import">JSON 가져오기</button></div><input type="file" class="hidden-input" accept="application/json,.json" id="import-input"/><p class="footnote">백업 파일에는 정확한 좌표와 사진이 포함될 수 있으니 비공개로 보관하세요. 기록 데이터는 기존 BETA 02/03과 같은 기기 저장소를 사용합니다.</p><div class="section-heading"><h2>MY OBSERVATIONS</h2></div>${samples().filter(canEdit).map(recordCard).join('')||'<div class="empty">아직 관찰 기록이 없습니다.</div>'}</section>`;
}

function mapSettingCard(){return `<div class="option-section"><h2>MAP PROJECTION</h2><p class="setting-description">세계 지도를 표시할 도법을 선택하세요. 선택은 이 기기에 저장됩니다.</p><label class="option-radio"><input type="radio" name="projection" value="mercator" ${state.projection==='mercator'?'checked':''}/><span><b>메르카토르 도법</b><small>Mercator · EPSG:3857 기반 상세 지도</small></span></label><label class="option-radio"><input type="radio" name="projection" value="equal-earth" ${state.projection==='equal-earth'?'checked':''}/><span><b>이퀄 어스 도법</b><small>Equal Earth · EPSG:8857 세계 지도, 깊은 확대 시 상세 지도로 전환</small></span></label><div class="info">두 선택 모두 확대·축소가 가능합니다. 이퀄 어스는 세계·광역 화면에 적용하고 세부 도로·산림 자료는 웹 메르카토르 타일로 표시합니다.</div></div>`;}
function accountEditor(){
 const email=state.user?.email||'';const profile=state.profile||{};
 return `<div class="option-section"><h2>ACCOUNT MANAGEMENT</h2><p class="setting-description">로그인 계정: ${esc(email)}</p><form id="profile-form"><label class="form-field"><span>표시 이름</span><input name="displayName" maxlength="50" required value="${esc(profile.display_name||state.user?.user_metadata?.display_name||'')}" placeholder="앱에 공개할 이름"/></label><label class="option-radio"><input type="checkbox" name="emailVisible" ${profile.email_visible?'checked':''}/><span><b>이메일 주소 공개</b><small>기본값은 비공개. 다른 사용자에게 이메일 공개를 허용합니다.</small></span></label><button class="primary-button wide" type="submit">계정 설정 저장</button></form><div class="settings-actions"><button class="light-button wide" type="button" data-action="signout">로그아웃</button><button class="danger-button wide" type="button" data-action="delete-account">회원 탈퇴</button></div><div class="info warning">회원 탈퇴는 실제 서버 삭제 함수가 배포되어야 작동하며, 기기에 저장한 별도 기록은 JSON 백업 또는 직접 삭제가 필요합니다.</div></div>`;
}
function authPanel(){
 if(!state.authClient)return `<div class="option-section"><h2>GOOGLE / EMAIL ACCOUNT</h2><div class="info warning"><strong>인증 서버 연결 전</strong><br>현재 빌드에는 Supabase 프로젝트 주소와 공개키가 설정되지 않았습니다. 실제 회원가입·로그인·탈퇴는 아직 사용할 수 없습니다. OPTIONS의 설정 화면과 개인 기록 기능은 테스트할 수 있습니다.</div><p class="footnote">Supabase 프로젝트 생성 후 config.js에 URL과 공개키를 넣고 SQL 정책을 적용하면 기능을 활성화할 수 있습니다. 비밀 키는 GitHub에 올리지 마세요.</p></div>`;
 if(state.user)return accountEditor();
 const signup=state.authMode==='signup';
 return `<div class="option-section"><h2>${signup?'CREATE ACCOUNT':'SIGN IN'}</h2><button type="button" class="google-button" data-action="google-login">Google 계정으로 계속하기</button><p class="divider-label">또는 이메일</p><form id="auth-form"><label class="form-field"><span>이메일</span><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"/></label>${signup?'<label class="form-field"><span>표시 이름</span><input name="displayName" maxlength="50" required placeholder="기록에 사용할 이름"/></label>':''}<label class="form-field"><span>비밀번호</span><input name="password" type="password" minlength="8" required autocomplete="${signup?'new-password':'current-password'}" placeholder="8자 이상"/></label>${signup?'<label class="option-radio"><input type="checkbox" name="emailVisible"/><span><b>이메일을 다른 사용자에게 공개</b><small>기본적으로 비공개로 설정됩니다.</small></span></label>':''}<button class="primary-button wide" type="submit">${signup?'이메일로 가입하기':'이메일로 로그인'}</button></form><div class="auth-switch"><button type="button" class="text-button" data-action="auth-toggle">${signup?'이미 계정이 있어요 · 로그인':'새 계정 만들기'}</button><button type="button" class="text-button" data-action="reset-password">비밀번호 찾기</button></div><p class="footnote">가입 시 이메일 확인을 권장합니다. 승인된 테스터만 온라인 공유할 수 있고 기존 기기 기록은 자동 게시되지 않습니다.</p></div>`;
}
function optionsScreen(){return `<section class="page"><div class="eyebrow">PREFERENCES & ACCOUNT</div><h1>OPTIONS</h1><p class="lead">계정과 지도 표기를 관리할 수 있습니다.</p>${mapSettingCard()}${authPanel()}<div class="option-section"><h2>ONLINE BETA</h2><p class="setting-description">${esc(invitedNotice())}</p>${state.onlineError?`<p class="footnote">오류: ${esc(state.onlineError)}</p>`:''}</div><div class="option-section"><h2>APPLICATION</h2><p class="setting-description">PLANT MATTER RAINFOREST MEMORIES<br>BETA 04 · Pretendard Regular 400</p><p class="footnote">초대된 계정만 온라인 관찰 기록을 공유할 수 있습니다. 공개 수준을 확인하고 민감 서식지 좌표는 비공개로 관리하세요.</p></div></section>`;}
function render(){
 if(state.leaflet){state.leaflet.remove();state.leaflet=null;}
 if(state.routeMap){state.routeMap.remove();state.routeMap=null;}
 const screens={home:homeScreen,map:mapScreen,record:formScreen,profile:()=>state.activeExpeditionId?expeditionRouteScreen():fieldScreen(),options:optionsScreen};
 content.innerHTML=(screens[state.tab]||homeScreen)();
 document.body.classList.toggle('fullscreen-map-open',state.tab==='map'&&state.fullMap);
 document.querySelectorAll('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.nav===state.tab));
 if(state.tab==='map'||state.tab==='home')mountMap();
 if(state.tab==='profile'&&state.activeExpeditionId)mountExpeditionRoute();
 if(state.tab==='record'){
  if(state.editingId){populateEditForm();if(state.draft?.editingId===state.editingId)restoreDraft(true);}
  else if(state.draft)restoreDraft();
 }
 if(state.fullMap&&state.tab==='map')return;
 window.scrollTo({top:0,behavior:'instant'});
}

function nav(tab){
 if(state.routeTrackingId!==null&&tab!=='profile')stopRouteTracking(false);
 if(tab==='explore')tab='map';
 if(!['home','map','record','profile','options'].includes(tab))return;
 if(state.tab==='record')saveDraftSoon(true);
 state.editingId=tab==='record'&&state.draft?.editingId&&getRecord(state.draft.editingId)?state.draft.editingId:null;state.fullMap=false;state.tab=tab;state.photoData=null;
 if(tab!=='map')state.search='';
 if(tab!=='profile')state.activeExpeditionId=null;
 closeDetail();render();
}

function toDateTimeLocal(value){
 if(!value)return '';
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function populateEditForm(){
 const r=getRecord(state.editingId), form=$('#observation-form');
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
 const r=getRecord(id);
 if(!canEdit(r))return toast('본인이 작성한 관찰 기록만 수정할 수 있습니다.');
 closeDetail();state.editingId=id;state.photoData=isSafePhoto(r.photoData)?r.photoData:null;state.tab='record';render();
}
function cancelEdit(){clearDraft().catch(console.warn);state.editingId=null;state.photoData=null;state.tab='profile';render();}
function recordRow(label,value){return `<div class="detail-row"><span>${label}</span><strong>${show(value)}</strong></div>`;}
function metric(label,value,unit){return `<div class="metric"><small>${label}</small><strong>${value===null||value===undefined||value===''?'미기록':`${esc(value)} ${unit}`}</strong></div>`;}
function detail(id){const r=getRecord(id);if(!r)return;const p=publicPoint(r);overlay.innerHTML=`<div class="detail-body"><div class="detail-header"><span class="eyebrow">FIELD RECORD / ${esc(r.id)}</span><button type="button" class="close" data-action="close">✕ 닫기</button></div><div class="detail-picture ${photoSource(r)?'image-clickable':''}" ${photoSource(r)?`data-action="photo-view" data-photo-id="${esc(r.id)}" role="button" tabindex="0" aria-label="사진 전체 화면 보기"`:''}>${artwork(r)}${photoSource(r)?'<span class="photo-full-hint">⛶ 사진 확대</span>':''}</div>${r.isDemo?'<span class="tiny-tag">DEMO · 가상 관찰 데이터</span>':''}<h1>${esc(r.scientificName||'미동정 식물')}</h1><p class="lead">${esc(r.family||'과명 미기록')} · ${esc(STATUS[r.identificationStatus]||'미동정')}</p><div class="detail-section"><h2>OBSERVATION</h2>${recordRow('관찰 날짜',fmt(r.observedAt))}${r.updatedAt?recordRow('마지막 수정',new Date(r.updatedAt).toLocaleString('ko-KR')):''}${recordRow('국가 / 지역',[r.country,r.locality].filter(Boolean).join(' / '))}${recordRow('해발 고도',r.elevation==null?'미기록':`${r.elevation} m`)}${recordRow('GPS 정확도',r.gpsAccuracy==null?'미기록':`${r.gpsAccuracy} m`)}${recordRow('위치 공개',({private:'비공개',coarse:'대략적 위치',public:'정확한 위치'})[r.privacy]||'미기록')}${recordRow('지도 표시 좌표',p?`${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`:'비공개')}${recordRow('생육 형태',r.habit)}${recordRow('서식지',r.habitat)}${recordRow('기질',r.substrate)}${recordRow('생육 상태',r.phenology)}</div><div class="detail-section"><h2>ENVIRONMENTAL DATA</h2><div class="metrics">${metric('ILLUMINANCE',r.lux,'lx')}${metric('PPFD',r.ppfd,'µmol/m²/s')}${metric('TEMPERATURE',r.temperature,'°C')}${metric('HUMIDITY',r.humidity,'%RH')}</div>${recordRow('측정 근거',({instrument:'기기로 실측',estimated:'추정·외부 자료',sample:'가상 예시',unspecified:'미지정','not-recorded':'미측정'})[r.measurementSource]||'미기록')}${recordRow('측정 장비',r.measurementDevice)}${recordRow('측정 시각',r.measuredAt)}</div><div class="detail-section"><h2>FIELD NOTES</h2><p class="long-text">${esc(r.notes||'현장 메모가 없습니다.')}</p>${recordRow('필드 번호',r.fieldNumber)}${recordRow('관찰자',r.collector)}${recordRow('개체군',r.population)}${recordRow('동반 식생',r.associatedSpecies)}${recordRow('표본',r.voucher)}${r.editHistory?.length?recordRow('수정 이력',`${r.editHistory.length}회 수정됨`):''}</div><div class="detail-section"><h2>IDENTIFICATION HISTORY</h2>${(r.suggestions||[]).map(s=>recordRow(s.name,`${s.author||'내 기기'} · ${fmt(s.at)}`)).join('')||'<p class="mini-muted">동정 제안 이력이 없습니다.</p>'}${!r.isDemo?`<form id="suggest-form"><label class="form-field"><span>동정 의견 ${r.isCloud||r.onlinePublished?'(테스터에게 공유)':'(기기 내 저장)'}</span><input name="name" maxlength="120" placeholder="예: Ficus punctata" required/></label><input type="hidden" name="recordId" value="${esc(r.id)}"/><button type="submit" class="light-button wide">동정 의견 추가</button></form>`:''}</div>${canEdit(r)?`<button type="button" class="primary-button wide" data-edit="${esc(r.id)}">이 관찰 기록 수정하기</button>${state.member&&!r.onlinePublished?`<button type="button" class="light-button wide online-share-btn" data-action="share-record" data-record-id="${esc(r.id)}">지인 그룹에 관찰 기록 공유</button>`:''}${r.syncPending?'<p class="footnote">온라인 업로드 예약됨 · 인터넷 연결 시 재시도</p>':''}<button type="button" class="light-button wide detail-delete" data-delete="${esc(r.id)}">이 관찰 기록 삭제</button>`:''}<p class="footnote" style="margin-top:20px">${r.isDemo?'이 기록은 실제 식물 분포나 환경 측정값이 아닙니다.':'정확한 좌표는 개인 기기에 저장되며, 온라인 공유 시 선택한 공개 수준에 맞춰 전송됩니다.'}</p></div>`;overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;}
function closeDetail(){overlay.classList.add('hidden');overlay.setAttribute('aria-hidden','true');}
async function compressPhoto(file){if(!file||!file.type.startsWith('image/'))throw Error('이미지 파일만 선택할 수 있습니다.');if(file.size>25*1024*1024)throw Error('25MB 이하 사진을 사용해 주세요.');const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));reader.readAsDataURL(file);});const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('사진을 불러오지 못했습니다.'));img.src=source;});const max=1400, scale=Math.min(1,max/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.77);}
async function choosePhoto(file){if(!file)return;try{state.photoData=await compressPhoto(file);$('#photo-box').innerHTML=`<img alt="선택한 식물 사진 미리보기" src="${state.photoData}"/>`;const rm=$('[data-action="remove-photo"]');if(rm)rm.disabled=false;saveDraftSoon();toast('사진을 첨부했어요. EXIF 메타데이터는 저장되지 않습니다.');}catch(e){toast(e.message||'사진을 처리할 수 없습니다.');}}
function useGPS(){if(!navigator.geolocation){toast('이 브라우저에서는 GPS를 사용할 수 없습니다.');return;}toast('GPS 위치 권한을 확인하고 있습니다…');navigator.geolocation.getCurrentPosition(({coords})=>{const form=$('#observation-form');if(!form)return;form.elements.latitude.value=coords.latitude.toFixed(6);form.elements.longitude.value=coords.longitude.toFixed(6);form.elements.gpsAccuracy.value=coords.accuracy==null?'':Math.round(coords.accuracy);if(coords.altitude!==null)form.elements.elevation.value=Math.round(coords.altitude);saveDraftSoon();toast('위치정보를 기록했어요. 공개 범위를 확인해 주세요.');},err=>toast('GPS를 사용할 수 없습니다. HTTPS 연결·위치 권한을 확인해 주세요.'),{enableHighAccuracy:true,timeout:16000,maximumAge:2000});}
async function saveForm(form){const data=new FormData(form), get=k=>txt(data.get(k)),lat=get('latitude'),lon=get('longitude');if(!get('scientificName')&&!state.photoData){toast('식물 사진이나 학명 중 하나는 필수예요.');return;}
 if((lat!==''||lon!=='')&&(lat===''||lon===''||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Number(lat)<-90||Number(lat)>90||Number(lon)<-180||Number(lon)>180)){toast('위도와 경도를 올바르게 입력해 주세요.');return;}
 const numericKeys=['elevation','gpsAccuracy','lux','ppfd','temperature','humidity'];const d=Object.fromEntries(data.entries());for(const key of numericKeys){if(d[key]!==undefined&&d[key]!==''&&!Number.isFinite(Number(d[key]))){toast(`${key} 값을 확인해 주세요.`);return;}}
 const previous=state.editingId?getRecord(state.editingId):null;
 if(state.editingId&&!previous){toast('수정할 원본 기록을 찾을 수 없습니다.');return;}
 const now=new Date().toISOString();
 const record={...previous,...d,id:previous?.id||`PMF-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,isDemo:false,scientificName:get('scientificName')||'미동정 식물',latitude:numberOrNull(lat),longitude:numberOrNull(lon),gpsAccuracy:numberOrNull(get('gpsAccuracy')),elevation:numberOrNull(get('elevation')),observedAt:get('observedAt')?new Date(get('observedAt')).toISOString():new Date().toISOString(),createdAt:previous?.createdAt||now,updatedAt:previous?now:null,photoData:state.photoData||previous?.photoData||null,photoPath:previous?.photoPath||null,onlinePublished:previous?.onlinePublished||false,syncPending:previous?.onlinePublished||previous?.syncPending||false,identificationStatus:get('identificationStatus')||'unidentified',measurementSource:get('measurementSource')||'not-recorded',suggestions:previous?.suggestions||[]};
 if(['lux','ppfd','temperature','humidity'].some(k=>get(k)!=='')&&record.measurementSource==='not-recorded')record.measurementSource='unspecified';
 if(previous){
  const changedFields=Object.keys(record).filter(k=>!['id','isDemo','createdAt','updatedAt','editHistory','suggestions'].includes(k)&&JSON.stringify(previous[k]??null)!==JSON.stringify(record[k]??null));
  record.editHistory=[...(previous.editHistory||[]),{at:now,changedFields}];
 }
 const btn=$('#save-button');btn.disabled=true;btn.textContent='저장 중…';
 try{await storeRecord(record);await clearDraft();state.editingId=null;state.photoData=null;state.tab='profile';render();detail(record.id);if(record.syncPending)syncPendingRecords().catch(console.warn);toast(previous?'관찰 기록의 수정 사항을 저장했어요.':'새 관찰 기록을 이 기기에 저장했어요.');}
 catch(e){btn.disabled=false;btn.textContent=previous?'변경 사항 저장하기':'관찰 기록 저장하기';toast(`저장 실패: ${e.message||e}`);}}
async function addSuggestion(form){const id=form.elements.recordId.value,name=txt(form.elements.name.value),r=getRecord(id);if(!r||r.isDemo||!name)return;const updated={...r,identificationStatus:'proposed',suggestions:[...(r.suggestions||[]),{name,author:'내 기기',at:new Date().toISOString()}]};try{if(r.isCloud||r.onlinePublished){await submitOnlineSuggestion(id,name);detail(id);toast('동정 의견을 공유했어요.');return;}await storeRecord(updated);detail(id);toast('개인 동정 의견을 저장했어요.');}catch(e){toast('동정 의견 저장에 실패했습니다.');}}
function download(name,text){const blob=new Blob([text],{type:name.endsWith('.gpx')?'application/gpx+xml;charset=utf-8':'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),45000);}
function exportRecords(){if(!state.records.length&&!state.projects.length){toast('백업할 기록이 없습니다.');return;}if(!confirm('JSON 파일에 비공개 GPS 원본 좌표·사진·탐사 경로가 포함됩니다. 안전한 곳에 보관할까요?'))return;download(`plant-matter-field-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({app:'PLANT MATTER FIELD',schemaVersion:2,exportedAt:new Date().toISOString(),observations:state.records,expeditions:state.projects},null,2));toast('백업 파일 다운로드를 요청했어요.');}
async function importRecords(file){if(!file)return;try{if(file.size>40*1024*1024)throw Error('40MB 이하 파일을 사용해 주세요.');const payload=JSON.parse(await file.text());if(payload.app!=='PLANT MATTER FIELD'||!Array.isArray(payload.observations))throw Error('PLANT MATTER FIELD 백업 파일이 아닙니다.');const items=payload.observations.filter(r=>r&&typeof r.id==='string'&&r.id.startsWith('PMF-')&&!r.isDemo&&typeof r.scientificName==='string').slice(0,500);const projects=Array.isArray(payload.expeditions)?payload.expeditions.filter(p=>p&&typeof p.id==='string'&&p.id.startsWith('EXP-')&&typeof p.name==='string').slice(0,200):[];if(!items.length&&!projects.length)throw Error('가져올 유효한 기록이 없습니다.');if(!confirm(`관찰 기록 ${items.length}개와 탐사 프로젝트 ${projects.length}개를 가져옵니다. 같은 ID는 덮어씁니다. 계속할까요?`))return;for(const r of items){const safe={...r};if(!isSafePhoto(safe.photoData))safe.photoData=null;safe.suggestions=Array.isArray(safe.suggestions)?safe.suggestions:[];await dbAction('readwrite',s=>s.put(safe));}for(const p of projects){const safe={...p,routeStops:routeStopsFor(p).filter(x=>x&&typeof x.name==='string'&&routeCoords(x)).slice(0,500),routeTrack:routeTrackFor(p).filter(routeCoords).slice(0,20000)};await namedStore('expeditions','readwrite',s=>s.put(safe));}await reload();await loadExtras();render();toast(`관찰 ${items.length}개 · 탐사 ${projects.length}개를 가져왔어요.`);}catch(e){toast(`가져오기 실패: ${e.message||e}`);}}
async function initAuth(){
 const cfg=window.PM_CONFIG||{};
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient){return;}
 try{
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  state.authClient=client;const {data:{session}}=await client.auth.getSession();state.user=session?.user||null;
  if(state.user){await readProfile();await isMember();}
  client.auth.onAuthStateChange((_evt,session)=>{
   const before=state.user?.id;state.user=session?.user||null;
   setTimeout(async()=>{if(state.user?.id!==before){await readProfile();await isMember();}if(state.tab==='options'||state.tab==='profile')render();},0);
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
   if(data.session){state.user=data.user;await readProfile();await isMember();toast('계정이 생성되었습니다.');}else toast('가입 확인 이메일을 확인해 주세요.');
  }else{
   const {error}=await state.authClient.auth.signInWithPassword({email,password});if(error)throw error;
   await readProfile();await isMember();toast('로그인했습니다.');
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
async function signOut(){if(!state.authClient)return;const {error}=await state.authClient.auth.signOut();if(error)return toast(error.message);state.user=null;state.profile=null;state.member=false;state.sharedRecords=[];if(state.realtimeChannel)await state.authClient.removeChannel(state.realtimeChannel);state.realtimeChannel=null;render();toast('로그아웃했습니다.');}
async function deleteAccount(){
 if(!state.authClient||!state.user)return;
 if(!confirm('계정을 삭제하면 복구할 수 없습니다. 서버에 저장된 계정 정보가 삭제됩니다. 계속할까요?'))return;
 if(prompt('회원 탈퇴를 확인하려면 DELETE를 입력하세요.')!=='DELETE')return;
 const cfg=window.PM_CONFIG;
 const {data,error}=await state.authClient.functions.invoke(cfg.accountDeletionFunction||'delete-account',{method:'POST',body:{confirm:'DELETE'}});
 if(error||!data?.deleted)return toast('계정 삭제 함수를 사용할 수 없습니다. 관리자 서버 설정을 확인해 주세요.');
 await state.authClient.auth.signOut();state.user=null;state.profile=null;render();toast('계정 삭제가 완료됐습니다. 기기에 저장된 관찰 기록은 유지됩니다.');
}
// BETA 04: offline drafts, expeditions, full-screen map, photo viewer and invited online beta.
function namedStore(store,mode,callback){return new Promise((resolve,reject)=>{
 if(!state.db){reject(Error('기기 저장소를 사용할 수 없습니다.'));return;}
 const tx=state.db.transaction(store,mode),request=callback(tx.objectStore(store));
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.onerror=()=>reject(tx.error);
});}
async function loadExtras(){
 state.projects=(await namedStore('expeditions','readonly',s=>s.getAll())).sort((a,b)=>a.name.localeCompare(b.name));
 state.draft=await namedStore('drafts','readonly',s=>s.get('current'))||null;
}
async function saveExpedition(form){
 const name=txt(form.elements.name.value);if(!name)return;
 const p={id:'EXP-'+Date.now(),name,country:txt(form.elements.country.value),locality:txt(form.elements.locality.value),createdAt:new Date().toISOString(),routeStops:[],routeTrack:[]};
 await namedStore('expeditions','readwrite',s=>s.put(p));await loadExtras();render();toast('탐사 프로젝트를 추가했어요.');
}
function draftPayload(){
 const form=$('#observation-form');if(!form)return null;
 return {id:'current',editingId:state.editingId||null,fields:Object.fromEntries(new FormData(form).entries()),photoData:state.photoData,savedAt:new Date().toISOString()};
}
async function saveDraftSoon(immediate=false){
 const data=draftPayload();if(!data)return;
 clearTimeout(state.draftTimer);const save=async()=>{try{await namedStore('drafts','readwrite',s=>s.put(data));state.draft=data;const label=$('#draft-status');if(label)label.textContent='자동 저장됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});}catch(e){console.warn('Draft save failed',e);}};
 if(immediate)await save();else state.draftTimer=setTimeout(save,650);
}
function restoreDraft(force=false){
 const form=$('#observation-form'),d=state.draft;if(!form||!d||(d.editingId&&!force))return;
 for(const [key,value] of Object.entries(d.fields||{})){
  const field=form.elements.namedItem(key);if(!field)continue;
  if(field instanceof RadioNodeList){for(const radio of field)radio.checked=radio.value===value;}
  else if(field.type==='checkbox')field.checked=!!value;
  else if(field.type!=='file')field.value=String(value);
 }
 if(isSafePhoto(d.photoData)){state.photoData=d.photoData;const area=$('#photo-box');if(area)area.innerHTML=`<img alt="자동 복구된 식물 사진" src="${d.photoData}"/>`;const rm=$('[data-action="remove-photo"]');if(rm)rm.disabled=false;}
 const label=$('#draft-status');if(label)label.textContent='이전 입력 내용 자동 복구됨';
}
async function clearDraft(){clearTimeout(state.draftTimer);state.draft=null;try{await namedStore('drafts','readwrite',s=>s.delete('current'));}catch(e){console.warn(e);}}
function selectSpot(id){state.selectedMap=id;const popup=$('#map-pin-popup');if(popup){popup.innerHTML=pinSummary();popup.classList.remove('hidden');}}
function setFullscreenMap(open){
 state.fullMap=open;state.tab='map';render();
 if(open)toast('지도를 드래그하거나 두 손가락으로 확대할 수 있습니다.');
}
function closeSpot(){state.selectedMap=null;const pop=$('#map-pin-popup');if(pop)pop.classList.add('hidden');}
function openPhotoViewer(id){
 const r=getRecord(id),src=photoSource(r);if(!src)return;
 const holder=$('#image-lightbox');holder.innerHTML=`<div class="photo-viewer-bar"><span>${esc(r.scientificName||'PHOTO')}</span><button type="button" data-action="photo-close" aria-label="사진 닫기">✕ 닫기</button></div><div class="photo-viewer-canvas"><img id="zoomed-photo" alt="확대된 관찰 식물 사진" src="${esc(src)}"/></div><div class="photo-viewer-note">두 손가락으로 확대·축소 · 드래그하여 이동</div>`;
 holder.classList.remove('hidden');holder.setAttribute('aria-hidden','false');document.body.classList.add('viewer-open');
 const photo=$('#zoomed-photo'),active=new Map();let scale=1,dx=0,dy=0,last=null,originDist=0,originScale=1;
 const update=()=>photo.style.transform=`translate(${dx}px, ${dy}px) scale(${scale})`;
 photo.addEventListener('pointerdown',e=>{photo.setPointerCapture(e.pointerId);active.set(e.pointerId,{x:e.clientX,y:e.clientY});if(active.size===1)last={x:e.clientX,y:e.clientY};if(active.size===2){const [a,b]=[...active.values()];originDist=Math.hypot(a.x-b.x,a.y-b.y);originScale=scale;last=null;}});
 photo.addEventListener('pointermove',e=>{const old=active.get(e.pointerId);if(!old)return;active.set(e.pointerId,{x:e.clientX,y:e.clientY});if(active.size===2){const [a,b]=[...active.values()];scale=Math.max(1,Math.min(7,originScale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,originDist)));update();}else if(active.size===1&&last&&scale>1){dx+=e.clientX-last.x;dy+=e.clientY-last.y;update();}last={x:e.clientX,y:e.clientY};});
 const end=e=>{active.delete(e.pointerId);last=null;};photo.addEventListener('pointerup',end);photo.addEventListener('pointercancel',end);
 photo.addEventListener('dblclick',()=>{scale=scale>1?1:2.5;dx=0;dy=0;update();});
 photo.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(1,Math.min(7,scale*(e.deltaY<0?1.2:1/1.2)));if(scale===1){dx=0;dy=0;}update();},{passive:false});
}
function closePhotoViewer(){const holder=$('#image-lightbox');holder.classList.add('hidden');holder.setAttribute('aria-hidden','true');holder.innerHTML='';document.body.classList.remove('viewer-open');}
function invitedNotice(){return state.authClient?(!state.user?'로그인하면 초대 여부를 확인합니다.':state.member?'초대된 테스터 · 온라인 공유 가능':'이 계정은 아직 테스트 초대 승인을 받지 않았습니다.'):'온라인 미연결 · Supabase 설정 후 사용 가능';}
function rowFromRecord(r){
 const p=publicPoint(r);
 return {id:r.id,owner_id:state.user.id,scientific_name:r.scientificName||'미동정 식물',family:r.family||null,country:r.country||null,locality:r.privacy==='public'?(r.locality||null):null,
  latitude:p?.latitude??null,longitude:p?.longitude??null,privacy:r.privacy||'private',elevation:r.elevation??null,habitat:r.habitat||null,habit:r.habit||null,
  substrate:r.substrate||null,phenology:r.phenology||null,lux:r.lux===''?null:r.lux??null,ppfd:r.ppfd===''?null:r.ppfd??null,
  temperature:r.temperature===''?null:r.temperature??null,humidity:r.humidity===''?null:r.humidity??null,
  observed_at:r.observedAt||new Date().toISOString(),notes:r.notes||null,identification_status:r.identificationStatus||'unidentified',
  measurement_source:r.measurementSource||'not-recorded',measurement_device:r.measurementDevice||null,measured_at:r.measuredAt||null,
  photo_path:r.photoPath||null,updated_at:new Date().toISOString()};
}
function fromCloud(row, photoUrl, privateCoords){
 return {id:row.id,isCloud:true,onlinePublished:true,ownerId:row.owner_id,photoPath:row.photo_path||null,photoUrl:photoUrl||null,
 scientificName:row.scientific_name,family:row.family,country:row.country,locality:row.locality,privacy:row.privacy,
 latitude:privateCoords?.latitude??row.latitude,longitude:privateCoords?.longitude??row.longitude,
 gpsAccuracy:privateCoords?.gps_accuracy??null,elevation:row.elevation,habitat:row.habitat,habit:row.habit,substrate:row.substrate,
 phenology:row.phenology,lux:row.lux,ppfd:row.ppfd,temperature:row.temperature,humidity:row.humidity,
 observedAt:row.observed_at,updatedAt:row.updated_at,notes:row.notes,identificationStatus:row.identification_status,
 measurementSource:row.measurement_source,measurementDevice:row.measurement_device,measuredAt:row.measured_at,suggestions:[]};
}
async function resolveSignedPhoto(path){
 if(!path||!state.authClient)return null;
 try{const {data,error}=await state.authClient.storage.from('field-photos').createSignedUrl(path,3600);if(error)throw error;return data.signedUrl;}catch(e){console.warn('Signed image error',e);return null;}
}
async function loadSharedRecords(){
 if(!state.member||!state.authClient||!navigator.onLine)return;
 const client=state.authClient;
 const {data,error}=await client.from('field_observations').select('*').order('observed_at',{ascending:false}).limit(300);
 if(error){state.onlineError=error.message;console.warn(error);return;}
 const mine=(data||[]).filter(r=>r.owner_id===state.user.id).map(r=>r.id);
 let exactById={};
 if(mine.length){const {data:coordinates,error:privateErr}=await client.from('field_private_locations').select('observation_id,latitude,longitude,gps_accuracy').in('observation_id',mine);if(!privateErr)exactById=Object.fromEntries((coordinates||[]).map(x=>[x.observation_id,x]));}
 const urls=await Promise.all((data||[]).map(r=>resolveSignedPhoto(r.photo_path)));
 const {data:identifications,error:idError}=await client.from('field_identifications').select('observation_id,proposed_name,created_at').order('created_at',{ascending:true}).limit(1000);
 const byObservation={};if(!idError)for(const s of identifications||[]){(byObservation[s.observation_id]??=[]).push({name:s.proposed_name,author:'테스터',at:s.created_at});}
 state.sharedRecords=(data||[]).map((r,i)=>({...fromCloud(r,urls[i],r.owner_id===state.user.id?exactById[r.id]:null),suggestions:byObservation[r.id]||[]}));
 if(state.tab==='map'||state.tab==='home'||state.tab==='profile')render();
}
async function isMember(){
 state.member=false;
 if(!state.authClient||!state.user)return;
 const {data,error}=await state.authClient.rpc('is_beta_member');
 if(error){state.onlineError=error.message;console.warn('Member check',error);return;}
 state.member=data===true;
 if(state.member){await loadSharedRecords();subscribeShared();syncPendingRecords().catch(console.warn);}
}
function subscribeShared(){
 if(!state.member||!state.authClient||state.realtimeChannel)return;
 state.realtimeChannel=state.authClient.channel('pm-beta-observations')
  .on('postgres_changes',{event:'*',schema:'public',table:'field_observations'},()=>loadSharedRecords().catch(console.warn))
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'field_identifications'},()=>loadSharedRecords().catch(console.warn))
  .subscribe();
}
async function publishRecord(id){
 if(!state.member||!state.user)return toast('온라인 공유를 사용하려면 승인된 계정으로 로그인해 주세요.');
 let r=getRecord(id);if(!r||!canEdit(r))return;
 const exposure=r.privacy==='public'?'선택한 정확한 GPS 좌표':r.privacy==='coarse'?'일반화된 GPS 좌표':'지도 핀 없이 관찰 정보만';
 if(!confirm(`이 관찰 기록을 초대된 테스터들에게 공유할까요?\n공유 위치: ${exposure}\n\n현장 메모·사진 속 위치 단서도 다른 테스터에게 보일 수 있습니다.`))return;
 if(!state.records.some(x=>x.id===id)){r={...r,isCloud:false,photoData:null};await storeRecord(r);}
 await storeRecord({...r,onlinePublished:true,syncPending:true});
 closeDetail();render();toast('온라인 공유 대기열에 추가했어요.');
 if(navigator.onLine)await syncPendingRecords();
}
async function syncPendingRecords(){
 if(!state.member||!state.user||!navigator.onLine||state.onlineBusy)return;
 state.onlineBusy=true;
 try{
  const pending=state.records.filter(r=>r.syncPending&&r.onlinePublished);
  for(const r of pending){
   try{
    let path=r.photoPath||null;
    if(isSafePhoto(r.photoData)){
     const blob=await (await fetch(r.photoData)).blob();path=`${state.user.id}/${r.id}.jpg`;
     const {error:uploadError}=await state.authClient.storage.from('field-photos').upload(path,blob,{contentType:'image/jpeg',upsert:true});if(uploadError)throw uploadError;
    }
    const row=rowFromRecord({...r,photoPath:path});
    const {error}=await state.authClient.from('field_observations').upsert(row,{onConflict:'id'});if(error)throw error;
    // Exact GPS is never stored in the group-readable observation table unless the user explicitly selected public.
    if(Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)){
     const {error:coordinateError}=await state.authClient.from('field_private_locations').upsert({observation_id:r.id,owner_id:state.user.id,latitude:r.latitude,longitude:r.longitude,gps_accuracy:r.gpsAccuracy??null},{onConflict:'observation_id'});
     if(coordinateError)throw coordinateError;
    }
    await storeRecord({...r,photoPath:path,syncPending:false,onlinePublished:true});
   }catch(e){state.onlineError=e.message||String(e);console.warn('Upload pending',e);toast('동기화 일부 실패: 서버 설정과 네트워크를 확인해 주세요.');break;}
  }
  await loadSharedRecords();
 }finally{state.onlineBusy=false;}
}
async function submitOnlineSuggestion(id,name){
 if(!state.member||!state.user)throw Error('초대받은 계정만 동정 의견을 공유할 수 있습니다.');
 const {error}=await state.authClient.from('field_identifications').insert({observation_id:id,proposed_name:name,author_id:state.user.id});
 if(error)throw error;
 await loadSharedRecords();
}
async function loadIdentificationHistory(id){
 if(!state.member||!state.authClient)return;
 const {data,error}=await state.authClient.from('field_identifications').select('proposed_name,created_at').eq('observation_id',id).order('created_at',{ascending:true});
 if(error)return;
 const r=getRecord(id);if(r){r.suggestions=(data||[]).map(x=>({name:x.proposed_name,author:'테스터',at:x.created_at}));}
}

async function removeObservation(id){
 const r=getRecord(id);if(!canEdit(r))throw Error('삭제할 권한이 없습니다.');
 if(r.onlinePublished&&state.member&&state.authClient&&navigator.onLine){
  const {error}=await state.authClient.from('field_observations').delete().eq('id',id).eq('owner_id',state.user.id);
  if(error)throw error;
  if(r.photoPath)await state.authClient.storage.from('field-photos').remove([r.photoPath]);
 }else if(r.onlinePublished)throw Error('온라인 공유 기록을 삭제하려면 인터넷 연결이 필요합니다.');
 if(state.records.some(x=>x.id===id))await deleteRecord(id);
 state.sharedRecords=state.sharedRecords.filter(x=>x.id!==id);
}
function openHomePhoto(){
 const viewer=$('#image-lightbox');viewer.innerHTML='<div class="photo-viewer-bar"><span>BOTANICAL FIELD NOTES · REFERENCE</span><button type="button" data-action="photo-close">✕ 닫기</button></div><div class="photo-viewer-canvas"><img src="./assets/staurogyne-reference.jpg" alt="식물 자료 사진" style="max-width:100%;max-height:100%;object-fit:contain"/></div>';
 viewer.classList.remove('hidden');viewer.setAttribute('aria-hidden','false');document.body.classList.add('viewer-open');
}

// Event delegation keeps the static app dependency-free and compatible with GitHub Pages.
document.addEventListener('click',async event=>{
 const navBtn=event.target.closest('[data-nav]');if(navBtn){nav(navBtn.dataset.nav);return;}
 const pin=event.target.closest('[data-map-id]');if(pin){if(state.tab==='home'){state.fullMap=true;state.tab='map';render();}selectSpot(pin.dataset.mapId);return;}
 const imageHit=event.target.closest('.record-card .botanical,.spot-card .botanical');if(imageHit&&imageHit.dataset.photoId){openPhotoViewer(imageHit.dataset.photoId);return;}
 const rec=event.target.closest('[data-detail]');if(rec){detail(rec.dataset.detail);return;}
 const edit=event.target.closest('[data-edit]');if(edit){editRecord(edit.dataset.edit);return;}
 const filter=event.target.closest('[data-filter]');if(filter){state.onlyMine=filter.dataset.filter==='mine';render();return;}
 const del=event.target.closest('[data-delete]');if(del){if(confirm('이 관찰 기록을 삭제할까요? 온라인 공유 중인 기록은 테스트 그룹에서도 삭제됩니다.'))try{await removeObservation(del.dataset.delete);closeDetail();render();toast('기록을 삭제했습니다.')}catch(e){toast('삭제에 실패했습니다: '+e.message);}return;}
 const action=event.target.closest('[data-action]');if(!action){if(event.target.closest('.map-frame')&&!event.target.closest('.leaflet-control')){if(!state.fullMap)setFullscreenMap(true);}return;}
 switch(action.dataset.action){
  case 'close':closeDetail();break;
  case 'expand-map':setFullscreenMap(true);break;
  case 'collapse-map':setFullscreenMap(false);break;
  case 'close-pin':closeSpot();break;
  case 'map-filter-mine':state.onlyMine=!state.onlyMine;render();break;
  case 'photo-view':openPhotoViewer(action.dataset.photoId);break;
  case 'photo-close':closePhotoViewer();break;
  case 'home-photo':openHomePhoto();break;
  case 'project-route':if(state.routeTrackingId!==null)stopRouteTracking(false);state.activeExpeditionId=action.dataset.projectId;state.tab='profile';render();break;
  case 'route-close':if(state.routeTrackingId!==null)stopRouteTracking(false);state.activeExpeditionId=null;render();break;
  case 'route-edit':routeEditStop(Number(action.dataset.index));break;
  case 'route-move-up':await routeReorderStop(Number(action.dataset.index),-1);break;
  case 'route-move-down':await routeReorderStop(Number(action.dataset.index),1);break;
  case 'route-delete':await routeRemoveStop(Number(action.dataset.index));break;
  case 'route-gps':routeUseGPS();break;
  case 'route-clear-form':$('#route-stop-form')?.reset();if($('#route-save-btn'))$('#route-save-btn').textContent='＋ 지점 저장 및 경로 연결';break;
  case 'route-track-start':startRouteTracking();break;
  case 'route-track-stop':stopRouteTracking();break;
  case 'route-export-gpx':exportRouteGPX();break;
  case 'project-use':state.editingId=null;state.photoData=null;state.tab='record';render();const f=$('#observation-form');if(f)f.elements.projectId.value=action.dataset.projectId;saveDraftSoon();break;
  case 'share-record':await publishRecord(action.dataset.recordId);break;
  case 'sync-now':await syncPendingRecords();toast('온라인 동기화를 확인했습니다.');break;
  case 'camera':$('#camera-input')?.click();break;
  case 'gallery':$('#gallery-input')?.click();break;
  case 'remove-photo':state.photoData=null;saveDraftSoon();$('#photo-box').innerHTML='<span class="photo-symbol">✳</span><strong>사진 없음</strong><span>사진을 다시 추가할 수 있습니다.</span>';action.disabled=true;break;
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
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeDetail();closePhotoViewer();if(state.fullMap)setFullscreenMap(false);}if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-map-id]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
document.addEventListener('input',event=>{if(event.target.id==='search'){state.search=event.target.value;clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{const pos=event.target.selectionStart??state.search.length;render();const field=$('#search');if(field){field.focus();field.setSelectionRange(pos,pos);}},350);}if(event.target.closest('#observation-form'))saveDraftSoon();});
document.addEventListener('change',event=>{if(event.target.closest('#observation-form'))saveDraftSoon();if(event.target.name==='projection'){
  state.projection=event.target.value==='mercator'?'mercator':'equal-earth';localStorage.setItem('pm-map-projection',state.projection);
  state.detailMode=false;state.equalZoom=1;state.equalCenter={x:450,y:225};render();toast(`${MAP_NAMES[state.projection]}로 변경했습니다.`);return;}
if(event.target.id==='gallery-input'||event.target.id==='camera-input'){choosePhoto(event.target.files?.[0]);event.target.value='';}if(event.target.id==='import-input'){importRecords(event.target.files?.[0]);event.target.value='';}});
document.addEventListener('submit',event=>{if(event.target.id==='project-form'){event.preventDefault();saveExpedition(event.target).catch(e=>toast(e.message));}if(event.target.id==='route-stop-form'){event.preventDefault();saveRouteStop(event.target).catch(e=>toast(e.message));}if(event.target.id==='observation-form'){event.preventDefault();saveForm(event.target);}if(event.target.id==='suggest-form'){event.preventDefault();addSuggestion(event.target);}if(event.target.id==='auth-form'){event.preventDefault();submitAuth(event.target);}if(event.target.id==='profile-form'){event.preventDefault();submitProfile(event.target);}});
(async function init(){
 try{state.db=await openDatabase();await reload();await loadExtras();if(state.draft?.editingId&&state.records.some(r=>r.id===state.draft.editingId)){state.editingId=state.draft.editingId;state.tab='record';}}catch(e){console.error('IndexedDB unavailable',e);toast('기기 저장소를 열 수 없습니다. 사생활 보호 모드 또는 브라우저 설정을 확인하세요.');}
 try{const res=await fetch('./assets/landPath.json');if(!res.ok)throw Error('지도 경계 파일 없음');state.landPath=await res.json();}catch(e){console.error('Map boundary unavailable',e);}
 await initAuth();
 render();
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.tab==='record')saveDraftSoon(true);if(document.hidden&&state.routeTrackingId!==null)stopRouteTracking(false);});
 window.addEventListener('online',()=>{if(state.member){syncPendingRecords().catch(console.warn);loadSharedRecords().catch(console.warn);}toast('인터넷 연결이 복구되었습니다.');});
 if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('ServiceWorker registration failed',e));}
})();

import { applyTranslations, translateText } from './i18n.js';
/** PLANT MATTER RAINFOREST MEMORIES — BETA 15. My plants + wild finds (by country), events and shops. Local-first with an invitation-only online beta. */
const DB_NAME = 'plant-matter-field';
const STORE = 'observations';
const VERSION = 2;
const state = { tab:'home', records:[], sharedRecords:[], projects:[], draft:null, draftTimer:null, fullMap:false, member:false, onlineBusy:false, onlineError:'', realtimeChannel:null, mapPhotoList:[], activeExpeditionId:null, routeMap:null, routeTrackingId:null, routeTrackingProject:null, selectedMap:null, search:'', onlyMine:false, photoData:null, landPath:'', db:null,
  authClient:null, user:null, profile:null, privateSettings:null, authError:'', authLoading:false, authMode:'signin', busy:false, settingsOpen:false, editingId:null };
Object.assign(state,{likes:[],comments:[],places:[],communitySetupRequired:false,communityError:'',selectedVenue:null,editingVenueId:null,feedSort:'popular',locale:localStorage.getItem('pm-language')||(/^ja/i.test(navigator.language)?'ja':/^en/i.test(navigator.language)?'en':'ko')});
Object.assign(state,{pickerMap:null,pickerMarker:null,venueMap:null,venueMarker:null,venueManual:false,placePlants:[],beta07Missing:false,placePlantPhoto:null,addressResults:[],lastGeocode:0,photoUrlCache:{},openPlaceId:null});
Object.assign(state,{people:{},userResults:[],userQuery:'',userSearchState:'',userSearchError:'',dexUserId:null,dex:null,dexRecords:[],dexMap:null,detailBackUser:null,avatarBusy:false,beta08Missing:false});
Object.assign(state,{friendships:[],beta09Missing:false,friendChannel:null,profileView:'me',venuePhotos:[],venuePhotosFor:null});
Object.assign(state,{beta10Missing:false});
Object.assign(state,{expEditor:null,expeditionCreate:false,expLayer:null,expSettingsOpen:false,ppPhotos:[],formPhotos:[],formHabitat:[],mapGroups:{},selectedGroup:null,detailLocMap:null,detailLocRecord:null,coarseMigrated:false});
const translateUI=(root=document)=>applyTranslations(root,state.locale);
const tt=(ko,en,ja)=>state.locale==='en'?en:state.locale==='ja'?ja:ko;

const content = document.querySelector('#content');
const overlay = document.querySelector('#detail-overlay');
const $ = (selector, root=document) => root.querySelector(selector);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt = (v) => String(v ?? '').trim();
const show = (v) => v === '' || v === null || v === undefined ? '미기록' : esc(v);
const fmt = (v) => { try { return new Date(v).toLocaleDateString(state.locale==='ja'?'ja-JP':state.locale==='en'?'en-US':'ko-KR'); } catch { return '-'; } };
const localDate = () => { const d = new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const numberOrNull = v => v === '' || v === null || v === undefined ? null : Number(v);
const STATUS={unidentified:'미동정',proposed:'동정 제안',review:'검토 중',verified:'동정 완료'};
const DEMO = []; // BETA 12: demo plants removed
const samples=()=>[...state.records.filter(r=>r.syncPending || !state.sharedRecords.some(shared=>shared.id===r.id)),...state.sharedRecords,...DEMO];
const getRecord=id=>samples().find(o=>o.id===id)||state.dexRecords?.find(o=>o.id===id);
const canEdit=r=>r&&!r.isDemo&&(state.records.some(x=>x.id===r.id)||(r.isCloud&&r.ownerId===state.user?.id));
const isRemotePhoto=s=>typeof s==='string'&&s.startsWith('https://')&&state.authClient&&s.startsWith(new URL(window.PM_CONFIG.supabaseUrl).origin+'/storage/v1/object/sign/');
const photoSource=r=>isSafePhoto(r?.photoData)?r.photoData:(r?.photoUrl&&isRemotePhoto(r.photoUrl)?r.photoUrl:null);
const photoMarkup=r=>photoSource(r)?`<img src="${esc(photoSource(r))}" alt="관찰 식물 사진"/>`:botanicalSvg;

const toast=(message)=>{const el=$('#toast');el.textContent=translateText(String(message??''),state.locale);el.classList.remove('hidden');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.add('hidden'),4400)};
function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{for(const name of [STORE,'expeditions','drafts'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbAction(mode, callback){return new Promise((resolve,reject)=>{if(!state.db){reject(new Error('IndexedDB를 사용할 수 없습니다.'));return;}const tx=state.db.transaction(STORE,mode);const req=callback(tx.objectStore(STORE));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);});}
async function reload(){state.records=(await dbAction('readonly',store=>store.getAll())).sort((a,b)=>new Date(b.observedAt)-new Date(a.observedAt));}
async function storeRecord(record){await dbAction('readwrite', store=>store.put(record));await reload();}
async function deleteRecord(id){await dbAction('readwrite',store=>store.delete(id));await reload();}
const botanicalSvg=`<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><path d="M59 110Q53 82 62 54Q66 40 77 30" stroke="#285943" stroke-width="3"/><path d="M62 76Q25 43 19 56Q19 82 62 76M64 61Q97 28 104 40Q104 61 64 61" fill="#658b68"/><path d="M70 43Q45 7 36 18Q39 43 70 43" fill="#90af88"/><path d="M62 92Q84 73 98 80Q94 103 62 92" fill="#6e9b78"/></svg>`;
function isSafePhoto(s){return typeof s==='string'&&/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(s);}
function artwork(r){return `<div class="botanical" ${photoSource(r)?`data-action="photo-view" data-photo-id="${esc(r.id)}" role="button" aria-label="사진 확대"`:''}>${photoMarkup(r)}</div>`;}


function requireCommunity(){if(!state.user||!state.member){toast(tt('좋아요와 댓글은 승인된 베타 멤버만 사용할 수 있습니다.','Likes and comments require an approved beta account.','承認済みのベータアカウントが必要です。'));return false;}if(state.communitySetupRequired){toast(tt('먼저 Supabase에 BETA06 SQL을 적용하세요.','Apply the BETA06 database SQL first.','まずBETA06のSQLを適用してください。'));return false;}if(!navigator.onLine){toast(tt('인터넷 연결이 필요합니다.','Internet connection is required.','インターネット接続が必要です。'));return false;}return true;}
async function toggleLike(id){
 if(!requireCommunity())return;
 const was=likedByMe(id);const c=state.authClient.from('field_likes');const {error}=was?await c.delete().eq('observation_id',id).eq('user_id',state.user.id):await c.insert({observation_id:id,user_id:state.user.id});
 if(error){toast(error.message);return;}
 await loadCommunity();if(!overlay.classList.contains('hidden')&&getRecord(id))detail(id);else render();
}
function observationSocialSection(r){
 if(r.isDemo||!(r.isCloud||(r.onlinePublished&&!r.syncPending)))return '';
 const list=state.comments.filter(c=>c.observation_id===r.id);
 return `<div class="detail-section community-section" id="comment-section"><h2>${tt('댓글과 좋아요','LIKES & COMMENTS','いいね・コメント')}</h2>${socialButtons(r)}<div class="comment-list">${list.length?list.map(c=>`<div class="comment-row"><div><button type="button" class="link-button" data-action="user-open" data-user-id="${esc(c.author_id)}">${esc(state.authorNames?.[c.author_id]||tt('멤버','Member','メンバー'))}</button><small>${fmt(c.created_at)}</small><p>${esc(c.body)}</p></div>${c.author_id===state.user?.id?`<button type="button" class="comment-delete" data-action="delete-comment" data-comment-id="${esc(c.id)}" aria-label="Delete">✕</button>`:''}</div>`).join(''):`<p class="mini-muted">${tt('아직 댓글이 없습니다.','No comments yet.','まだコメントはありません。')}</p>`}</div><form id="comment-form"><input type="hidden" name="recordId" value="${esc(r.id)}"/><label class="form-field"><span>${tt('간단한 댓글 남기기','ADD A COMMENT','コメントを追加')}</span><textarea name="body" rows="2" maxlength="500" required placeholder="${tt('식물에 대한 생각을 남겨보세요.','Share a thought about this plant.','植物についてコメントしましょう。')}"></textarea></label><button type="submit" class="light-button wide">${tt('댓글 등록','POST COMMENT','コメントを投稿')}</button></form><p class="footnote">${tt('야생식물의 정확한 발견 좌표나 채집 장소는 댓글에 공개하지 마세요.','Do not reveal exact locations of rare wild plants in comments.','希少な野生植物の正確な場所を投稿しないでください。')}</p></div>`;
}
async function addComment(form){if(!requireCommunity())return;const id=form.elements.recordId.value,body=txt(form.elements.body.value);if(!body||body.length>500)return;const button=form.querySelector('[type=submit]');button.disabled=true;
 try{const {error}=await state.authClient.from('field_comments').insert({observation_id:id,author_id:state.user.id,body});if(error)throw error;await loadCommunity();detail(id);toast(tt('댓글을 등록했습니다.','Comment posted.','コメントを投稿しました。'));}catch(e){toast(e.message)}finally{button.disabled=false;}}
async function deleteComment(id){if(!requireCommunity())return;if(!confirm(tt('댓글을 삭제할까요?','Delete this comment?','コメントを削除しますか？')))return;const old=state.comments.find(x=>x.id===id);if(!old||old.author_id!==state.user.id)return;const {error}=await state.authClient.from('field_comments').delete().eq('id',id).eq('author_id',state.user.id);if(error)return toast(error.message);await loadCommunity();detail(old.observation_id);}
// BETA 07 — BOTANICAL PLACES: address search registration + separately managed plant inventory.
const SQL07_NOTICE=()=>tt('먼저 Supabase에 BETA 07 SQL(supabase/beta07_private_places.sql)을 적용하세요.','Apply the BETA 07 database SQL (supabase/beta07_private_places.sql) first.','まずBETA 07のSQL（supabase/beta07_private_places.sql）を適用してください。');
function rangeText(a,b,unit){
 const has=v=>v!==null&&v!==undefined&&v!=='';
 if(!has(a)&&!has(b))return tt('미기록','Not recorded','未記録');
 if(has(a)&&has(b))return Number(a)===Number(b)?`${a}${unit}`:`${a}–${b}${unit}`;
 return has(a)?`${a}${unit} ${tt('이상','or above','以上')}`:`${b}${unit} ${tt('이하','or below','以下')}`;
}
const newUuid=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
function likeCount(id){return state.likes.filter(x=>x.observation_id===id).length;}
function commentCount(id){return state.comments.filter(x=>x.observation_id===id).length;}
function likedByMe(id){return state.likes.some(x=>x.observation_id===id&&x.user_id===state.user?.id);}
function socialButtons(record){
 if(record.isDemo||!(record.isCloud||(record.onlinePublished&&!record.syncPending)))return '';
 const id=esc(record.id),liked=likedByMe(record.id);
 return `<div class="social-actions"><button type="button" data-action="like" data-record-id="${id}" class="social-button ${liked?'liked':''}" aria-pressed="${liked}" aria-label="${tt('좋아요','Like','いいね')}">${liked?'♥':'♡'} <span>${likeCount(record.id)}</span></button><button type="button" data-action="open-comments" data-record-id="${id}" class="social-button" aria-label="${tt('댓글 보기','View comments','コメントを見る')}">◻ <span>${commentCount(record.id)}</span></button></div>`;
}


function fieldInput(name,label,placeholder='',type='text',extra=''){return `<label class="form-field"><span>${label}</span><input name="${name}" type="${type}" placeholder="${esc(placeholder)}" ${extra}/></label>`;}
function fieldSelect(name,label,options){return `<label class="form-field"><span>${label}</span><select name="${name}">${options.map(([val,label],i)=>`<option value="${esc(val)}" ${i===0?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;}
// EXPEDITION ROUTES: private local-first waypoints + optional foreground GPS trail.
// Connecting points is a recorded itinerary, NOT a calculated road/trail route.
const routeStopsFor=p=>Array.isArray(p?.routeStops)?p.routeStops:[];

function consentRows(profileMode=false) {
 const checked=(name)=>profileMode && state.privateSettings?.[name] ? 'checked' : '';
 return `<div class="form-section"><h2>CONSENT &amp; PRIVACY</h2>
 <label class="consent-item"><input type="checkbox" name="termsAccepted" ${profileMode&&state.privateSettings?.accepted_terms_at?'checked':''} required/><span><b>[필수] 서비스 이용약관</b><small>관찰 기록 공유, 지식재산권 및 서비스 이용 규칙 <a href="./terms.html" target="_blank" rel="noopener">내용 보기</a></small></span></label>
 <label class="consent-item"><input type="checkbox" name="privacyAccepted" ${profileMode&&state.privateSettings?.accepted_privacy_at?'checked':''} required/><span><b>[필수] 개인정보 처리 안내 확인</b><small>계정 정보, 사진, GPS·민감한 자생지 좌표의 처리 <a href="./privacy.html" target="_blank" rel="noopener">내용 보기</a></small></span></label>
 <label class="consent-item"><input type="checkbox" name="photoPromotionConsent" ${checked('photo_promotion_consent')}/><span><b>[선택] 업로드 이미지의 홍보·광고 활용 동의</b><small>PLANT MATTER의 웹사이트·SNS·홍보물에 사진을 활용하도록 별도로 허락합니다. 동의하지 않아도 앱 이용과 관찰 기록 공유가 가능합니다. 철회 가능하며, 이용 범위는 실제 약관에 명시해야 합니다.</small></span></label>
 </div>`;
}
function accountEditor(){
 const email=state.user?.email||'';const profile=state.profile||{},priv=state.privateSettings||{},first=!profile.onboarding_completed;
 return `<div class="option-section"><h2>${first?'WELCOME / FIRST TIME SETUP':'ACCOUNT MANAGEMENT'}</h2>
 ${first?'<div class="profile-onboarding"><h2>기본 정보를 설정해 주세요.</h2><p class="setting-description">Google 또는 이메일 로그인은 완료됐어요. 공개 이름과 연락처 공개 여부, 이용 동의를 설정하면 앱을 사용할 수 있어요.</p></div>':''}
 ${state.authError?`<div class="login-error">${esc(state.authError)}<br>테이블 권한 오류라면 README에 포함된 <code>beta05_auth_repair.sql</code>을 Supabase SQL Editor에서 실행해 주세요.</div>`:''}
 <p class="setting-description">${tt('로그인 계정','Signed in as','ログイン中')}: ${esc(email)}</p><form id="profile-form">
 <label class="form-field"><span>앱에 표시할 이름 *</span><input name="displayName" minlength="2" maxlength="30" required autocomplete="nickname" value="${esc(profile.display_name||state.user?.user_metadata?.display_name||'')}" placeholder="이름 또는 닉네임"/><small id="name-hint" class="name-hint">${NAME_RULE()}</small></label>
 <label class="form-field"><span>Google / 이메일 로그인 주소 (변경 불가)</span><input class="readonly-input" type="email" value="${esc(email)}" readonly/></label>
 <label class="form-field"><span>전화번호 (선택)</span><input name="phone" type="tel" inputmode="tel" maxlength="25" autocomplete="tel" value="${esc(priv.phone||'')}" placeholder="010-0000-0000"/><small>입력하지 않아도 가입할 수 있어요.</small></label>
 <label class="consent-item"><input type="checkbox" name="emailVisible" ${profile.email_visible?'checked':''}/><span><b>이메일 주소 공개</b><small>기본 비공개 · 테스트 그룹에 내 이메일 표시</small></span></label>
 <label class="consent-item"><input type="checkbox" name="phoneVisible" ${priv.phone_visible?'checked':''}/><span><b>전화번호 공개</b><small>기본 비공개 · 테스트 그룹에 내 전화번호 표시</small></span></label>
 ${consentRows(true)}<button class="primary-button wide" type="submit">${first?'설정 완료하고 시작하기':'계정 설정 저장'}</button></form>
 <div class="settings-actions"><button class="light-button wide" type="button" data-action="signout">로그아웃</button><button class="danger-button wide" type="button" data-action="delete-account">회원 탈퇴</button></div>
 <div class="info warning">회원 탈퇴는 서버 삭제 함수가 따로 배포되어야 동작해요. 사진·GPS를 포함한 기기 데이터는 별도 삭제가 필요합니다.</div></div>`;
}
function authPanel(){
 if(!state.authClient)return `<div class="option-section"><h2>GOOGLE / EMAIL ACCOUNT</h2><div class="info warning">인증 서버 미연결 · config.js의 공개 URL/키를 확인해 주세요.</div></div>`;
 if(state.user)return accountEditor();
 const signup=state.authMode==='signup';
 return `<div class="option-section"><h2>${signup?'CREATE ACCOUNT':'SIGN IN'}</h2>
 ${state.authError?`<div class="login-error">${esc(state.authError)}<button class="light-button wide" data-action="auth-retry" type="button">다시 시도하기</button></div>`:''}
 <button type="button" class="google-button" data-action="google-login" ${state.authLoading?'disabled':''}>${state.authLoading?'Google 로그인 연결 중…':'Google 계정으로 계속하기'}</button>
 <p class="divider-label">또는 이메일</p><form id="auth-form">
 <label class="form-field"><span>이메일</span><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"/></label>
 ${signup?'<label class="form-field"><span>표시 이름</span><input name="displayName" maxlength="50" required placeholder="앱에서 사용할 이름"/></label>':''}
 <label class="form-field"><span>비밀번호</span><input name="password" type="password" minlength="8" required autocomplete="${signup?'new-password':'current-password'}" placeholder="8자 이상"/></label>
 ${signup?`<div class="info">이메일 확인 후 첫 로그인 시 프로필 공개 범위와 이용약관 동의를 다시 설정합니다.</div>${consentRows(false)}`:''}
 <button class="primary-button wide" type="submit">${signup?'이메일로 가입하기':'이메일로 로그인'}</button></form>
 <div class="auth-switch"><button type="button" class="text-button" data-action="auth-toggle">${signup?'이미 계정이 있어요 · 로그인':'새 계정 만들기'}</button><button type="button" class="text-button" data-action="reset-password">비밀번호 찾기</button></div>
 <p class="footnote">Google 로그인 완료 후에도 첫 가입 정보 설정이 필요합니다. 실제 온라인 공유는 승인된 테스터만 가능해요.</p></div>`;
}



function toDateTimeLocal(value){
 if(!value)return '';
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function populateEditForm(){
 const r=editableRecord(state.editingId), form=$('#observation-form');
 if(!r||!form)return;
 for(const field of Array.from(form.elements)){
  if(!field.name||field.type==='file'||field.name==='privacy')continue;
  if(!Object.prototype.hasOwnProperty.call(r,field.name))continue;
  const value=(field.name==='observedAt'||field.name==='measuredAt')?toDateTimeLocal(r[field.name]):r[field.name];
  if(value!==null && value!==undefined)field.value=String(value);
 }
 setObservedFields(r.observedAt,r.observedTimeUnknown);
 const privacy=form.querySelector(`input[name="privacy"][value="${['private','coarse','public'].includes(r.privacy)?r.privacy:'private'}"]`);
 if(privacy)privacy.checked=true;
 refreshObsPhotos(false);
 const advancedFields=['lux','ppfd','temperature','humidity','measurementDevice','measuredAt','fieldNumber','collector','population','associatedSpecies','voucher'];
 if(advancedFields.some(k=>r[k]!==null&&r[k]!==undefined&&r[k]!=='')){
  $('#advanced-fields')?.classList.add('open');
  const toggle=$('[data-action="advanced"]');if(toggle)toggle.textContent='− 전문 항목 접기';
 }
}
function editRecord(id){
 const r=editableRecord(id);
 if(!canEdit(r))return toast('본인이 작성한 관찰 기록만 수정할 수 있습니다.');
 closeDetail();state.editingId=id;state.photoData=null;state.formPhotos=recordPlantPhotos(r);state.formHabitat=recordHabitatPhotos(r);state.tab='record';render();
}
function cancelEdit(){clearDraft().catch(console.warn);state.editingId=null;state.photoData=null;state.formPhotos=[];state.formHabitat=[];state.tab='plant';state.plantView='wild';render();}
function recordRow(label,value){return `<div class="detail-row"><span>${label}</span><strong>${show(value)}</strong></div>`;}
function metric(label,value,unit){return `<div class="metric"><small>${label}</small><strong>${value===null||value===undefined||value===''?'미기록':`${esc(value)} ${unit}`}</strong></div>`;}
function detail(id){const r=getRecord(id);if(!r)return;overlay.innerHTML=`<div class="detail-body"><div class="detail-header"><span class="eyebrow">FIELD RECORD / ${esc(r.id)}</span><span class="header-actions">${dexBackButton()}<button type="button" class="close" data-action="close">✕ 닫기</button></span></div>${observationGallery(r)||`<div class="detail-picture ${photoSource(r)?'image-clickable':''}" ${photoSource(r)?`data-action="photo-view" data-photo-id="${esc(r.id)}" role="button" tabindex="0" aria-label="사진 전체 화면 보기"`:''}>${artwork(r)}${photoSource(r)?'<span class="photo-full-hint">⛶ 사진 확대</span>':''}</div>`}${r.isDemo?'<span class="tiny-tag">DEMO · 가상 관찰 데이터</span>':''}<h1>${esc(r.scientificName||'미동정 식물')}</h1><p class="lead">${esc(r.family||tt('과명 미기록','Family not recorded','科名未記録'))} · ${esc(translateText(STATUS[r.identificationStatus]||'미동정',state.locale))}</p>${r.isCloud&&r.ownerId?`<div class="detail-author">${authorChip(r.ownerId)}</div>`:''}<div class="detail-section"><h2>OBSERVATION</h2>${recordRow(tt('관찰 일시','Observed','観察日時'),fmtObserved(r))}${r.updatedAt?recordRow('마지막 수정',new Date(r.updatedAt).toLocaleString('ko-KR')):''}${recordRow(tt('발견 국가','Country','発見国'),findCountryText(r))}${recordRow('해발 고도',r.elevation==null?'미기록':`${r.elevation} m`)}${recordRow('생육 형태',r.habit)}${recordRow('서식지',r.habitat)}${recordRow('기질',r.substrate)}${recordRow('생육 상태',r.phenology)}</div><div class="detail-section"><h2>ENVIRONMENTAL DATA</h2><div class="metrics">${metric('ILLUMINANCE',r.lux,'lx')}${metric('PPFD',r.ppfd,'µmol/m²/s')}${metric('TEMPERATURE',r.temperature,'°C')}${metric('HUMIDITY',r.humidity,'%RH')}</div>${recordRow('측정 근거',({instrument:'기기로 실측',estimated:'추정·외부 자료',sample:'가상 예시',unspecified:'미지정','not-recorded':'미측정'})[r.measurementSource]||'미기록')}${recordRow('측정 장비',r.measurementDevice)}${recordRow('측정 시각',r.measuredAt)}</div><div class="detail-section"><h2>FIELD NOTES</h2><p class="long-text">${esc(r.notes||'현장 메모가 없습니다.')}</p>${recordRow('필드 번호'+(canEdit(r)&&r.fieldNumber?mineTag():''),r.fieldNumber)}${recordRow('관찰자'+(canEdit(r)&&r.collector?mineTag():''),r.collector)}${recordRow('개체군'+(canEdit(r)&&r.population?mineTag():''),r.population)}${recordRow('동반 식생'+(canEdit(r)&&r.associatedSpecies?mineTag():''),r.associatedSpecies)}${recordRow('표본'+(canEdit(r)&&r.voucher?mineTag():''),r.voucher)}${r.editHistory?.length?recordRow('수정 이력',`${r.editHistory.length}회 수정됨`):''}</div>${observationSocialSection(r)}<div class="detail-section"><h2>IDENTIFICATION HISTORY</h2>${identificationActions(r)}${(r.suggestions||[]).map(s=>recordRow(s.name,`${s.author||'내 기기'} · ${fmt(s.at)}`)+(canEdit(r)&&r.identificationStatus!=='verified'?`<button type="button" class="text-button adopt-id" data-action="id-adopt" data-record-id="${esc(r.id)}" data-name="${esc(s.name)}">✓ ${tt('이 학명으로 동정 완료','Adopt this name as identified','この学名で同定済みにする')}</button>`:'')).join('')||'<p class="mini-muted">동정 제안 이력이 없습니다.</p>'}${!r.isDemo?`<form id="suggest-form"><label class="form-field"><span>${r.isCloud||r.onlinePublished?tt('동정 의견 (테스터에게 공유)','Identification (shared with testers)','同定意見（テスターと共有）'):tt('동정 의견 (기기 내 저장)','Identification (saved on this device)','同定意見（端末内に保存）')}</span><input name="name" maxlength="120" placeholder="예: Ficus punctata" required/></label><input type="hidden" name="recordId" value="${esc(r.id)}"/><button type="submit" class="light-button wide">동정 의견 추가</button></form>`:''}</div>${canEdit(r)?`${visibilitySection(r)}<button type="button" class="primary-button wide" data-edit="${esc(r.id)}">이 관찰 기록 수정하기</button>${r.syncPending?'<p class="footnote">온라인 업로드 예약됨 · 인터넷 연결 시 재시도</p>':''}<button type="button" class="light-button wide detail-delete" data-delete="${esc(r.id)}">이 관찰 기록 삭제</button>`:''}<p class="footnote" style="margin-top:20px">${r.isDemo?'이 기록은 실제 식물 분포나 환경 측정값이 아닙니다.':'정확한 좌표는 개인 기기에 저장되며, 온라인 공유 시 선택한 공개 수준에 맞춰 전송됩니다.'}</p></div>`;overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;translateUI(overlay);hydrateSigned(overlay).catch(console.warn);}
function closeDetail(){state.detailBackUser=null;state.dexUserId=null;overlay.classList.add('hidden');overlay.setAttribute('aria-hidden','true');}
async function compressPhoto(file){if(!file||!file.type.startsWith('image/'))throw Error('이미지 파일만 선택할 수 있습니다.');if(file.size>25*1024*1024)throw Error('25MB 이하 사진을 사용해 주세요.');const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));reader.readAsDataURL(file);});const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('사진을 불러오지 못했습니다.'));img.src=source;});/* BETA 12: landscape photos → 16:9, portrait or square → 3:4, centre-cropped, long side ≤ 1600px. */const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,ratio=iw>ih?16/9:3/4;const sw=iw/ih>ratio?ih*ratio:iw,sh=iw/ih>ratio?ih:iw/ratio;const scale=Math.min(1,1600/Math.max(sw,sh));const outW=Math.max(3,Math.round(sw*scale)),outH=Math.max(3,Math.round(sh*scale));const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,outW,outH);ctx.imageSmoothingQuality='high';ctx.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,0,0,outW,outH);return canvas.toDataURL('image/jpeg',.77);}
async function saveForm(form){const data=new FormData(form), get=k=>txt(data.get(k)),lat=get('latitude'),lon=get('longitude');if(!get('scientificName')&&!state.formPhotos.length){toast('식물 사진이나 학명 중 하나는 필수예요.');return;}
 if((lat!==''||lon!=='')&&(lat===''||lon===''||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Number(lat)<-90||Number(lat)>90||Number(lon)<-180||Number(lon)>180)){toast('위도와 경도를 올바르게 입력해 주세요.');return;}
 const numericKeys=['elevation','gpsAccuracy','lux','ppfd','temperature','humidity'];const d=Object.fromEntries(data.entries());for(const key of numericKeys){if(d[key]!==undefined&&d[key]!==''&&!Number.isFinite(Number(d[key]))){toast(`${key} 값을 확인해 주세요.`);return;}}
 const previous=state.editingId?editableRecord(state.editingId):null;
 if(state.editingId&&!previous){toast('수정할 원본 기록을 찾을 수 없습니다.');return;}
 const observedAt=observedFromForm(get('observedDate'),get('observedTime'));
 if(!observedAt){toast(tt('발견 날짜를 입력해 주세요.','Enter the date you found the plant.','発見日を入力してください。'));return;}
 if(new Date(observedAt).getTime()>Date.now()+36e5){toast(tt('미래의 날짜와 시각은 선택할 수 없습니다.','The discovery time cannot be in the future.','未来の日時は選択できません。'));return;}
 const now=new Date().toISOString();
 const record={...previous,...d,id:previous?.id||`PMF-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,isDemo:false,scientificName:get('scientificName')||'미동정 식물',latitude:previous?.latitude??null,longitude:previous?.longitude??null,gpsAccuracy:previous?.gpsAccuracy??null,elevation:numberOrNull(get('elevation')),observedAt,observedTimeUnknown:!get('observedTime'),locationSource:previous?.locationSource??null,createdAt:previous?.createdAt||now,updatedAt:previous?now:null,photos:[...state.formPhotos],habitatPhotos:[...state.formHabitat],photoData:isSafePhoto(state.formPhotos[0])?state.formPhotos[0]:null,photoPath:previous?.photoPath||null,onlinePublished:previous?.onlinePublished||false,syncPending:previous?.onlinePublished||previous?.syncPending||false,identificationStatus:get('identificationStatus')||'unidentified',measurementSource:get('measurementSource')||'not-recorded',suggestions:previous?.suggestions||[]};
 delete record.observedDate;delete record.observedTime;
 {const visibility=get('visibility')||'public';delete record.visibility;record.hidden=visibility==='private';if(state.member&&state.user){record.onlinePublished=true;record.syncPending=true;}}
 record.countryCode=get('countryCode')||null;record.country=record.countryCode?(GEO.byCode[record.countryCode]?.n[0]||get('country')):get('country');record.privacy=previous?.privacy==='private'?'private':'coarse';
 {const localCopy=state.records.find(x=>x.id===record.id);if(localCopy){record.uploadedPhotoMap=localCopy.uploadedPhotoMap;record.cloudPhotoPaths=localCopy.cloudPhotoPaths;}}
 if(['lux','ppfd','temperature','humidity'].some(k=>get(k)!=='')&&record.measurementSource==='not-recorded')record.measurementSource='unspecified';
 if(previous){
  const changedFields=Object.keys(record).filter(k=>!['id','isDemo','createdAt','updatedAt','editHistory','suggestions'].includes(k)&&JSON.stringify(previous[k]??null)!==JSON.stringify(record[k]??null));
  record.editHistory=[...(previous.editHistory||[]),{at:now,changedFields}];
 }
 const btn=$('#save-button');btn.disabled=true;btn.textContent='저장 중…';
 try{await storeRecord(record);await clearDraft();state.editingId=null;state.photoData=null;state.formPhotos=[];state.formHabitat=[];state.tab='plant';state.plantView='wild';render();detail(record.id);if(record.syncPending)syncPendingRecords().catch(console.warn);toast(record.onlinePublished?(navigator.onLine?tt('저장했습니다 · 온라인에 올리는 중','Saved · uploading','保存しました · アップロード中'):tt('이 기기에 저장했습니다 · 인터넷이 연결되면 자동으로 올라갑니다','Saved on this device · uploads when online','端末に保存しました · 接続時に自動アップロード')):(previous?'관찰 기록의 수정 사항을 저장했어요.':'새 관찰 기록을 이 기기에 저장했어요.'));}
 catch(e){btn.disabled=false;btn.textContent=previous?'변경 사항 저장하기':'관찰 기록 저장하기';toast(`저장 실패: ${e.message||e}`);}}
async function addSuggestion(form){const id=form.elements.recordId.value,name=txt(form.elements.name.value),r=getRecord(id);if(!r||r.isDemo||!name)return;const updated={...r,identificationStatus:r.identificationStatus==='verified'?'verified':'proposed',suggestions:[...(r.suggestions||[]),{name,author:'내 기기',at:new Date().toISOString()}]};try{if(r.isCloud||r.onlinePublished){await submitOnlineSuggestion(id,name);detail(id);toast('동정 의견을 공유했어요.');return;}await storeRecord(updated);detail(id);toast('개인 동정 의견을 저장했어요.');}catch(e){toast('동정 의견 저장에 실패했습니다.');}}
function download(name,text){const blob=new Blob([text],{type:name.endsWith('.gpx')?'application/gpx+xml;charset=utf-8':'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),45000);}
function exportRecords(){if(!state.records.length&&!state.projects.length){toast(tt('백업할 기록이 없습니다.','There is nothing to back up yet.','バックアップする記録がありません。'));return;}if(!confirm(tt('백업 파일에는 비공개 기록과 사진, 예전에 저장한 위치 정보가 들어 있을 수 있습니다. 안전한 곳에 보관할까요?','The backup file can include private records, photos and location data saved in earlier versions. Keep it somewhere safe?','バックアップファイルには非公開の記録・写真・以前のバージョンで保存した位置情報が含まれる場合があります。安全な場所に保管しますか？')))return;download(`plant-matter-field-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({app:'PLANT MATTER FIELD',schemaVersion:2,exportedAt:new Date().toISOString(),observations:state.records,expeditions:state.projects},null,2));toast(tt('백업 파일 다운로드를 요청했어요.','Backup download started.','バックアップのダウンロードを開始しました。'));}
async function importRecords(file){if(!file)return;try{if(file.size>40*1024*1024)throw Error('40MB 이하 파일을 사용해 주세요.');const payload=JSON.parse(await file.text());if(payload.app!=='PLANT MATTER FIELD'||!Array.isArray(payload.observations))throw Error('PLANT MATTER FIELD 백업 파일이 아닙니다.');const items=payload.observations.filter(r=>r&&typeof r.id==='string'&&r.id.startsWith('PMF-')&&!r.isDemo&&typeof r.scientificName==='string').slice(0,500);const projects=Array.isArray(payload.expeditions)?payload.expeditions.filter(p=>p&&typeof p.id==='string'&&p.id.startsWith('EXP-')&&typeof p.name==='string').slice(0,200):[];if(!items.length&&!projects.length)throw Error('가져올 유효한 기록이 없습니다.');if(!confirm(tt(`발견 기록 ${items.length}개를 가져옵니다. 같은 ID의 기록은 덮어씁니다. 계속할까요?`,`Import ${items.length} find(s)? Records with the same ID are replaced.`,`発見記録${items.length}件を取り込みます。同じIDの記録は上書きされます。続けますか？`)))return;for(const r of items){const safe={...r};if(!isSafePhoto(safe.photoData))safe.photoData=null;safe.photos=photoList(safe.photos,PLANT_PHOTO_LIMIT);safe.habitatPhotos=photoList(safe.habitatPhotos,HABITAT_PHOTO_LIMIT);safe.suggestions=Array.isArray(safe.suggestions)?safe.suggestions:[];await dbAction('readwrite',s=>s.put(safe));}for(const p of projects){const safe={...p,routeStops:routeStopsFor(p).filter(x=>x&&typeof x.name==='string'&&routeCoords(x)).slice(0,500),routeTrack:routeTrackFor(p).filter(routeCoords).slice(0,20000)};await namedStore('expeditions','readwrite',s=>s.put(safe));}await reload();await loadExtras();render();toast(tt(`발견 기록 ${items.length}개를 가져왔어요.`,`Imported ${items.length} find(s).`,`発見記録${items.length}件を取り込みました。`));}catch(e){toast(`${tt('가져오기 실패','Import failed','取り込み失敗')}: ${e.message||e}`);}}
const authTimeout=(promise,ms=10000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('서버 응답이 늦어 로그인 처리가 중단됐어요. 다시 시도해 주세요.')),ms))]);
function authErrorMessage(error){
 const message=String(error?.message||error||'알 수 없는 오류');
 if(/permission denied for table profiles/i.test(message))return '프로필 데이터베이스 권한이 없습니다. Supabase에 BETA 05 권한 복구 SQL을 적용해 주세요.';
 if(/is_beta_member|schema cache/i.test(message))return '베타 권한 확인 함수가 설치되지 않았어요. BETA 05 권한 복구 SQL을 적용해 주세요.';
 return message;
}
async function initAuth(){
 const cfg=window.PM_CONFIG||{};
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient)return;
 try {
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  state.authClient=client;
  const params=new URLSearchParams(location.search),hashParams=new URLSearchParams(location.hash.slice(1));
  const callbackError=params.get('error_description')||hashParams.get('error_description')||params.get('error')||hashParams.get('error');
  if(callbackError){state.authError='Google 인증 실패: '+callbackError;sessionStorage.removeItem('pm-oauth-started');history.replaceState({},'',location.origin+location.pathname);}
  const result=await authTimeout(client.auth.getSession(),13000);
  if(result.error)throw result.error;
  state.user=result.data.session?.user||null;
  if(state.user){sessionStorage.removeItem('pm-oauth-started');await Promise.allSettled([authTimeout(readProfile(),12000),authTimeout(isMember(),12000),authTimeout(checkAdmin(),12000)]);}
  else {const started=Number(sessionStorage.getItem('pm-oauth-started')||0);if(started&&Date.now()-started>25000){sessionStorage.removeItem('pm-oauth-started');state.authError='Google 로그인이 완료되지 않았습니다. 다시 로그인해 주세요.';}}
  client.auth.onAuthStateChange((event,session)=>{
   const previousId=state.user?.id;state.user=session?.user||null;
   if(event==='SIGNED_IN'){sessionStorage.removeItem('pm-oauth-started');state.authError='';}
   if(event==='SIGNED_OUT'){state.profile=null;state.privateSettings=null;state.member=false;state.friendships=[];state.isAdmin=false;state.categories=[];}
   setTimeout(()=>{
    (async()=>{if(state.user?.id!==previousId){await Promise.allSettled([authTimeout(readProfile(),12000),authTimeout(isMember(),12000),authTimeout(checkAdmin(),12000)]);}if(state.tab!=='record')render();})().catch(e=>{state.authError=authErrorMessage(e);render();});
   },0);
  });
 } catch(e){state.authError=authErrorMessage(e);console.warn('Auth unavailable',e);}
}
async function readProfile(){
 if(!state.authClient||!state.user){state.profile=null;state.privateSettings=null;return;}
 try{
  const {data,error}=await authTimeout(state.authClient.from('profiles').select('*').eq('id',state.user.id).maybeSingle());
  if(error)throw error;
  state.profile=data||null;
  state.beta08Missing=!!state.profile&&!('avatar_path' in state.profile);if(state.profile)rememberPerson(state.profile);state.beta10Missing=!!state.profile&&!('account_type' in state.profile);
  const {data:settings,error:settingsError}=await authTimeout(state.authClient.from('profile_private_settings').select('phone,phone_visible,accepted_terms_at,accepted_privacy_at,photo_promotion_consent').eq('id',state.user.id).maybeSingle());
  if(settingsError)throw settingsError;
  state.privateSettings=settings||null;state.authError='';
 }catch(e){state.authError=authErrorMessage(e);console.warn('Profile fetch',e);state.profile=null;state.privateSettings=null;}
}
async function signInGoogle(){
 if(!state.authClient)return toast('인증 서버가 연결되지 않았습니다.');
 if(state.authLoading)return;
 state.authLoading=true;state.authError='';render();
 try{
  sessionStorage.setItem('pm-oauth-started',String(Date.now()));
  const {error}=await authTimeout(state.authClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,skipBrowserRedirect:false}}),12000);
  if(error)throw error;
 }catch(e){sessionStorage.removeItem('pm-oauth-started');state.authError='Google 로그인 오류: '+authErrorMessage(e);toast(state.authError);}
 finally{state.authLoading=false;render();}
}
async function submitAuth(form){
 if(!state.authClient)return toast('인증 서버 연결이 필요합니다.');
 const btn=form.querySelector('button[type=submit]');btn.disabled=true;
 try{
  const email=form.elements.email.value.trim(),password=form.elements.password.value;
  if(state.authMode==='signup'){
   if(!form.elements.termsAccepted.checked||!form.elements.privacyAccepted.checked)throw Error('필수 이용약관과 개인정보 처리 안내에 동의해 주세요.');
   const name=form.elements.displayName.value.trim();
   const {data,error}=await authTimeout(state.authClient.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:location.origin+location.pathname}}));
   if(error)throw error;
   if(data.session){state.user=data.user;await readProfile();await isMember();toast('계정이 생성되었습니다. 기본 정보를 설정해 주세요.');}
   else toast('가입 확인 이메일을 확인해 주세요. 첫 로그인 시 프로필 동의 설정이 이어집니다.');
  }else{
   const {data,error}=await authTimeout(state.authClient.auth.signInWithPassword({email,password}));if(error)throw error;
   state.user=data.user;await Promise.allSettled([authTimeout(readProfile(),12000),authTimeout(isMember(),12000),authTimeout(checkAdmin(),12000)]);toast('로그인했습니다.');
  }
  state.authError='';render();
 }catch(e){state.authError=authErrorMessage(e);toast(`인증 오류: ${state.authError}`);render();}
 finally{btn.disabled=false;}
}
async function submitProfile(form){
 if(!state.authClient||!state.user)return toast('로그인해 주세요.');
 const display_name=form.elements.displayName.value.trim(),phone=form.elements.phone.value.trim();
 if(!display_name)return toast('표시 이름을 입력해 주세요.');
 const nameIssue=nameProblem(display_name,state.profile?.onboarding_completed?state.profile?.display_name:'');if(nameIssue)return toast(nameIssue);
 if(!state.profile?.onboarding_completed||display_name.toLocaleLowerCase()!==txt(state.profile?.display_name).toLocaleLowerCase()){const free=await checkNameAvailable(display_name);if(free===false)return toast(tt('이미 사용 중인 이름입니다. 다른 이름을 입력해 주세요.','This name is already taken. Please choose another.','この名前は既に使われています。別の名前を入力してください。'));}
 if(phone&&!/^[+0-9() .-]{4,25}$/.test(phone))return toast('전화번호 형식을 확인해 주세요.');
 if(!form.elements.termsAccepted.checked||!form.elements.privacyAccepted.checked)return toast('필수 약관을 확인하고 동의해 주세요.');
 const btn=form.querySelector('button[type=submit]');btn.disabled=true;
 try{
  const {error}=await authTimeout(state.authClient.rpc('save_member_profile',{
   p_display_name:display_name,p_phone:phone||null,p_email_visible:form.elements.emailVisible.checked,p_phone_visible:form.elements.phoneVisible.checked,
   p_accept_terms:form.elements.termsAccepted.checked,p_accept_privacy:form.elements.privacyAccepted.checked,
   p_photo_promotion_consent:form.elements.photoPromotionConsent.checked
  }));
  if(error)throw error;
  await readProfile();if(!state.profile?.onboarding_completed)throw Error('설정 저장은 완료됐지만 프로필 상태를 확인하지 못했어요. 다시 열어 주세요.');
  toast('계정 정보와 동의 설정을 저장했어요.');render();
 }catch(e){state.authError=isNameTakenError(e)?tt('이미 사용 중인 이름입니다. 다른 이름을 입력해 주세요.','This name is already taken. Please choose another.','この名前は既に使われています。別の名前を入力してください。'):authErrorMessage(e);toast(`저장 실패: ${state.authError}`);render();}
 finally{btn.disabled=false;}
}
async function resetPassword(){
 if(!state.authClient)return toast('인증 서버 연결이 필요합니다.');
 const email=prompt('비밀번호 재설정 이메일 주소를 입력하세요.');if(!email)return;
 const {error}=await state.authClient.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});
 toast(error?`재설정 실패: ${error.message}`:'비밀번호 재설정 이메일을 요청했습니다.');
}
async function signOut(){if(!state.authClient)return;const {error}=await state.authClient.auth.signOut();if(error)return toast(error.message);state.user=null;state.profile=null;state.privateSettings=null;state.authError='';state.member=false;state.isAdmin=false;state.categories=[];state.sharedRecords=[];state.likes=[];state.comments=[];state.places=[];if(state.realtimeChannel)await state.authClient.removeChannel(state.realtimeChannel);state.realtimeChannel=null;render();toast('로그아웃했습니다.');}
async function deleteAccount(){
 if(!state.authClient||!state.user)return;
 if(!confirm('계정을 삭제하면 복구할 수 없습니다. 서버에 저장된 계정 정보가 삭제됩니다. 계속할까요?'))return;
 if(prompt('회원 탈퇴를 확인하려면 DELETE를 입력하세요.')!=='DELETE')return;
 const cfg=window.PM_CONFIG;
 const {data,error}=await state.authClient.functions.invoke(cfg.accountDeletionFunction||'delete-account',{method:'POST',body:{confirm:'DELETE'}});
 if(error||!data?.deleted)return toast('계정 삭제 함수를 사용할 수 없습니다. 관리자 서버 설정을 확인해 주세요.');
 await state.authClient.auth.signOut();state.user=null;state.profile=null;state.privateSettings=null;render();toast('계정 삭제가 완료됐습니다. 기기에 저장된 관찰 기록은 유지됩니다.');
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
function draftPayload(){
 const form=$('#observation-form');if(!form)return null;
 return {id:'current',editingId:state.editingId||null,fields:Object.fromEntries(new FormData(form).entries()),photoData:state.formPhotos.find(isSafePhoto)||null,photos:[...state.formPhotos],habitatPhotos:[...state.formHabitat],savedAt:new Date().toISOString()};
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
 state.formPhotos=photoList(d.photos,PLANT_PHOTO_LIMIT);if(!state.formPhotos.length&&isSafePhoto(d.photoData))state.formPhotos=[d.photoData];state.formHabitat=photoList(d.habitatPhotos,HABITAT_PHOTO_LIMIT);refreshObsPhotos(false);
 if(d.fields?.observedAt&&!d.fields.observedDate)setObservedFields(d.fields.observedAt,false);
 const label=$('#draft-status');if(label)label.textContent='이전 입력 내용 자동 복구됨';
}
async function clearDraft(){clearTimeout(state.draftTimer);state.draft=null;try{await namedStore('drafts','readwrite',s=>s.delete('current'));}catch(e){console.warn(e);}}

function openPhotoViewer(id,srcOverride){
 const r=getRecord(id),src=srcOverride||photoSource(r);if(!src)return;
 const holder=$('#image-lightbox');holder.innerHTML=`<div class="photo-viewer-bar"><span>${esc(r?.scientificName||'PHOTO')}</span><button type="button" data-action="photo-close" aria-label="사진 닫기">✕ 닫기</button></div><div class="photo-viewer-canvas"><img id="zoomed-photo" alt="확대된 관찰 식물 사진" src="${esc(src)}"/></div><div class="photo-viewer-note">두 손가락으로 확대·축소 · 드래그하여 이동</div>`;
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
function fromCloud(row, photoUrl, privateCoords, details){
 return {id:row.id,isCloud:true,onlinePublished:true,ownerId:row.owner_id,hidden:row.is_hidden===true,observedTimeUnknown:row.observed_time_unknown===true,photoPath:row.photo_path||null,photoUrl:photoUrl||null,photos:Array.isArray(row.photo_paths)&&row.photo_paths.length?row.photo_paths:(row.photo_path?[row.photo_path]:[]),habitatPhotos:Array.isArray(row.habitat_photo_paths)?row.habitat_photo_paths:[],
 scientificName:row.scientific_name,family:row.family,country:row.country,locality:details?.locality??row.locality,privacy:row.privacy,countryCode:row.country_code||null,serverHasCoords:row.latitude!==null&&row.latitude!==undefined,fieldNumber:details?.field_number||'',collector:details?.collector||'',population:details?.population||'',associatedSpecies:details?.associated_species||'',voucher:details?.voucher||'',locationSource:details?.location_source||null,projectId:row.expedition_id||'',
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
 let detailsById={};
 if(mine.length){const {data:det,error:detErr}=await client.from('field_private_details').select('*').in('observation_id',mine);if(!detErr)detailsById=Object.fromEntries((det||[]).map(x=>[x.observation_id,x]));}
 const urls=await Promise.all((data||[]).map(r=>resolveSignedPhoto(r.photo_path)));
 const {data:identifications,error:idError}=await client.from('field_identifications').select('observation_id,proposed_name,created_at').order('created_at',{ascending:true}).limit(1000);
 const byObservation={};if(!idError)for(const s of identifications||[]){(byObservation[s.observation_id]??=[]).push({name:s.proposed_name,author:'테스터',at:s.created_at});}
 state.sharedRecords=(data||[]).map((r,i)=>({...fromCloud(r,urls[i],r.owner_id===state.user.id?exactById[r.id]:null,r.owner_id===state.user.id?detailsById[r.id]:null),suggestions:byObservation[r.id]||[]}));
 await loadCommunity();
 if(state.tab==='home'||state.tab==='plant'||(state.tab==='options'&&state.optionView==='profile'))rerenderKeepScroll();
}
async function isMember(){
 state.member=false;
 if(!state.authClient||!state.user)return;
 const {data,error}=await state.authClient.rpc('is_beta_member');
 if(error){state.onlineError=error.message;console.warn('Member check',error);return;}
 state.member=data===true;
 if(state.member){await loadSharedRecords();await loadCategories().catch(console.warn);await loadFriends().catch(console.warn);subscribeShared();syncPendingRecords().catch(console.warn);}
}
function subscribeShared(){
 if(!state.member||!state.authClient||state.realtimeChannel)return;
 state.realtimeChannel=state.authClient.channel('pm-beta-observations')
  .on('postgres_changes',{event:'*',schema:'public',table:'field_observations'},()=>loadSharedRecords().catch(console.warn))
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'field_identifications'},()=>loadSharedRecords().catch(console.warn))
  .on('postgres_changes',{event:'*',schema:'public',table:'field_likes'},()=>loadCommunity().then(()=>{if(state.tab==='home')render();}).catch(console.warn))
  .on('postgres_changes',{event:'*',schema:'public',table:'field_comments'},()=>loadCommunity().then(()=>{if(state.tab==='home')render();}).catch(console.warn))
  .subscribe();
}
async function publishRecord(id){
 if(!state.member||!state.user)return toast('온라인 공유를 사용하려면 승인된 계정으로 로그인해 주세요.');
 let r=getRecord(id);if(!r||!canEdit(r))return;
 const exposure=tt('나라까지만 (정확한 위치는 공유하지 않음)','Country only (never the exact spot)','国のみ（正確な場所は共有しません）');
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
    const up=await uploadObservationPhotos(r),path=up.plant[0]||null;
    let payload={...rowFromRecord({...r,photoPath:path}),photo_paths:up.plant,habitat_photo_paths:up.habitat};
    const send=row=>state.authClient.from('field_observations').upsert(row,{onConflict:'id'});
    let {error}=await send(payload);
    // BETA 11 columns missing (SQL not applied yet): share the cover photo only.
    if(error&&/photo_paths|habitat_photo_paths/i.test(error.message||'')){const {photo_paths,habitat_photo_paths,...rest}=payload;payload=rest;({error}=await send(payload));}
    // BETA07 columns missing (SQL not applied yet): keep syncing normal records, never silently publish a hidden one.
    if(error&&/country_code|expedition_id/i.test(error.message||'')){const {country_code,expedition_id,...rest}=payload;payload=rest;({error}=await send(payload));}
    if(error&&isBeta07SchemaError(error)&&!payload.is_hidden){const {is_hidden,observed_time_unknown,...legacy}=payload;payload=legacy;({error}=await send(payload));}
    if(error)throw error;
    await savePrivateDetails(r);
    // Exact GPS is never stored in the group-readable observation table unless the user explicitly selected public.
    if(Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)){
     const {error:coordinateError}=await state.authClient.from('field_private_locations').upsert({observation_id:r.id,owner_id:state.user.id,latitude:r.latitude,longitude:r.longitude,gps_accuracy:r.gpsAccuracy??null},{onConflict:'observation_id'});
     if(coordinateError)throw coordinateError;
    }
    const allPaths=[...up.plant,...up.habitat],stale=previousServerPhotos(r).filter(x=>!allPaths.includes(x));
    if(stale.length)await state.authClient.storage.from('field-photos').remove(stale).catch(console.warn);
    await storeRecord({...r,photoPath:path,cloudPhotoPaths:allPaths,uploadedPhotoMap:up.map,syncPending:false,onlinePublished:true});
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

async function removeObservation(id){
 const r=getRecord(id);if(!canEdit(r))throw Error('삭제할 권한이 없습니다.');
 if(r.onlinePublished&&state.member&&state.authClient&&navigator.onLine){
  const {error}=await state.authClient.from('field_observations').delete().eq('id',id).eq('owner_id',state.user.id);
  if(error)throw error;
  {const paths=[...new Set([r.photoPath,...(r.cloudPhotoPaths||[]),...recordPlantPhotos(r),...recordHabitatPhotos(r)].filter(isPhotoPath))];if(paths.length)await state.authClient.storage.from('field-photos').remove(paths);}
 }else if(r.onlinePublished)throw Error('온라인 공유 기록을 삭제하려면 인터넷 연결이 필요합니다.');
 if(state.records.some(x=>x.id===id))await deleteRecord(id);
 state.sharedRecords=state.sharedRecords.filter(x=>x.id!==id);
}

const isBeta07SchemaError=e=>/is_hidden|observed_time_unknown|address_detail|place_plants|place-photos|schema cache|does not exist/i.test(e?.message||String(e||''));
function observedSection(){
 const now=localDate();
 return `<div class="form-section"><h2>03 / DATE & TIME</h2><div class="two-col dt-row"><label class="form-field"><span>${tt('발견 날짜','Date found','発見日')} *</span><input name="observedDate" type="date" required max="${now.slice(0,10)}" value="${now.slice(0,10)}"/></label><label class="form-field"><span>${tt('발견 시각 (선택)','Time (optional)','時刻（任意）')}</span><input name="observedTime" type="time" value="${now.slice(11,16)}"/></label></div><div class="small-actions"><button type="button" class="light-button" data-action="observed-now">${tt('지금으로 설정','Set to now','現在の日時')}</button><button type="button" class="light-button" data-action="observed-clear-time">${tt('시각 모름','Time unknown','時刻不明')}</button></div><p class="footnote">${tt('나중에 기록한다면 실제로 발견한 날짜와 시각으로 바꿔 주세요. 시각을 비우면 날짜만 기록됩니다.','If you are recording later, set the actual date and time you found the plant. Leave the time empty to record only the date.','後から記録する場合は、実際に発見した日時に変更してください。時刻を空欄にすると日付のみ記録されます。')}</p></div>`;
}
function setObservedFields(value,timeUnknown){
 const form=$('#observation-form'),local=toDateTimeLocal(value);if(!form||!local)return;
 if(form.elements.observedDate)form.elements.observedDate.value=local.slice(0,10);
 if(form.elements.observedTime)form.elements.observedTime.value=timeUnknown?'':local.slice(11,16);
}
function observedFromForm(date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 // A date without a time is stored at local noon so it never shifts to another day across time zones.
 const at=new Date(`${date}T${/^\d{2}:\d{2}/.test(time||'')?time.slice(0,5):'12:00'}`);
 return Number.isNaN(at.getTime())?null:at.toISOString();
}
function fmtObserved(r){
 const d=new Date(r?.observedAt);if(!r?.observedAt||Number.isNaN(d.getTime()))return '-';
 const loc=state.locale==='ja'?'ja-JP':state.locale==='en'?'en-US':'ko-KR';
 return r.observedTimeUnknown?d.toLocaleDateString(loc):d.toLocaleString(loc,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function visibilitySection(r){
 if(!r||r.isDemo)return '';
 const s=!(r.isCloud||r.onlinePublished)?'local':r.hidden?'private':'shared',id=esc(r.id);
 const info={
  local:[tt('비공개 · 이 기기에만 저장','Private · on this device only','非公開 · この端末のみ'),tt('다른 사람은 이 기록을 볼 수 없습니다.','No one else can see this record.','他の人はこの記録を見られません。')],
  shared:[tt('공개 중 · 베타 멤버에게 표시','Shared with beta members','公開中 · ベータメンバーに表示'),tt('승인된 베타 멤버가 내 도감에서 볼 수 있습니다.','Approved beta members can see it in your dex.','承認済みのメンバーが図鑑で見られます。')],
  private:[tt('비공개 · 나만 보기','Private · only me','非公開 · 自分のみ'),tt('온라인에 보관되지만 다른 멤버에게는 기록·댓글·사진이 모두 보이지 않습니다.','Kept online, but hidden from other members, including comments and photos.','オンラインに保存されますが、他のメンバーには記録・コメント・写真が表示されません。')]
 }[s];
 let button='';
 if(s==='local')button=state.member?`<button type="button" class="light-button wide" data-action="backup-record" data-record-id="${id}">${tt('온라인에 비공개로 백업','Back up online as private','非公開でオンラインにバックアップ')}</button>`:`<p class="mini-muted">${tt('로그인한 승인 멤버는 저장할 때 온라인에도 자동으로 저장됩니다.','Approved members are saved online automatically.','承認済みメンバーは自動でオンライン保存されます。')}</p>`;
 else if(s==='shared')button=`<button type="button" class="light-button wide" data-action="record-hide" data-record-id="${id}">${tt('비공개로 전환','Make private','非公開にする')}</button>`;
 else button=`<button type="button" class="light-button wide" data-action="record-unhide" data-record-id="${id}">${tt('다시 공개하기','Share again','再公開する')}</button>`;
 if(r.syncPending&&s!=='local')button+=`<p class="mini-muted">${tt('온라인 업로드 대기 중 · 인터넷이 연결되면 자동으로 올라갑니다.','Waiting to upload · it will upload when online.','アップロード待ち · 接続時に自動アップロードされます。')}</p>`;
 return `<div class="detail-section visibility-section"><h2>${tt('공개 범위','VISIBILITY','公開範囲')}</h2><div class="visibility-state ${s}"><strong>${info[0]}</strong><small>${info[1]}</small></div>${button}</div>`;
}
async function setRecordHidden(id,hidden){
 const r=getRecord(id);if(!r||!canEdit(r))return;
 if(!state.member||!state.authClient||!state.user)return toast(tt('승인된 베타 계정으로 로그인해 주세요.','Sign in with an approved beta account.','承認済みのベータアカウントでログインしてください。'));
 if(state.beta07Missing)return toast(SQL07_NOTICE());
 if(!navigator.onLine)return toast(tt('공개 범위를 바꾸려면 인터넷 연결이 필요합니다.','An internet connection is required to change visibility.','公開範囲の変更にはインターネット接続が必要です。'));
 if(!hidden&&!confirm(tt('이 기록을 다시 베타 멤버에게 공개할까요?','Share this record with beta members again?','この記録をベータメンバーに再公開しますか？')))return;
 try{
  // Privacy changes are applied on the server immediately (never queued) so "private" is only shown once it is true.
  const {data,error}=await state.authClient.from('field_observations').update({is_hidden:hidden}).eq('id',id).eq('owner_id',state.user.id).select('id');
  if(error)throw error;
  const local=state.records.find(x=>x.id===id);
  if(!data?.length&&!local)throw Error(tt('서버에서 이 기록을 찾지 못했습니다.','This record was not found on the server.','サーバーでこの記録が見つかりません。'));
  if(local)await storeRecord({...local,hidden});
  await loadSharedRecords();
  if(local?.syncPending)await syncPendingRecords();
  detail(id);
  toast(hidden?tt('비공개로 전환했습니다. 이제 나만 볼 수 있습니다.','Now private. Only you can see it.','非公開にしました。自分だけが見られます。'):tt('다시 공개했습니다.','Shared again.','再公開しました。'));
 }catch(e){toast(isBeta07SchemaError(e)?SQL07_NOTICE():(e.message||String(e)));}
}

// BETA 08 — profile photos (1:1), unique names, people search, personal plant dex, identification status.
const SQL08_NOTICE=()=>tt('먼저 Supabase에 BETA 08 SQL(supabase/beta08_people_dex.sql)을 적용하세요.','Apply the BETA 08 database SQL (supabase/beta08_people_dex.sql) first.','まずBETA 08のSQL（supabase/beta08_people_dex.sql）を適用してください。');
const isBeta08SchemaError=e=>/avatar_path|search_members|display_name_available|identification_status|avatars|schema cache|does not exist|could not find the function/i.test(e?.message||String(e||''));
const isNameTakenError=e=>/display_name_unique|duplicate key/i.test(e?.message||String(e||''));
const NAME_RULE=()=>tt('다른 이용자와 겹치지 않는 고유한 이름 · 2~30자 · @ 사용 불가','Must be unique · 2–30 characters · no @','他のユーザーと重複しない名前 · 2〜30文字 · @不可');
function cachedSigned(bucket,path){const c=path&&state.photoUrlCache[`${bucket}/${path}`];return c&&c.exp>Date.now()+60000&&isRemotePhoto(c.url)?c.url:null;}
async function signBucket(bucket,paths){
 const need=[...new Set(paths.filter(p=>p&&!cachedSigned(bucket,p)))];if(!need.length||!state.authClient)return false;
 const {data,error}=await state.authClient.storage.from(bucket).createSignedUrls(need,3600);
 if(error){console.warn('Signing',bucket,error);return false;}
 for(const x of data||[])if(x?.signedUrl&&x.path)state.photoUrlCache[`${bucket}/${x.path}`]={url:x.signedUrl,exp:Date.now()+3500*1000};
 return true;
}
// Elements rendered with data-sign-bucket/data-sign-path get their private image once a signed URL exists.
async function hydrateSigned(root=document){
 const els=[...root.querySelectorAll('[data-sign-path]')].filter(el=>!el.querySelector('img'));if(!els.length||!state.authClient)return;
 const byBucket={};for(const el of els)(byBucket[el.dataset.signBucket]??=[]).push(el.dataset.signPath);
 await Promise.all(Object.entries(byBucket).map(([b,ps])=>signBucket(b,ps)));
 for(const el of els){const src=cachedSigned(el.dataset.signBucket,el.dataset.signPath);if(src&&!el.querySelector('img')){const img=new Image();img.alt='';img.loading='lazy';img.src=src;el.replaceChildren(img);}}
}
function personName(id){return state.people[id]?.display_name||(id&&id===state.user?.id?state.profile?.display_name:'')||tt('멤버','Member','メンバー');}
function avatarMarkup(path,name,cls=''){
 const src=cachedSigned('avatars',path),initial=esc((txt(name).charAt(0)||'·').toUpperCase());
 return `<span class="avatar ${cls}" ${path?`data-sign-bucket="avatars" data-sign-path="${esc(path)}"`:''} aria-hidden="true">${src?`<img src="${esc(src)}" alt=""/>`:`<span class="avatar-initial">${initial}</span>`}</span>`;
}
function authorChip(uid){
 if(!uid)return '';const name=personName(uid),inner=`${avatarMarkup(state.people[uid]?.avatar_path,name,'avatar-sm')}<span>${esc(name)}</span>`;
 return state.member?`<button type="button" class="author-chip" data-action="user-open" data-user-id="${esc(uid)}" aria-label="${esc(tt(`${name}의 도감 보기`,`Open ${name}'s dex`,`${name}の図鑑を見る`))}">${inner}<span class="chip-arrow">›</span></button>`:`<span class="author-chip">${inner}</span>`;
}
// ---------- profile photo ----------
async function loadImageFile(file){
 if(!file||!file.type.startsWith('image/'))throw Error(tt('이미지 파일만 선택할 수 있습니다.','Please choose an image file.','画像ファイルを選択してください。'));
 if(file.size>25*1024*1024)throw Error(tt('25MB 이하 사진을 사용해 주세요.','Use a photo under 25 MB.','25MB以下の写真を使用してください。'));
 const url=URL.createObjectURL(file);
 try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error(tt('사진을 불러오지 못했습니다.','Could not read the photo.','写真を読み込めませんでした。')));img.src=url;});}
 finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
// Center-crop to a square and resize; drawing to canvas also drops EXIF metadata (incl. GPS).
async function cropSquarePhoto(file,size=512){
 const img=await loadImageFile(file),w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,s=Math.min(w,h);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);ctx.imageSmoothingQuality='high';
 ctx.drawImage(img,(w-s)/2,(h-s)/2,s,s,0,0,size,size);
 return canvas.toDataURL('image/jpeg',.86);
}
async function uploadAvatar(file){
 if(!file)return;if(!state.member||!state.user||!state.authClient)return toast(tt('승인된 베타 계정으로 로그인해 주세요.','Sign in with an approved beta account.','承認済みのベータアカウントでログインしてください。'));
 if(state.beta08Missing)return toast(SQL08_NOTICE());
 state.avatarBusy=true;render();
 try{
  const data=await cropSquarePhoto(file,512),blob=await (await fetch(data)).blob();
  const path=`${state.user.id}/avatar-${Date.now()}.jpg`,old=state.profile?.avatar_path||null;
  const {error:uploadError}=await state.authClient.storage.from('avatars').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(uploadError)throw uploadError;
  const {error}=await state.authClient.from('profiles').update({avatar_path:path,updated_at:new Date().toISOString()}).eq('id',state.user.id);
  if(error){await state.authClient.storage.from('avatars').remove([path]).catch(()=>{});throw error;}
  if(old&&old!==path)await state.authClient.storage.from('avatars').remove([old]).catch(console.warn);
  await readProfile();state.people[state.user.id]={...(state.people[state.user.id]||{}),display_name:state.profile?.display_name,avatar_path:path};
  toast(tt('프로필 사진을 저장했습니다.','Profile photo saved.','プロフィール写真を保存しました。'));
 }catch(e){toast(isBeta08SchemaError(e)?SQL08_NOTICE():(e.message||String(e)));}
 finally{state.avatarBusy=false;render();}
}
async function removeAvatar(){
 const old=state.profile?.avatar_path;if(!old||!state.authClient||!confirm(tt('프로필 사진을 삭제할까요?','Remove your profile photo?','プロフィール写真を削除しますか？')))return;
 const {error}=await state.authClient.from('profiles').update({avatar_path:null,updated_at:new Date().toISOString()}).eq('id',state.user.id);if(error)return toast(error.message);
 await state.authClient.storage.from('avatars').remove([old]).catch(console.warn);
 await readProfile();if(state.people[state.user.id])state.people[state.user.id].avatar_path=null;render();
}
// ---------- unique display name ----------
function nameProblem(name,current=''){
 const n=txt(name);if(n.toLocaleLowerCase()===txt(current).toLocaleLowerCase()&&n)return '';
 if(n.length<2||n.length>30)return tt('이름은 2~30자로 입력해 주세요.','Names must be 2–30 characters.','名前は2〜30文字で入力してください。');
 if(/[@<>]/.test(n))return tt('이름에는 @ 기호를 사용할 수 없습니다.','Names cannot contain @.','名前に@は使えません。');
 return '';
}
async function checkNameAvailable(name){
 if(!state.authClient)return null;
 const {data,error}=await state.authClient.rpc('display_name_available',{p_name:txt(name)});
 if(error){console.warn('Name check',error);return null;}
 return data===true;
}
async function updateNameHint(input){
 const hint=$('#name-hint');if(!hint||!input)return;
 const problem=nameProblem(input.value,state.profile?.display_name);
 if(problem){hint.textContent=problem;hint.className='name-hint bad';return;}
 if(txt(input.value).toLocaleLowerCase()===txt(state.profile?.display_name).toLocaleLowerCase()){hint.textContent=NAME_RULE();hint.className='name-hint';return;}
 hint.textContent=tt('확인 중…','Checking…','確認中…');hint.className='name-hint';
 const ok=await checkNameAvailable(input.value);
 if(ok===null){hint.textContent=NAME_RULE();hint.className='name-hint';return;}
 hint.textContent=ok?tt('사용할 수 있는 이름입니다.','This name is available.','この名前は使用できます。'):tt('이미 사용 중인 이름입니다.','This name is already taken.','この名前は既に使われています。');
 hint.className=`name-hint ${ok?'good':'bad'}`;
}
// ---------- people search ----------
async function searchPeople(q){
 q=txt(q);if(q.length<2)return toast(tt('2글자 이상 입력해 주세요.','Enter at least 2 characters.','2文字以上入力してください。'));
 if(!state.member||!state.authClient)return;
 state.userQuery=q;state.userSearchState='loading';const box=$('#people-results');if(box)box.innerHTML=peopleResults();
 try{
  const {data,error}=await state.authClient.rpc('search_members',{p_query:q});if(error)throw error;
  state.userResults=data||[];state.userSearchState='done';
  for(const u of state.userResults)rememberPerson(u);
 }catch(e){state.userResults=[];state.userSearchState='error';state.userSearchError=isBeta08SchemaError(e)?SQL08_NOTICE():(e.message||String(e));}
 const out=$('#people-results');if(out){out.innerHTML=peopleResults();translateUI(out);hydrateSigned(out).catch(console.warn);}
}
// ---------- personal plant dex ----------
const speciesKey=name=>{const n=txt(name).toLocaleLowerCase();return !n||n==='미동정 식물'||n==='unidentified plant'?'':n.replace(/\s+/g,' ');};
function dexTile({no,src,bucket,path,name,badge='',action,attrs}){
 const photo=src?`<img src="${esc(src)}" alt="" loading="lazy"/>`:botanicalSvg;
 return `<button type="button" class="dex-tile" data-action="${action}" ${attrs}><span class="dex-photo" ${!src&&path?`data-sign-bucket="${bucket}" data-sign-path="${esc(path)}"`:''}>${photo}</span><span class="dex-no">No.${String(no).padStart(3,'0')}</span><em>${esc(name)}</em>${badge}</button>`;
}
const dexBackButton=()=>state.detailBackUser?`<button type="button" class="close" data-action="user-open" data-user-id="${esc(state.detailBackUser)}">← ${tt('도감','DEX','図鑑')}</button>`:'';
// ---------- identification status ----------
function identificationActions(r){
 if(!r||r.isDemo||!canEdit(r))return '';
 if(r.identificationStatus==='verified')return `<div class="id-actions"><p class="id-verified">✓ ${tt('동정 완료','Identified','同定済み')} · <em>${esc(r.scientificName)}</em></p><button type="button" class="light-button wide" data-action="id-unverify" data-record-id="${esc(r.id)}">${tt('동정 완료 취소','Undo identified','同定済みを取り消す')}</button></div>`;
 return `<div class="id-actions"><button type="button" class="primary-button wide" data-action="id-verify" data-record-id="${esc(r.id)}">✓ ${tt('동정 완료로 변경','Mark as identified','同定済みにする')}</button><p class="footnote">${tt('현재 학명으로 동정이 끝났다면 눌러 주세요. 아래 동정 의견 중 하나를 골라 그 학명으로 완료할 수도 있습니다.','Use this when the current name is confirmed, or adopt one of the suggestions below.','現在の学名で同定が済んだら押してください。下の同定意見から選ぶこともできます。')}</p></div>`;
}
async function setIdentification(id,status,name=null){
 const r=getRecord(id);if(!r||!canEdit(r))return;
 const sci=txt(name)||txt(r.scientificName);
 if(status==='verified'){
  if(!sci||sci==='미동정 식물')return toast(tt('먼저 학명을 입력해 주세요.','Enter a scientific name first.','先に学名を入力してください。'));
  if(!confirm(tt(`'${sci}'(으)로 동정 완료 처리할까요?`,`Mark as identified as '${sci}'?`,`「${sci}」で同定済みにしますか？`)))return;
 }
 const now=new Date().toISOString(),local=state.records.find(x=>x.id===id),base=local||{...r,isCloud:false,photoData:null};
 const changed=['identificationStatus',...(sci!==base.scientificName?['scientificName']:[])];
 const updated={...base,identificationStatus:status,scientificName:sci||base.scientificName,updatedAt:now,editHistory:[...(base.editHistory||[]),{at:now,changedFields:changed}],syncPending:!!(base.onlinePublished||base.syncPending)};
 try{
  await storeRecord(updated);
  if(updated.syncPending&&state.member&&navigator.onLine)await syncPendingRecords();
  detail(id);
  toast(status==='verified'?tt('동정 완료로 변경했습니다.','Marked as identified.','同定済みにしました。'):tt('동정 상태를 되돌렸습니다.','Identification status reverted.','同定状況を戻しました。'));
 }catch(e){toast(e.message||String(e));}
}

// BETA 09 — PROFILE reorganised (my profile / friends), collapsible sections, friend requests.
const SQL09_NOTICE=()=>tt('먼저 Supabase에 BETA 09 SQL(supabase/beta09_friends_place_photos.sql)을 적용하세요.','Apply the BETA 09 database SQL (supabase/beta09_friends_place_photos.sql) first.','まずBETA 09のSQL（supabase/beta09_friends_place_photos.sql）を適用してください。');
const PROFILE_SECTION_DEFAULTS={observations:true,find:true,requests:true,friends:true,sent:true};
state.profileOpen=(()=>{try{return JSON.parse(localStorage.getItem('pm-profile-sections')||'{}')||{};}catch{return {};}})();
const sectionOpen=key=>state.profileOpen[key]===undefined?!!PROFILE_SECTION_DEFAULTS[key]:!!state.profileOpen[key];
function setSectionOpen(key,open){state.profileOpen[key]=open;try{localStorage.setItem('pm-profile-sections',JSON.stringify(state.profileOpen));}catch{}}
function profileSection(key,title,body,count){
 return `<details class="setting-accordion profile-acc" data-acc="${key}" ${sectionOpen(key)?'open':''}><summary><span>${title}${count===undefined?'':` <span class="acc-count">${count}</span>`}</span></summary><div class="setting-inner">${body}</div></details>`;
}
function friendsView(){
 if(!state.user)return `<div class="info">${tt('친구 기능은 로그인 후 사용할 수 있습니다. OPTIONS에서 로그인해 주세요.','Sign in from OPTIONS to use friends.','友だち機能はOPTIONSでログインすると使えます。')}</div><button type="button" class="light-button wide" data-nav="options">OPTIONS →</button>`;
 if(!state.member)return `<div class="info">${tt('친구와 이용자 검색은 승인된 베타 멤버만 사용할 수 있습니다.','Friends and people search need an approved beta account.','友だちとユーザー検索は承認済みメンバーのみ利用できます。')}</div>`;
 const incoming=friendRequestsIn(),sent=friendRequestsOut(),friends=friendList();
 const warn=state.beta09Missing?`<div class="info warning">${SQL09_NOTICE()}</div>`:'';
 return `${warn}
 ${profileSection('find',tt('친구 찾기','FIND FRIENDS','友だちを探す'),friendSearchBody())}
 ${incoming.length?profileSection('requests',tt('받은 친구 요청','FRIEND REQUESTS','友だちリクエスト'),`<div class="people-list">${incoming.map(f=>personRow(f.requester_id)).join('')}</div>`,incoming.length):''}
 ${profileSection('friends',tt('친구 목록','MY FRIENDS','友だちリスト'),friends.length?`<div class="people-list">${friends.map(f=>personRow(otherParty(f),{list:true})).join('')}</div>`:`<p class="mini-muted">${tt('아직 친구가 없습니다. 위의 친구 찾기에서 이름이나 이메일로 검색해 친구를 추가해 보세요.','No friends yet. Search by name or email above to add friends.','まだ友だちがいません。上の検索から追加しましょう。')}</p>`,friends.length)}
 ${sent.length?profileSection('sent',tt('보낸 친구 요청','SENT REQUESTS','送信したリクエスト'),`<div class="people-list">${sent.map(f=>personRow(f.addressee_id)).join('')}</div>`,sent.length):''}`;
}
// ---------- friend data ----------
const otherParty=f=>f.requester_id===state.user?.id?f.addressee_id:f.requester_id;
const friendRequestsIn=()=>state.friendships.filter(f=>f.status==='pending'&&f.addressee_id===state.user?.id);
const friendRequestsOut=()=>state.friendships.filter(f=>f.status==='pending'&&f.requester_id===state.user?.id);
const friendList=()=>state.friendships.filter(f=>f.status==='accepted'&&(f.requester_id===state.user?.id||f.addressee_id===state.user?.id));
const friendshipWith=uid=>state.friendships.find(f=>(f.requester_id===state.user?.id&&f.addressee_id===uid)||(f.addressee_id===state.user?.id&&f.requester_id===uid));
function friendState(uid){if(!state.user||uid===state.user.id)return 'self';const f=friendshipWith(uid);if(!f)return 'none';if(f.status==='accepted')return 'friend';return f.requester_id===state.user.id?'sent':'received';}
function friendButtons(uid,{list=false}={}){
 const id=esc(uid);
 switch(friendState(uid)){
  case 'self':return `<span class="friend-tag">${tt('나','ME','自分')}</span>`;
  case 'none':return `<button type="button" class="light-button friend-btn" data-action="friend-add" data-user-id="${id}">＋ ${tt('친구 추가','Add friend','友だち追加')}</button>`;
  case 'sent':return `<button type="button" class="light-button friend-btn" data-action="friend-cancel" data-user-id="${id}">${tt('요청 취소','Cancel request','リクエスト取消')}</button>`;
  case 'received':return `<span class="friend-pair"><button type="button" class="primary-button friend-btn" data-action="friend-accept" data-user-id="${id}">${tt('수락','Accept','承認')}</button><button type="button" class="light-button friend-btn" data-action="friend-decline" data-user-id="${id}">${tt('거절','Decline','拒否')}</button></span>`;
  case 'friend':return list?`<button type="button" class="light-button friend-btn" data-action="friend-remove" data-user-id="${id}">${tt('친구 삭제','Remove','削除')}</button>`:`<span class="friend-tag friend-yes">✓ ${tt('친구','Friend','友だち')}</span>`;
 }
 return '';
}
function personRow(uid,opts={}){
 const p=state.people[uid]||{},name=p.display_name||tt('멤버','Member','メンバー');
 return `<div class="person-row"><button type="button" class="person-main" data-action="user-open" data-user-id="${esc(uid)}" aria-label="${esc(tt(`${name}의 도감 보기`,`Open ${name}'s dex`,`${name}の図鑑を見る`))}">${avatarMarkup(p.avatar_path,name,'avatar-md')}<span class="person-info"><strong>${esc(name)}</strong><small>${esc([accountLabel(p),opts.list?'':p.public_email].filter(Boolean).join(' · '))||tt('도감 보기 ›','View dex ›','図鑑を見る ›')}</small></span></button>${friendButtons(uid,opts)}</div>`;
}
function friendSearchBody(){
 return `<form id="people-search" class="people-search" role="search"><input id="people-query" type="search" enterkeyhint="search" maxlength="80" autocomplete="off" placeholder="${esc(tt('이름 또는 이메일 주소','Name or email address','名前またはメールアドレス'))}" value="${esc(state.userQuery)}"/><button class="light-button" type="submit">${tt('검색','SEARCH','検索')}</button></form><p class="mini-muted people-help">${tt('이름은 일부만 입력해도 찾을 수 있고, 이메일은 전체 주소가 정확히 일치해야 찾을 수 있습니다.','Names match partially; emails must match the full address.','名前は部分一致、メールは完全一致で検索できます。')}</p><div id="people-results">${peopleResults()}</div>`;
}
function peopleResults(){
 if(state.userSearchState==='loading')return `<p class="mini-muted">${tt('검색 중…','Searching…','検索中…')}</p>`;
 if(state.userSearchState==='error')return `<p class="mini-muted">${esc(state.userSearchError)}</p>`;
 if(!state.userQuery)return '';
 if(!state.userResults.length)return `<p class="mini-muted">${tt('일치하는 이용자가 없습니다.','No matching people.','該当するユーザーがいません。')}</p>`;
 return `<div class="people-list">${state.userResults.map(u=>personRow(u.id)).join('')}</div>`;
}
async function loadFriends(){
 if(!state.member||!state.authClient||!state.user){state.friendships=[];return;}
 const {data,error}=await state.authClient.from('friendships').select('*').order('created_at',{ascending:false}).limit(500);
 if(error){state.beta09Missing=true;state.friendships=[];console.warn('BETA09 migration required',error.message);return;}
 state.beta09Missing=false;state.friendships=data||[];
 const ids=[...new Set(state.friendships.map(otherParty))].filter(id=>id&&!state.people[id]);
 if(ids.length){const {data:profiles}=await state.authClient.from('profiles').select('*').in('id',ids.slice(0,300));for(const p of profiles||[])rememberPerson(p);}
 subscribeFriends();
}
function subscribeFriends(){
 if(state.friendChannel||state.beta09Missing||!state.authClient)return;
 state.friendChannel=state.authClient.channel('pm-friends').on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>loadFriends().then(refreshFriendUI).catch(console.warn)).subscribe();
}
function requireFriends(){
 if(!state.member||!state.authClient||!state.user){toast(tt('승인된 베타 계정으로 로그인해 주세요.','Sign in with an approved beta account.','承認済みのベータアカウントでログインしてください。'));return false;}
 if(state.beta09Missing){toast(SQL09_NOTICE());return false;}
 if(!navigator.onLine){toast(tt('인터넷 연결이 필요합니다.','Internet connection is required.','インターネット接続が必要です。'));return false;}
 return true;
}
async function friendAction(kind,uid){
 if(!uid||!requireFriends())return;
 const c=state.authClient.from('friendships'),f=friendshipWith(uid),name=personName(uid);
 try{
  if(kind==='add'){
   if(f?.status==='pending'&&f.addressee_id===state.user.id)return friendAction('accept',uid);
   if(f)return;
   const {error}=await c.insert({requester_id:state.user.id,addressee_id:uid,status:'pending'});
   if(error&&!/duplicate key|friendships_pair_unique/i.test(error.message))throw error;
   toast(tt(`${name}님에게 친구 요청을 보냈습니다.`,`Friend request sent to ${name}.`,`${name}さんにリクエストを送りました。`));
  }else if(kind==='accept'){
   if(!f)return;const {error}=await c.update({status:'accepted',responded_at:new Date().toISOString()}).eq('id',f.id);if(error)throw error;
   toast(tt(`${name}님과 친구가 되었습니다.`,`You and ${name} are now friends.`,`${name}さんと友だちになりました。`));
  }else{
   if(!f)return;
   if(kind==='remove'&&!confirm(tt(`${name}님을 친구 목록에서 삭제할까요?`,`Remove ${name} from your friends?`,`${name}さんを友だちから削除しますか？`)))return;
   const {error}=await c.delete().eq('id',f.id);if(error)throw error;
   toast(kind==='decline'?tt('친구 요청을 거절했습니다.','Request declined.','リクエストを拒否しました。'):kind==='cancel'?tt('친구 요청을 취소했습니다.','Request cancelled.','リクエストを取り消しました。'):tt('친구를 삭제했습니다.','Friend removed.','友だちを削除しました。'));
  }
 }catch(e){toast(e.message||String(e));}
 await loadFriends();refreshFriendUI();
}


const PERSONAL_CATEGORIES=()=>[
 ['collector',tt('식물 수집','Collector','植物の収集'),tt('희귀·관심 식물을 모으고 돌봅니다.','Collects and cares for rare or favourite plants.','希少な植物やお気に入りを集めて育てます。')],
 ['grower',tt('식물 재배','Grower','植物の栽培'),tt('번식과 재배, 실내 가드닝을 즐깁니다.','Enjoys propagating and growing plants.','繁殖や栽培、室内ガーデニングを楽しみます。')],
 ['explorer',tt('야생 관찰','Field Explorer','野生の観察'),tt('자생지를 찾아 식물을 관찰하고 기록합니다.','Finds and records plants in their native habitats.','自生地を訪ねて植物を観察・記録します。')]];

// BETA 11 — up to 5 plant photos + 2 habitat photos per observation, swipeable photo slider.
const PLANT_PHOTO_LIMIT=5,HABITAT_PHOTO_LIMIT=2;
// A photo is either an on-device data URL or a storage path ("<user uuid>/<file>.jpg") already uploaded.
const isPhotoPath=v=>typeof v==='string'&&/^[0-9a-f-]{36}\/[\w.-]+\.jpg$/i.test(v);
const photoList=(list,limit)=>(Array.isArray(list)?list:[]).filter(v=>isSafePhoto(v)||isPhotoPath(v)).slice(0,limit);
function recordPlantPhotos(r){
 if(!r)return [];
 const list=photoList(r.photos,PLANT_PHOTO_LIMIT);if(list.length)return list;
 if(isSafePhoto(r.photoData))return [r.photoData];
 if(isPhotoPath(r.photoPath))return [r.photoPath];
 return [];
}
const recordHabitatPhotos=r=>photoList(r?.habitatPhotos,HABITAT_PHOTO_LIMIT);
async function photoFingerprint(d){
 try{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(d));return [...new Uint8Array(buf)].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('');}
 catch{return `${d.length}-${d.slice(-48)}`;}
}
// ---------- form ----------
async function addObsPhotos(fileList,kind){
 const files=[...(fileList||[])];if(!files.length)return;
 const habitat=kind==='habitat',items=habitat?state.formHabitat:state.formPhotos,limit=habitat?HABITAT_PHOTO_LIMIT:PLANT_PHOTO_LIMIT,room=limit-items.length;
 if(room<=0)return toast(habitat?tt('주변 환경 사진은 최대 2장입니다.','Up to 2 habitat photos.','周辺環境の写真は最大2枚です。'):tt('식물 사진은 최대 5장입니다.','Up to 5 plant photos.','植物の写真は最大5枚です。'));
 if(files.length>room)toast(tt(`최대 ${limit}장까지라 ${room}장만 추가했습니다.`,`Only ${room} added (limit ${limit}).`,`上限${limit}枚のため${room}枚のみ追加しました。`));
 for(const f of files.slice(0,room)){try{items.push(await compressPhoto(f));refreshObsPhotos(false);}catch(e){toast(e.message||String(e));}}
 saveDraftSoon();
}
// ---------- upload ----------
async function uploadObservationPhotos(r){
 const map={...(r.uploadedPhotoMap||{})},used=new Set(),uid=state.user.id;
 const put=async(list,tag)=>{const out=[];for(const [i,x] of list.entries()){
  if(isPhotoPath(x)){out.push(x);continue;}
  const fp=await photoFingerprint(x);let path=map[fp];
  if(!path){path=`${uid}/${r.id}-${tag}${i}-${Date.now().toString(36)}.jpg`;const blob=await (await fetch(x)).blob();const {error}=await state.authClient.storage.from('field-photos').upload(path,blob,{contentType:'image/jpeg',upsert:true});if(error)throw error;map[fp]=path;}
  used.add(fp);out.push(path);}return out;};
 const plant=await put(recordPlantPhotos(r),'p'),habitat=await put(recordHabitatPhotos(r),'h');
 for(const k of Object.keys(map))if(!used.has(k))delete map[k];
 return {plant,habitat,map};
}
// Every photo path this record had on the server before this sync (device list + server copy).
function previousServerPhotos(r){
 const shared=state.sharedRecords.find(x=>x.id===r.id),local=state.records.find(x=>x.id===r.id);
 return [...new Set([...(r.cloudPhotoPaths||[]),...(local?.cloudPhotoPaths||[]),r.photoPath,...(shared?recordPlantPhotos(shared):[]),...(shared?recordHabitatPhotos(shared):[])].filter(isPhotoPath))];
}
// ---------- slider ----------
function photoSlider(items,bucket,recordId=''){
 if(!items.length)return '';
 const labels=items.map(it=>it.label||'');
 return `<div class="photo-slider" data-record-id="${esc(recordId)}"><div class="pg-track">${items.map((it,i)=>{const src=isSafePhoto(it.x)?it.x:cachedSigned(bucket,it.x);return `<div class="pg-slide" data-action="slide-view" data-index="${i}" ${!src&&isPhotoPath(it.x)?`data-sign-bucket="${bucket}" data-sign-path="${esc(it.x)}"`:''}>${src?`<img src="${esc(src)}" alt=""/>`:''}</div>`;}).join('')}</div>${items.length>1?`<div class="pg-meta"><button type="button" class="pg-arrow" data-action="slide-prev" aria-label="${esc(tt('이전 사진','Previous photo','前の写真'))}">‹</button><span class="pg-label" data-labels="${esc(JSON.stringify(labels))}">${esc(labels[0])}</span><span class="pg-dots" aria-hidden="true">${items.map((_,i)=>`<i class="${i===0?'on':''}"></i>`).join('')}</span><button type="button" class="pg-arrow" data-action="slide-next" aria-label="${esc(tt('다음 사진','Next photo','次の写真'))}">›</button></div>`:labels[0]?`<div class="pg-meta single"><span class="pg-label">${esc(labels[0])}</span></div>`:''}</div>`;
}
function observationGallery(r){
 const plant=recordPlantPhotos(r),habitat=recordHabitatPhotos(r);
 if(!plant.length&&!habitat.length)return null;
 const items=[...plant.map((x,i)=>({x,label:`${tt('식물 사진','Plant','植物')} ${i+1}/${plant.length}`})),...habitat.map((x,i)=>({x,label:`${tt('주변 환경','Habitat','周辺環境')} ${i+1}/${habitat.length}`}))];
 // A cloud record whose first photo is already signed for the cover can show it straight away.
 if(!isSafePhoto(items[0].x)&&r.photoUrl&&r.photoPath===items[0].x&&isRemotePhoto(r.photoUrl))state.photoUrlCache[`field-photos/${r.photoPath}`]??={url:r.photoUrl,exp:Date.now()+3000*1000};
 return photoSlider(items,'field-photos',r.id);
}

// ---------- countries ----------
const GEO={countries:null,byCode:{},byName:new Map(),borders:null};
async function loadCountries(){
 if(GEO.countries)return GEO.countries;
 try{const res=await fetch('./assets/geo/countries.json');GEO.countries=await res.json();}catch(e){console.warn('countries',e);GEO.countries=[];}
 for(const c of GEO.countries){GEO.byCode[c.c]=c;for(const a of c.a||[])if(!GEO.byName.has(a))GEO.byName.set(a,c);}
 return GEO.countries;
}
const countryFromName=name=>{const n=txt(name).toLowerCase();return n?GEO.byName.get(n)||null:null;};
const countryLabel=code=>{const c=GEO.byCode[code];return c?(state.locale==='ko'?c.n[1]:state.locale==='ja'?c.n[2]:c.n[0]):'';};
const mineTag=()=>`<span class="tiny-tag mine-tag">${tt('나만 보임','Only me','自分のみ')}</span>`;
// ---------- automatic online saving ----------
const PRIVATE_DETAIL_KEYS=['locality','fieldNumber','collector','population','associatedSpecies','voucher','projectId','locationSource','countryCode','gpsAccuracy'];
// When editing a synced record, fill owner-only fields from this device if the server copy lacks them.
function editableRecord(id){
 const r=getRecord(id);if(!r)return r;
 const local=state.records.find(x=>x.id===id);if(!local||local===r)return r;
 const merged={...r};for(const k of PRIVATE_DETAIL_KEYS){const cur=merged[k];if((cur===undefined||cur===null||cur==='')&&local[k]!==undefined&&local[k]!==null&&local[k]!=='')merged[k]=local[k];}
 return merged;
}
function sharingSection(editing){
 const pre=editing?(editing.hidden||(!editing.onlinePublished&&!editing.isCloud)?'private':'public'):'public';
 const opt=(v,title,desc)=>`<label class="privacy-option"><input type="radio" name="visibility" value="${v}" ${pre===v?'checked':''}/><span><b>${title}</b><small>${desc}</small></span></label>`;
 return `<div class="form-section share-section"><h2>06 / SHARING</h2><div class="privacy-group"><div class="privacy-group-title">${tt('기록 공개 범위','Who can see this record','記録の公開範囲')}</div>${opt('public',tt('공개','Shared','公開'),tt('베타 멤버가 내 도감에서 볼 수 있습니다.','Beta members can see it in your dex.','ベータメンバーが図鑑で見られます。'))}${opt('private',tt('비공개 · 나만 보기','Private · only me','非公開 · 自分のみ'),tt('온라인에 백업되지만 다른 사람에게는 보이지 않습니다.','Backed up online but hidden from everyone else.','オンラインに保存されますが、他の人には表示されません。'))}</div><p class="footnote">${state.member?tt('저장하면 바로 온라인에 저장됩니다. 오프라인이면 인터넷이 연결될 때 자동으로 올라갑니다. 정확한 위치는 위의 ‘위치 공개 수준’을 따릅니다.','Saving uploads the record right away; offline records upload automatically once you are connected. The exact location follows the location privacy setting above.','保存するとすぐにオンラインに保存されます。オフラインの場合は接続時に自動でアップロードされます。正確な位置は上の位置公開設定に従います。'):tt('로그인한 승인 멤버는 저장할 때 온라인에도 자동으로 저장됩니다. 지금은 이 기기에만 저장됩니다.','Approved members are saved online automatically. For now this stays on this device.','承認済みメンバーは保存時に自動でオンライン保存されます。現在はこの端末にのみ保存されます。')}</p></div>`;
}
const localOnlyRecords=()=>state.records.filter(r=>!r.onlinePublished&&!r.isDemo);
async function backupLocalRecords(){
 if(!state.member||!state.user)return toast(tt('승인된 베타 계정으로 로그인해 주세요.','Sign in with an approved beta account.','承認済みのベータアカウントでログインしてください。'));
 const list=localOnlyRecords();if(!list.length)return;
 if(!confirm(tt(`기기에만 있는 기록 ${list.length}개를 비공개로 온라인에 백업할까요? 다른 사람에게는 보이지 않습니다.`,`Back up ${list.length} device-only records online as private?`,`端末のみの記録${list.length}件を非公開でオンラインにバックアップしますか？`)))return;
 for(const r of list)await storeRecord({...r,onlinePublished:true,syncPending:true,hidden:true});
 render();await syncPendingRecords();toast(tt('비공개로 온라인 백업을 시작했습니다.','Private online backup started.','非公開でバックアップを開始しました。'));
}
async function savePrivateDetails(r){
 const row={observation_id:r.id,owner_id:state.user.id,locality:r.locality||null,field_number:r.fieldNumber||null,collector:r.collector||null,population:r.population||null,associated_species:r.associatedSpecies||null,voucher:r.voucher||null,location_source:r.locationSource||null,updated_at:new Date().toISOString()};
 const {error}=await state.authClient.from('field_private_details').upsert(row,{onConflict:'observation_id'});
 if(error)console.warn('Private details not saved (BETA 12 SQL?)',error.message);
}

// BETA 12 — kept plants: up to 5 photos, place picker inside the form, plant detail slider.
const PP_PHOTO_LIMIT=5;
const placePlantPhotos=x=>{const list=(Array.isArray(x?.photo_paths)?x.photo_paths:[]).filter(isPhotoPath).slice(0,PP_PHOTO_LIMIT);return list.length?list:(isPhotoPath(x?.photo_path)?[x.photo_path]:[]);};
async function addPpPhotos(fileList){
 const files=[...(fileList||[])];if(!files.length)return;
 const items=state.ppPhotos||(state.ppPhotos=[]),room=PP_PHOTO_LIMIT-items.length;
 if(room<=0)return toast(tt('식물 사진은 최대 5장입니다.','Up to 5 plant photos.','植物の写真は最大5枚です。'));
 if(files.length>room)toast(tt(`최대 5장까지라 ${room}장만 추가했습니다.`,`Only ${room} added (limit 5).`,`上限5枚のため${room}枚のみ追加しました。`));
 for(const f of files.slice(0,room)){try{items.push(await compressPhoto(f));refreshPpPhotos();}catch(e){toast(e.message||String(e));}}
}
// When the owner has two or more places, the plant form asks which place it belongs to.
async function uploadPlantPhotos(id,existing){
 const out=[],uploaded=[];
 for(const [i,x] of (state.ppPhotos||[]).entries()){
  if(isPhotoPath(x)){out.push(x);continue;}
  const path=`${state.user.id}/${id}-${i}-${Date.now().toString(36)}.jpg`,blob=await (await fetch(x)).blob();
  const {error}=await state.authClient.storage.from('place-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});
  if(error){if(uploaded.length)await state.authClient.storage.from('place-photos').remove(uploaded).catch(()=>{});throw error;}
  uploaded.push(path);out.push(path);
 }
 const stale=existing?placePlantPhotos(existing).filter(p=>!out.includes(p)):[];
 return {paths:out,uploaded,stale};
}
// ---------- account switch: operator → personal deletes operator places (one database transaction) ----------
// ---------- adaptive slider height ----------


// BETA 13 — "Venue · place name" label, kept plants without a space + public/private kept plants,
// map search zoom, per-section album/camera pickers, photo slider that settles on one photo.
const SQL13_NOTICE=()=>tt('먼저 Supabase에 BETA 13 SQL(supabase/beta13_kept_plants_visibility.sql)을 적용하세요.','Apply the BETA 13 database SQL (supabase/beta13_kept_plants_visibility.sql) first.','まずBETA 13のSQL（supabase/beta13_kept_plants_visibility.sql）を適用してください。');
const isBeta13SchemaError=e=>/'is_hidden' column of 'place_plants'|place_plants.*is_hidden|is_hidden.*place_plants|null value in column "place_id"/i.test(e?.message||String(e||''));
// true when the BETA 13 columns exist (kept plants without a space, is_hidden). Probes once if unknown.
async function beta13Ready(){
 if(state.beta13Missing===undefined&&state.authClient){const probe=await state.authClient.from('place_plants').select('id,is_hidden').limit(1);state.beta13Missing=!!probe.error;}
 return state.beta13Missing===false;
}
async function detectBeta13(client,plants){
 if(plants.error){state.beta13Missing=true;return;}
 const rows=plants.data||[];
 if(rows.length){state.beta13Missing=!('is_hidden' in rows[0]);return;}
 const probe=await client.from('place_plants').select('id,is_hidden').limit(1);state.beta13Missing=!!probe.error;
}

function rememberPerson(p){
 if(!p?.id)return;const old=state.people[p.id]||{};
 state.people[p.id]={...old,id:p.id,display_name:p.display_name??old.display_name,avatar_path:p.avatar_path===undefined?old.avatar_path??null:p.avatar_path,public_email:p.public_email===undefined?old.public_email??null:p.public_email,account_type:p.account_type??old.account_type??null,personal_category:p.personal_category===undefined?old.personal_category??null:p.personal_category};
}

// ---------- ⑧ photo pickers: [▧ album] [◉ camera] per section, small "+" tile with the count ----------
const PHOTO_NOTE_COVER=()=>tt('첫 사진이 대표 · 가로 16:9, 세로 3:4로 자동 자르기','First photo is the cover · auto-cropped to 16:9 (landscape) or 3:4 (portrait)','最初の写真がカバー · 横16:9・縦3:4に自動トリミング');
function pickButtons(gallery,camera,full,busy=false){
 const b=(input,icon,label)=>`<button type="button" class="pick-btn" data-action="photo-pick" data-input="${input}" ${full||busy?'disabled':''}><span aria-hidden="true">${icon}</span> ${label}</button>`;
 return `<div class="photo-pick-row">${b(gallery,'▧',tt('앨범','Library','アルバム'))}${b(camera,'◉',tt('촬영','Camera','撮影'))}</div>`;
}
function photoFieldHead(title,gallery,camera,full){return `<div class="photo-field-head"><span class="photo-field-title">${title}</span>${pickButtons(gallery,camera,full)}</div>`;}
const addTile=(action,attrs,n,limit)=>`<button type="button" class="vp-add" data-action="${action}" ${attrs} aria-label="${esc(tt('사진 추가','Add photos','写真を追加'))}"><b aria-hidden="true">＋</b><small>${n}/${limit}</small></button>`;
function syncPickButtons(grid,full){grid?.closest('.photo-field')?.querySelectorAll('.pick-btn').forEach(b=>{b.disabled=!!full;});}
function photoThumb(src,bucket,path,coverAttrs,removeAttrs,i,showCover=true){
 return `<div class="vp-thumb"><span class="vp-img" ${!src&&path?`data-sign-bucket="${bucket}" data-sign-path="${esc(path)}"`:''}>${src?`<img src="${esc(src)}" alt=""/>`:''}</span>${showCover?(i===0?`<span class="vp-cover">${tt('대표','COVER','カバー')}</span>`:`<button type="button" class="vp-btn vp-make-cover" ${coverAttrs} data-index="${i}">${tt('대표로','Set cover','カバーに')}</button>`):''}<button type="button" class="vp-btn vp-remove" ${removeAttrs} data-index="${i}" aria-label="${esc(tt('사진 삭제','Remove photo','写真を削除'))}">✕</button></div>`;
}
function obsPhotoGrid(kind){
 const habitat=kind==='habitat',items=habitat?state.formHabitat:state.formPhotos,limit=habitat?HABITAT_PHOTO_LIMIT:PLANT_PHOTO_LIMIT;
 return items.map((x,i)=>{const src=isSafePhoto(x)?x:cachedSigned('field-photos',x);return photoThumb(src,'field-photos',isPhotoPath(x)?x:'',`data-action="obs-photo-cover" data-kind="${kind}"`,`data-action="obs-photo-remove" data-kind="${kind}"`,i,!habitat);}).join('')
  +(items.length<limit?addTile('obs-photo-add',`data-kind="${kind}"`,items.length,limit):'');
}
function obsPhotoSection(){
 return `<div class="form-section"><h2>01 / PHOTOGRAPH</h2>
 <div class="form-field photo-field">${photoFieldHead(tt('식물 사진','PLANT PHOTOS','植物の写真'),'#gallery-input','#camera-input',state.formPhotos.length>=PLANT_PHOTO_LIMIT)}<div id="obs-photo-grid" class="vp-grid">${obsPhotoGrid('plant')}</div></div>
 <div class="form-field photo-field habitat-field">${photoFieldHead(tt('주변 환경 사진','HABITAT PHOTOS','周辺環境の写真'),'#habitat-gallery-input','#habitat-camera-input',state.formHabitat.length>=HABITAT_PHOTO_LIMIT)}<div id="habitat-photo-grid" class="vp-grid">${obsPhotoGrid('habitat')}</div></div>
 <input id="gallery-input" class="hidden-input" type="file" accept="image/*" multiple/><input id="camera-input" class="hidden-input" type="file" accept="image/*" capture="environment"/><input id="habitat-gallery-input" class="hidden-input" type="file" accept="image/*" multiple/><input id="habitat-camera-input" class="hidden-input" type="file" accept="image/*" capture="environment"/>
 <p class="photo-note">${tt('첫 사진이 대표 · 가로 16:9, 세로 3:4로 자동 자르기 · 위치가 드러나는 표지판은 피해 주세요','First photo is the cover · auto-cropped to 16:9 (landscape) or 3:4 (portrait) · avoid signs that reveal the location','最初の写真がカバー · 横16:9・縦3:4に自動トリミング · 場所が分かる標識は避けてください')}</p></div>`;
}
function refreshObsPhotos(save=true){
 for(const [id,kind,limit] of [['#obs-photo-grid','plant',PLANT_PHOTO_LIMIT],['#habitat-photo-grid','habitat',HABITAT_PHOTO_LIMIT]]){const g=$(id);if(!g)continue;g.innerHTML=obsPhotoGrid(kind);translateUI(g);hydrateSigned(g).catch(console.warn);syncPickButtons(g,(kind==='habitat'?state.formHabitat:state.formPhotos).length>=limit);}
 if(save)saveDraftSoon();
}
function ppPhotoGrid(){
 const items=state.ppPhotos||[];
 return items.map((x,i)=>{const src=isSafePhoto(x)?x:cachedSigned('place-photos',x);return photoThumb(src,'place-photos',isPhotoPath(x)?x:'','data-action="pp-photo-cover"','data-action="pp-photo-remove"',i);}).join('')
  +(items.length<PP_PHOTO_LIMIT?addTile('pp-photo-add','',items.length,PP_PHOTO_LIMIT):'');
}
function ppPhotoSection(){
 return `<div class="form-section"><h2>01 / PHOTOGRAPH</h2><div class="form-field photo-field">${photoFieldHead(tt('식물 사진','PLANT PHOTOS','植物の写真'),'#pp-gallery-input','#pp-camera-input',(state.ppPhotos||[]).length>=PP_PHOTO_LIMIT)}<div id="pp-photo-grid" class="vp-grid">${ppPhotoGrid()}</div><small class="photo-note">${PHOTO_NOTE_COVER()}</small></div><input id="pp-gallery-input" class="hidden-input" type="file" accept="image/*" multiple/><input id="pp-camera-input" class="hidden-input" type="file" accept="image/*" capture="environment"/></div>`;
}
function refreshPpPhotos(){const g=$('#pp-photo-grid');if(!g)return;g.innerHTML=ppPhotoGrid();translateUI(g);hydrateSigned(g).catch(console.warn);syncPickButtons(g,(state.ppPhotos||[]).length>=PP_PHOTO_LIMIT);}
function profileHeader(){
 const name=state.profile?.display_name||state.user?.user_metadata?.display_name||tt('나의 식물 기록','My plant notes','自分の植物記録');
 const path=state.profile?.avatar_path||null,uid=state.user?.id;
 let actions='';
 if(state.user&&state.member)actions=`<div class="profile-head-actions photo-field">${pickButtons('#avatar-input','#avatar-camera-input',false,state.avatarBusy)}${path?`<button class="light-button" type="button" data-action="avatar-remove" ${state.avatarBusy?'disabled':''}>${tt('사진 삭제','Remove','削除')}</button>`:''}<button class="light-button" type="button" data-action="user-open" data-user-id="${esc(uid)}">${tt('내 도감 보기','My dex','自分の図鑑')}</button></div><input type="file" id="avatar-input" class="hidden-input" accept="image/*"/><input type="file" id="avatar-camera-input" class="hidden-input" accept="image/*" capture="user"/><small class="photo-note">${state.avatarBusy?tt('업로드 중…','Uploading…','アップロード中…'):tt('프로필 사진 · 1:1 정사각형으로 자동 자르기','Profile photo · auto-cropped to a 1:1 square','プロフィール写真 · 1:1の正方形に自動トリミング')}</small>`;
 else if(state.user)actions=`<small>${tt('프로필 사진과 도감은 승인된 베타 멤버만 사용할 수 있습니다.','Profile photos and the dex need an approved beta account.','プロフィール写真と図鑑は承認済みメンバーのみ利用できます。')}</small>`;
 return `<div class="profile-head">${avatarMarkup(path,name,'avatar-lg')}<div class="profile-head-info"><strong>${esc(name)}</strong><span class="account-label">${esc(accountLabel(state.profile)||tt('개인 탐사 아카이브','Personal field archive','個人の探査アーカイブ'))}</span>${actions}</div></div>`;
}

// ---------- ③ ④ kept plants: optional space, public / private ----------
const ppHidden=x=>!!x?.is_hidden;
const ppPrivateTag=x=>ppHidden(x)?`<span class="tiny-tag private-tag">${tt('비공개','PRIVATE','非公開')}</span>`:'';
const ppVisibilityButton=(x,cls='light-button')=>`<button class="${cls}" type="button" data-action="${ppHidden(x)?'pp-unhide':'pp-hide'}" data-plant-id="${esc(x.id)}">${ppHidden(x)?tt('다시 공개','MAKE PUBLIC','再公開'):tt('비공개로 전환','MAKE PRIVATE','非公開にする')}</button>`;
function ppVisibilitySection(pp){
 if(state.beta13Missing)return `<div class="form-section"><h2>04 / SHARING</h2><p class="mini-muted">${SQL13_NOTICE()}</p></div>`;
 const pre=ppHidden(pp)?'private':'public';
 const opt=(v,title,desc)=>`<label class="privacy-option"><input type="radio" name="ppVisibility" value="${v}" ${pre===v?'checked':''}/><span><b>${title}</b><small>${desc}</small></span></label>`;
 return `<div class="form-section"><h2>04 / SHARING</h2><div class="privacy-group"><div class="privacy-group-title">${tt('보유 식물 공개 범위','Who can see this plant','保有植物の公開範囲')}</div>${opt('public',tt('공개','Shared','公開'),tt('베타 멤버의 공간 화면·도감·검색에 표시됩니다.','Shown to beta members on the space, in the dex and in search.','ベータメンバーのスペース画面・図鑑・検索に表示されます。'))}${opt('private',tt('비공개 · 나만 보기','Private · only me','非公開 · 自分のみ'),tt('나에게만 보이고, 사진도 다른 사람은 볼 수 없습니다. 언제든 다시 공개할 수 있습니다.','Only you can see it and its photos. You can make it public again anytime.','自分だけに表示され、写真も他の人は見られません。いつでも再公開できます。'))}</div></div>`;
}


// ---------- ⑦ photo slider: no height change while swiping; settle exactly on one photo ----------
function sliderIndex(track){
 const n=track.children.length;if(!n)return 0;
 return Math.max(0,Math.min(n-1,Math.round(track.scrollLeft/Math.max(1,track.getBoundingClientRect().width))));
}
function updateSliderMeta(track){
 const slider=track.closest('.photo-slider');if(!slider)return;const idx=sliderIndex(track);
 const label=slider.querySelector('.pg-label');if(label?.dataset.labels){try{label.textContent=JSON.parse(label.dataset.labels)[idx]||'';}catch{}}
 slider.querySelectorAll('.pg-dots i').forEach((d,i)=>d.classList.toggle('on',i===idx));
}
function fitSliderHeight(track){
 if(track._touching||track._moving)return;
 const slides=track.children;if(!slides.length)return;
 const h=slides[sliderIndex(track)].offsetHeight;if(h)track.style.height=`${h}px`;
}
function settleSlider(track){
 clearTimeout(track._settle);if(track._touching)return;
 // One photo per swipe: never settle more than one photo away from where the touch started.
 let idx=sliderIndex(track);if(Number.isInteger(track._startIdx))idx=Math.max(track._startIdx-1,Math.min(track._startIdx+1,idx));
 const slide=track.children[idx];if(!slide)return;
 const off=slide.getBoundingClientRect().left-track.getBoundingClientRect().left;
 if(Math.abs(off)>1&&(track._tries||0)<3){track._tries=(track._tries||0)+1;track._moving=true;track.scrollTo({left:track.scrollLeft+off,behavior:'smooth'});scheduleSettle(track,260);return;}
 track._tries=0;track._moving=false;track._startIdx=null;updateSliderMeta(track);fitSliderHeight(track);
}
function scheduleSettle(track,ms=140){clearTimeout(track._settle);track._settle=setTimeout(()=>settleSlider(track),ms);}
function sliderIndexChanged(track){updateSliderMeta(track);track._moving=true;scheduleSettle(track);}
function slideBy(button,dir){
 const track=button.closest('.photo-slider')?.querySelector('.pg-track');if(!track)return;
 const from=Number.isInteger(track._startIdx)?track._startIdx:sliderIndex(track),slide=track.children[Math.max(0,Math.min(track.children.length-1,from+dir))];if(!slide)return;
 track._startIdx=from+dir;
 track._moving=true;track.scrollTo({left:track.scrollLeft+slide.getBoundingClientRect().left-track.getBoundingClientRect().left,behavior:'smooth'});scheduleSettle(track,320);
}
document.addEventListener('touchstart',e=>{const t=e.target.closest?.('.pg-track');if(t){t._startIdx=sliderIndex(t);t._touching=true;t._moving=true;clearTimeout(t._settle);}},{passive:true,capture:true});
const sliderTouchEnd=e=>{const t=e.target.closest?.('.pg-track');if(t){t._touching=false;scheduleSettle(t);}};
document.addEventListener('touchend',sliderTouchEnd,{passive:true,capture:true});
document.addEventListener('touchcancel',sliderTouchEnd,{passive:true,capture:true});
document.addEventListener('scrollend',e=>{const t=e.target;if(t?.classList?.contains('pg-track')&&!t._touching)scheduleSettle(t,30);},true);


const routeCoords=s=>s&&s.latitude!==''&&s.longitude!==''&&s.latitude!==null&&s.longitude!==null&&Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude))&&Math.abs(Number(s.latitude))<=90&&Math.abs(Number(s.longitude))<=180;
const routeTrackFor=p=>Array.isArray(p?.routeTrack)?p.routeTrack:[];
// ============================================================================================
// BETA 15 — PLANT MATTER. Four tabs: HOME (event posters) · PLANT (my plants + wild finds) ·
// MATTER (events, shops) · OPTION. Maps, places and expeditions are gone; their data stays on the server.
// ============================================================================================
const SQL15_NOTICE=()=>tt('먼저 Supabase에 BETA 15 SQL(supabase/beta15_plants_matter.sql)을 적용하세요.','Apply the BETA 15 database SQL (supabase/beta15_plants_matter.sql) first.','まずBETA 15のSQL（supabase/beta15_plants_matter.sql）を適用してください。');
const isBeta15SchemaError=e=>/plant_categories|category_id|origin_region|origin_place|seed_parent|pollen_parent|matter_events|matter_shops|is_app_admin|matter-media/i.test(e?.message||String(e||''));
const ICON_BACK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 7 12l8 8"/></svg>';
const ICON_PLUS='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18"/></svg>';
const ICON_MENU='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
const ICON_ARROW='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12 6l6 6-6 6"/></svg>';
Object.assign(state,{plantView:null,matterView:null,optionView:null,categories:[],beta15Missing:false,openCats:new Set(),openRegions:new Set(),events:[],shops:[],matterMissing:false,isAdmin:false,mediaItems:[],mediaKind:null});

// ---------- broad regions → countries / islands (⑥) ----------
const REGIONS=[['southeast_asia','동남아시아','Southeast Asia','東南アジア'],['east_asia','동아시아','East Asia','東アジア'],['south_asia','남아시아','South Asia','南アジア'],['oceania','오세아니아','Oceania','オセアニア'],['africa','아프리카','Africa','アフリカ'],['middle_east','중동·서아시아','Middle East & West Asia','中東・西アジア'],['europe','유럽','Europe','ヨーロッパ'],['north_america','북아메리카','North America','北アメリカ'],['central_america','중앙아메리카·카리브','Central America & Caribbean','中米・カリブ'],['south_america','남아메리카','South America','南アメリカ']];
const REGION_COUNTRIES={
 southeast_asia:'MY ID PH TH VN LA KH MM BN SG TL',east_asia:'KR JP CN TW KP MN HK MO',south_asia:'IN LK NP BT BD PK MV IO',
 oceania:'AU NZ PG FJ SB VU NC PF WS TO KI FM MH PW NR TV NU CK NF GU MP AS WF TK PN CX CC HM UM',
 africa:'ZA MG NA BW ZW ZM MZ MW TZ KE UG RW BI ET SO DJ ER SD SS EG LY TN DZ MA EH MR ML NE TD NG BJ TG GH CI LR SL GN GW SN GM CV BF CM CF GQ GA CG CD AO ST MU SC KM RE YT SZ LS SH',
 middle_east:'TR IR IQ SA YE OM AE IL PS JO LB SY KW QA BH CY AF AZ AM GE KZ UZ TM KG TJ',
 europe:'GB IE FR DE NL BE LU CH AT IT ES PT AD MC SM VA MT GR AL MK ME RS BA HR SI XK BG RO MD UA BY RU PL CZ SK HU LT LV EE FI SE NO DK IS FO AX GI IM JE GG LI SJ',
 north_america:'US CA GL BM PM',central_america:'MX GT BZ SV HN NI CR PA CU JM HT DO PR BS TT BB LC VC GD AG DM KN AW CW SX BQ AI MS VG VI KY TC GP MQ BL MF',
 south_america:'BR CO EC PE VE BO CL AR PY UY GY SR GF FK GS'};
const REGION_BY_COUNTRY=Object.fromEntries(Object.entries(REGION_COUNTRIES).flatMap(([r,list])=>list.split(' ').map(c=>[c,r])));
// Islands and areas that plant people use instead of countries (origin only).
const AREAS={borneo:['southeast_asia','보르네오','Borneo','ボルネオ'],sumatra:['southeast_asia','수마트라','Sumatra','スマトラ'],sulawesi:['southeast_asia','술라웨시','Sulawesi','スラウェシ'],java:['southeast_asia','자바','Java','ジャワ'],new_guinea:['oceania','뉴기니','New Guinea','ニューギニア'],socotra:['africa','소코트라','Socotra','ソコトラ'],amazon:['south_america','아마존','Amazon','アマゾン'],andes:['south_america','안데스','Andes','アンデス']};
const regionOf=code=>AREAS[code]?.[0]||REGION_BY_COUNTRY[code]||null;
const regionName=id=>{const r=REGIONS.find(x=>x[0]===id);return r?tt(r[1],r[2],r[3]):'';};
const placeName=code=>AREAS[code]?tt(AREAS[code][1],AREAS[code][2],AREAS[code][3]):(countryLabel(code)||code||'');
function originLabel(x){
 if(x?.origin_region){const r=regionName(x.origin_region);return x.origin_place?`${r} › ${placeName(x.origin_place)}`:r;}
 return txt(x?.origin);
}
const recentPlaces=()=>{try{return JSON.parse(localStorage.getItem('pm-recent-places')||'[]').filter(c=>regionOf(c));}catch{return [];}};
function rememberPlace(code){if(!code)return;try{localStorage.setItem('pm-recent-places',JSON.stringify([code,...recentPlaces().filter(c=>c!==code)].slice(0,6)));}catch{}}

// ---------- place picker: broad region → country / island (③ ⑥) ----------
// mode 'country' (wild finds: a country is required to choose), 'origin' (kept plants: region, country or island).
function placePicker({id,mode,region='',place='',regionInput='',placeInput,labelInput=''}){
 return `<div class="place-picker" id="${id}" data-mode="${mode}" data-region-input="${regionInput}" data-place-input="${placeInput}" data-label-input="${labelInput}">
 ${regionInput?`<input type="hidden" name="${regionInput}" value="${esc(region||'')}"/>`:''}<input type="hidden" name="${placeInput}" value="${esc(place||'')}"/>${labelInput?`<input type="hidden" name="${labelInput}" value=""/>`:''}
 <button type="button" class="picker-current" data-action="picker-open" data-picker="${id}"><span class="picker-value"></span><span class="picker-change">${tt('선택','CHOOSE','選択')}</span></button>
 <div class="picker-panel hidden"></div></div>`;
}
function pickerValues(el){
 const form=el.closest('form'),get=n=>n?form?.elements.namedItem(n)?.value||'':'';
 const place=get(el.dataset.placeInput),region=get(el.dataset.regionInput)||regionOf(place)||'';
 return {place,region,label:get(el.dataset.labelInput)};
}
function syncPicker(el){
 const {place,region,label}=pickerValues(el),v=el.querySelector('.picker-value');if(!v)return;
 const text=place?(el.dataset.mode==='country'?`${placeName(place)} · ${regionName(region)}`:`${regionName(region)} › ${placeName(place)}`):region?regionName(region):label;
 v.textContent=text||tt('선택 안 함','Not set','未設定');v.classList.toggle('unset',!text);
}
function syncPickers(root=document){root.querySelectorAll('.place-picker').forEach(syncPicker);}
function pickerChoices(el,region){
 const origin=el.dataset.mode==='origin',areas=origin?Object.keys(AREAS).filter(k=>AREAS[k][0]===region):[];
 const countries=(REGION_COUNTRIES[region]||'').split(' ').filter(c=>GEO.byCode[c]);
 return [...areas,...countries];
}
function renderPickerPanel(el,query=''){
 const panel=el.querySelector('.picker-panel'),origin=el.dataset.mode==='origin',open=el.dataset.open||'';
 const choice=(region,place,label,sub='')=>`<button type="button" class="picker-choice" data-action="picker-choose" data-picker="${el.id}" data-region="${region}" data-place="${place}">${esc(label)}${sub?` <small>${esc(sub)}</small>`:''}</button>`;
 const q=txt(query).toLocaleLowerCase();
 let body='';
 if(q){
  const all=[...(origin?Object.keys(AREAS):[]),...Object.keys(REGION_BY_COUNTRY).filter(c=>GEO.byCode[c])];
  const hits=all.filter(code=>{const c=GEO.byCode[code],names=AREAS[code]?AREAS[code].slice(1):[...(c?.n||[]),...(c?.a||[])];return names.some(n=>String(n).toLocaleLowerCase().includes(q));}).slice(0,30);
  body=hits.length?hits.map(code=>choice(regionOf(code),code,placeName(code),regionName(regionOf(code)))).join(''):`<p class="mini-muted">${tt('검색 결과가 없습니다.','No matches.','見つかりません。')}</p>`;
 }else{
  const recent=recentPlaces().filter(c=>origin||!AREAS[c]);
  body=`${recent.length?`<div class="picker-recent">${recent.map(code=>choice(regionOf(code),code,placeName(code))).join('')}</div>`:''}
  ${REGIONS.map(([id])=>`<div class="picker-region-block ${open===id?'open':''}"><button type="button" class="picker-region" data-action="picker-region" data-picker="${el.id}" data-region="${id}" aria-expanded="${open===id}">${esc(regionName(id))}<span aria-hidden="true">${open===id?'−':'+'}</span></button>${open===id?`<div class="picker-list">${origin?choice(id,'',tt(`${regionName(id)} 전체`,`All of ${regionName(id)}`,`${regionName(id)}全体`)):''}${pickerChoices(el,id).map(code=>choice(id,code,placeName(code),AREAS[code]?tt('섬·지역','island / area','島・地域'):'')).join('')}</div>`:''}</div>`).join('')}
  ${choice('','',tt('선택 안 함','Not set','未設定'))}`;
 }
 panel.innerHTML=`<input type="search" class="picker-search" data-picker="${el.id}" placeholder="${esc(tt('나라·섬 이름 검색 (예: 말레이, Borneo)','Search a country or island (e.g. Malay, Borneo)','国・島の名前で検索（例：マレー、Borneo）'))}" value="${esc(query)}" autocomplete="off"/><div class="picker-body">${body}</div>`;
}
function togglePicker(id){
 const el=document.getElementById(id);if(!el)return;const panel=el.querySelector('.picker-panel'),opening=panel.classList.contains('hidden');
 document.querySelectorAll('.place-picker .picker-panel').forEach(p=>p.classList.add('hidden'));
 if(!opening)return;
 el.dataset.open=pickerValues(el).region||'';renderPickerPanel(el);panel.classList.remove('hidden');
}
function choosePlace(id,region,place){
 const el=document.getElementById(id);if(!el)return;const form=el.closest('form'),set=(n,v)=>{const f=n&&form?.elements.namedItem(n);if(f)f.value=v;};
 set(el.dataset.regionInput,region);set(el.dataset.placeInput,place);set(el.dataset.labelInput,place&&GEO.byCode[place]?GEO.byCode[place].n[0]:'');
 if(place)rememberPlace(place);
 el.querySelector('.picker-panel').classList.add('hidden');syncPicker(el);
 if(form?.id==='observation-form')saveDraftSoon();
}

// ---------- plant categories (④ ⑤) ----------
const DEFAULT_CATEGORIES=()=>['Orchid','Caudex','Jungle Plants','Staghorn Fern','Bromeliad',tt('유묘 / 파종','Seedlings / Sowing','実生 / 播種'),tt('선인장','Cactus','サボテン'),'Tropical Plants','Tillandsia'];
const bySort=(a,b)=>(a.sort_order||0)-(b.sort_order||0)||String(a.created_at||'').localeCompare(String(b.created_at||''));
const topCats=()=>state.categories.filter(c=>!c.parent_id).sort(bySort);
const subCats=id=>state.categories.filter(c=>c.parent_id===id).sort(bySort);
const myPlants=()=>state.placePlants.filter(x=>x.owner_id===state.user?.id);
const plantsIn=id=>myPlants().filter(x=>x.category_id===id);
const countTop=id=>{const ids=[id,...subCats(id).map(c=>c.id)];return myPlants().filter(x=>ids.includes(x.category_id)).length;};
const unsorted=()=>myPlants().filter(x=>!x.category_id||!state.categories.some(c=>c.id===x.category_id));
function catPath(id,list=state.categories){const c=list.find(x=>x.id===id);if(!c)return '';const p=c.parent_id&&list.find(x=>x.id===c.parent_id);return p?`${p.name} › ${c.name}`:c.name;}
async function loadCategories(){
 if(!state.member||!state.authClient||!state.user){state.categories=[];return;}
 const {data,error}=await state.authClient.from('plant_categories').select('*').eq('owner_id',state.user.id).order('sort_order',{ascending:true});
 if(error){state.beta15Missing=true;state.categories=[];console.warn('BETA 15 SQL required',error.message);return;}
 state.beta15Missing=false;state.categories=data||[];
 if(!state.categories.length)await seedCategories();
}
// The reference categories are created once per account; deleting them later does not bring them back.
async function seedCategories(){
 const key=`pm-cats-seeded-${state.user.id}`;try{if(localStorage.getItem(key))return;}catch{}
 const {data,error}=await state.authClient.from('plant_categories').insert(DEFAULT_CATEGORIES().map((name,i)=>({owner_id:state.user.id,name,sort_order:i}))).select('*');
 if(error){console.warn('category seed',error.message);return;}
 state.categories=data||[];try{localStorage.setItem(key,'1');}catch{}
}
async function addCategory(parentId=null){
 if(!requireCommunity())return;if(state.beta15Missing)return toast(SQL15_NOTICE());
 const name=txt(prompt(parentId?tt(`‘${catPath(parentId)}’ 아래에 만들 하위 분류 이름`,`Name of the new sub-category under “${catPath(parentId)}”`,`「${catPath(parentId)}」の下位分類の名前`):tt('새 분류 이름 (예: Begonia)','New category name (e.g. Begonia)','新しい分類の名前（例：Begonia）'))||'').slice(0,40);
 if(!name)return;
 const siblings=parentId?subCats(parentId):topCats();
 const {error}=await state.authClient.from('plant_categories').insert({owner_id:state.user.id,parent_id:parentId,name,sort_order:siblings.length?Math.max(...siblings.map(c=>c.sort_order||0))+1:0});
 if(error)return toast(isBeta15SchemaError(error)?SQL15_NOTICE():error.message);
 if(parentId)state.openCats.add(parentId);
 await loadCategories();rerenderKeepScroll();toast(tt('분류를 추가했습니다.','Category added.','分類を追加しました。'));
}
async function renameCategory(id){
 const c=state.categories.find(x=>x.id===id);if(!c||!requireCommunity())return;
 const name=txt(prompt(tt('새 이름','New name','新しい名前'),c.name)||'').slice(0,40);if(!name||name===c.name)return;
 const {error}=await state.authClient.from('plant_categories').update({name}).eq('id',id).eq('owner_id',state.user.id);
 if(error)return toast(error.message);
 await loadCategories();rerenderKeepScroll();
}
async function deleteCategory(id){
 const c=state.categories.find(x=>x.id===id);if(!c||!requireCommunity())return;
 const ids=[id,...subCats(id).map(s=>s.id)],n=myPlants().filter(x=>ids.includes(x.category_id)).length;
 if(!confirm(tt(`‘${catPath(id)}’ 분류를 삭제할까요?${subCats(id).length?' 하위 분류도 함께 삭제됩니다.':''}${n?` 들어 있던 식물 ${n}개는 ‘미분류’로 옮겨집니다.`:''}`,`Delete “${catPath(id)}”?${subCats(id).length?' Its sub-categories are deleted too.':''}${n?` Its ${n} plant(s) move to “Unsorted”.`:''}`,`「${catPath(id)}」を削除しますか？${subCats(id).length?'下位分類も削除されます。':''}${n?`植物${n}件は「未分類」に移動します。`:''}`)))return;
 const {error}=await state.authClient.from('plant_categories').delete().eq('id',id).eq('owner_id',state.user.id);
 if(error)return toast(error.message);
 for(const x of state.placePlants)if(ids.includes(x.category_id))x.category_id=null;
 state.openCats.delete(id);await loadCategories();rerenderKeepScroll();toast(tt('분류를 삭제했습니다.','Category deleted.','分類を削除しました。'));
}

// ---------- shared pieces ----------
function bigRow({action,attrs='',title,sub='',count=null,empty=false,badge=0}){
 return `<button type="button" class="bl-row${empty?' is-empty':''}" data-action="${action}" ${attrs}><span class="bl-title">${esc(title)}${count===null?'':` <small class="bl-count">(${count})</small>`}${badge?` <span class="bl-badge">${badge}</span>`:''}</span>${sub?`<span class="bl-sub">${esc(sub)}</span>`:''}</button>`;
}
const allTotal=n=>`<div class="all-total"><small>All</small><strong>${n}</strong></div>`;
const loginNeeded=what=>`<div class="info">${what}</div><button type="button" class="light-button wide" data-action="option-view" data-view="account">${tt('로그인하기','SIGN IN','ログイン')} →</button>`;

// ---------- PLANT tab (① ④ ⑤) ----------
const myFinds=()=>samples().filter(r=>!r.isDemo&&canEdit(r));
const findCountry=r=>r?.countryCode||countryFromName(r?.country)?.c||null;
function plantScreen(){
 if(state.plantView==='mine')return myPlantsScreen();
 if(state.plantView==='wild')return wildScreen();
 return `<section class="page bl-page"><div class="big-list lined">${bigRow({action:'plant-view',attrs:'data-view="mine"',title:'My Plants',sub:tt('내 식물 · 분류별 관리','MY COLLECTION BY CATEGORY','マイ植物・分類別'),count:state.member?myPlants().length:null})}${bigRow({action:'plant-view',attrs:'data-view="wild"',title:'Wild Finds',sub:tt('야생에서 발견한 식물','PLANTS FOUND IN THE WILD','野外で見つけた植物'),count:myFinds().length})}</div></section>`;
}
function plantRow(x){
 const cover=placePlantPhotos(x)[0]||null,src=cachedSigned('place-photos',cover);
 const meta=[ppHidden(x)?tt('비공개','PRIVATE','非公開'):'',x.identification_status==='verified'?tt('동정 완료','Identified','同定済み'):'',originLabel(x)].filter(Boolean);
 return `<button type="button" class="pl-row" data-action="pp-view" data-plant-id="${esc(x.id)}"><span class="pl-thumb" ${!src&&cover?`data-sign-bucket="place-photos" data-sign-path="${esc(cover)}"`:''}>${src?`<img src="${esc(src)}" alt="" loading="lazy"/>`:botanicalSvg}</span><span class="pl-copy"><em>${esc(x.scientific_name)}</em>${meta.length?`<small>${meta.map(esc).join(' · ')}</small>`:''}</span><span class="pl-arrow" aria-hidden="true">›</span></button>`;
}
function catActions(id,top){
 return `<div class="cat-actions"><button type="button" data-action="plant-add-in" data-cat-id="${esc(id)}">＋ ${tt('식물','Plant','植物')}</button>${top?`<button type="button" data-action="cat-sub-add" data-cat-id="${esc(id)}">＋ ${tt('하위 분류','Sub-category','下位分類')}</button>`:''}<button type="button" data-action="cat-rename" data-cat-id="${esc(id)}">${tt('이름 변경','Rename','名前変更')}</button><button type="button" data-action="cat-delete" data-cat-id="${esc(id)}">${tt('삭제','Delete','削除')}</button></div>`;
}
function catSublist(c){
 const subs=subCats(c.id).map(s=>{const n=plantsIn(s.id).length,open=state.openCats.has(s.id);return `<div class="sub-block"><button type="button" class="sub-row${n?'':' is-empty'}" data-action="cat-toggle" data-cat-id="${esc(s.id)}" aria-expanded="${open}"><span>${esc(s.name)}</span> <small>(${n})</small></button>${open?`<div class="sub-plants">${plantsIn(s.id).map(plantRow).join('')}${catActions(s.id,false)}</div>`:''}</div>`;}).join('');
 return `<div class="cat-sub">${subs}${plantsIn(c.id).map(plantRow).join('')}${catActions(c.id,true)}</div>`;
}
function myPlantsScreen(){
 if(!state.user||!state.member)return `<section class="page bl-page"><h1 class="screen-title">My Plants</h1>${loginNeeded(tt('내 식물 관리는 승인된 베타 계정으로 로그인하면 사용할 수 있습니다.','Sign in with an approved beta account to manage your plants.','マイ植物は承認済みのベータアカウントで使えます。'))}</section>`;
 if(state.beta07Missing)return `<section class="page bl-page"><div class="info warning">${SQL07_NOTICE()}</div></section>`;
 const rows=topCats().map(c=>{const n=countTop(c.id),open=state.openCats.has(c.id);return `<div class="cat-block${open?' open':''}">${bigRow({action:'cat-toggle',attrs:`data-cat-id="${esc(c.id)}" aria-expanded="${open}"`,title:c.name,count:n,empty:!n})}${open?catSublist(c):''}</div>`;}).join('');
 const loose=unsorted(),lo=state.openCats.has('__none');
 const looseRow=loose.length?`<div class="cat-block${lo?' open':''}">${bigRow({action:'cat-toggle',attrs:`data-cat-id="__none" aria-expanded="${lo}"`,title:tt('미분류','Unsorted','未分類'),count:loose.length})}${lo?`<div class="cat-sub">${loose.map(plantRow).join('')}</div>`:''}</div>`:'';
 return `<section class="page bl-page plants-page">${state.beta15Missing?`<div class="info warning">${SQL15_NOTICE()}</div>`:''}<div class="big-list cats">${rows}${looseRow}</div>${!rows&&!looseRow?`<p class="mini-muted">${tt('오른쪽 위 ＋로 첫 식물을 등록해 보세요.','Add your first plant with ＋ at the top right.','右上の＋で最初の植物を登録しましょう。')}</p>`:''}${state.beta15Missing?'':`<button type="button" class="text-button cat-add" data-action="cat-add">＋ ${tt('분류 추가','Add category','分類を追加')}</button>`}${allTotal(myPlants().length)}</section>`;
}
function findRow(r){
 const src=photoSource(r),meta=[fmt(r.observedAt),translateText(STATUS[r.identificationStatus]||'미동정',state.locale),r.hidden?tt('비공개','PRIVATE','非公開'):''].filter(Boolean);
 return `<button type="button" class="pl-row" data-detail="${esc(r.id)}"><span class="pl-thumb">${src?`<img src="${esc(src)}" alt="" loading="lazy"/>`:botanicalSvg}</span><span class="pl-copy"><em>${esc(r.scientificName||tt('미동정 식물','Unidentified plant','未同定の植物'))}</em><small>${meta.map(esc).join(' · ')}</small></span><span class="pl-arrow" aria-hidden="true">›</span></button>`;
}
function wildScreen(){
 const finds=myFinds(),groups={};
 for(const r of finds){const code=findCountry(r),reg=(code&&regionOf(code))||'__none';((groups[reg]??={})[code&&regionOf(code)?code:'__none']??=[]).push(r);}
 const byDate=(a,b)=>new Date(b.observedAt)-new Date(a.observedAt);
 const block=(key,title,g)=>{const n=Object.values(g).flat().length,open=state.openRegions.has(key);
  const inner=key==='__none'?`<div class="cat-sub">${g.__none.sort(byDate).map(findRow).join('')}</div>`:`<div class="cat-sub">${Object.entries(g).sort((a,b)=>b[1].length-a[1].length).map(([code,list])=>{const ck=`${key}:${code}`,o=state.openRegions.has(ck);return `<div class="sub-block"><button type="button" class="sub-row" data-action="region-toggle" data-region="${esc(ck)}" aria-expanded="${o}"><span>${esc(placeName(code))}</span> <small>(${list.length})</small></button>${o?`<div class="sub-plants">${list.sort(byDate).map(findRow).join('')}</div>`:''}</div>`;}).join('')}</div>`;
  return `<div class="cat-block${open?' open':''}">${bigRow({action:'region-toggle',attrs:`data-region="${esc(key)}" aria-expanded="${open}"`,title,count:n})}${open?inner:''}</div>`;};
 const rows=REGIONS.filter(([id])=>groups[id]).map(([id])=>block(id,regionName(id),groups[id])).join('')+(groups.__none?block('__none',tt('국가 미지정','No country','国未指定'),groups.__none):'');
 return `<section class="page bl-page finds-page"><div class="big-list cats">${rows}</div>${rows?'':`<p class="mini-muted">${tt('아직 발견 기록이 없습니다. 오른쪽 위 ＋로 첫 기록을 남겨 보세요.','No finds yet. Add one with ＋ at the top right.','まだ発見記録がありません。右上の＋で記録しましょう。')}</p>`}${allTotal(finds.length)}</section>`;
}

// ---------- kept plant form: category, parents A × B, origin picker (⑥ ⑦) ----------
function categoryField(selected){
 if(state.beta15Missing)return '';
 const opts=topCats().flatMap(c=>[[c.id,c.name],...subCats(c.id).map(s=>[s.id,`${c.name} › ${s.name}`])]);
 return `<label class="form-field"><span>${tt('분류','Category','分類')}</span><select name="categoryId"><option value="">${tt('미분류','Unsorted','未分類')}</option>${opts.map(([id,label])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
}
function parentField(role,pp){
 const others=myPlants().filter(x=>x.id!==pp?.id).sort((a,b)=>String(a.scientific_name).localeCompare(String(b.scientific_name)));
 const id=pp?.[`${role}_parent_id`],name=pp?.[`${role}_parent_name`]||'',linked=id&&others.some(x=>x.id===id),sel=linked?id:name?'__custom':'';
 const label=role==='seed'?tt('모본 (♀)','Seed parent (♀)','母本（♀）'):tt('부본 (♂)','Pollen parent (♂)','父本（♂）');
 return `<div class="form-field parent-field"><span>${label}</span><select name="${role}ParentSel" data-parent="${role}"><option value="">${tt('선택 안 함','None','なし')}</option><option value="__custom" ${sel==='__custom'?'selected':''}>${tt('직접 입력','Type a name','直接入力')}</option>${others.length?`<optgroup label="${esc(tt('내 식물에서 선택','From my plants','マイ植物から'))}">${others.map(x=>`<option value="${esc(x.id)}" ${sel===x.id?'selected':''}>${esc(x.scientific_name)}</option>`).join('')}</optgroup>`:''}</select><input name="${role}ParentName" class="parent-custom${sel==='__custom'?'':' hidden'}" maxlength="120" placeholder="${esc(tt('부모 식물 이름','Parent plant name','親植物の名前'))}" value="${esc(sel==='__custom'?name:'')}"/></div>`;
}
function parentName(form,role){
 const sel=form.elements[`${role}ParentSel`]?.value||'';if(!sel)return '';
 if(sel==='__custom')return txt(form.elements[`${role}ParentName`]?.value);
 return txt(state.placePlants.find(x=>x.id===sel)?.scientific_name);
}
const crossName=(a,b)=>a&&b?`${a} × ${b}`:'';
// Both parents set → the name becomes "A × B", unless the name was typed by hand.
function updateCrossName(form){
 const input=form?.elements.scientificName;if(!input)return;
 const name=crossName(parentName(form,'seed'),parentName(form,'pollen'));
 if(name&&input.dataset.auto==='1')input.value=name;
}
function plantForm({plantId=null,categoryId=null}={}){
 if(!state.member||!state.user)return toast(tt('내 식물 등록은 승인된 베타 멤버만 사용할 수 있습니다.','Listing plants needs an approved beta account.','植物の登録は承認済みメンバーのみ利用できます。'));
 if(state.beta07Missing)return toast(SQL07_NOTICE());
 const pp=plantId?state.placePlants.find(x=>x.id===plantId):null;if(plantId&&(!pp||pp.owner_id!==state.user.id))return;
 const val=k=>`value="${esc(pp?.[k]??'')}"`,auto=!pp||txt(pp.scientific_name)===crossName(pp.seed_parent_name,pp.pollen_parent_name);
 state.ppPhotos=placePlantPhotos(pp);
 overlay.innerHTML=`<div class="detail-body"><div class="detail-header"><span class="eyebrow">${pp?'EDIT PLANT':'NEW PLANT'}</span><button type="button" class="close" ${pp?`data-action="pp-view" data-plant-id="${esc(pp.id)}"`:'data-action="close"'}>← ${tt('돌아가기','BACK','戻る')}</button></div><h1 class="screen-title">${pp?'Edit Plant':'New Plant'}</h1>
 <form id="place-plant-form" autocomplete="off"><input type="hidden" name="plantId" value="${esc(pp?.id||'')}"/>
 ${ppPhotoSection()}<div class="form-section"><h2>02 / PLANT</h2>${categoryField(pp?pp.category_id:categoryId)}
 <div class="parent-grid">${parentField('seed',pp)}${parentField('pollen',pp)}</div>
 <label class="form-field"><span>${tt('이름 / 학명','Name / scientific name','名前・学名')} *</span><input name="scientificName" required maxlength="120" placeholder="Begonia sp." data-auto="${auto?1:0}" ${val('scientific_name')}/><small>${tt('모본과 부본을 모두 고르면 "모본 × 부본"이 자동으로 들어갑니다.','Choosing both parents fills in “seed parent × pollen parent”.','母本と父本を選ぶと「母本 × 父本」が自動で入ります。')}</small></label>
 ${state.beta08Missing?'':`<label class="form-field"><span>${tt('동정 상태','Identification','同定状況')}</span><select name="identificationStatus"><option value="unidentified" ${pp?.identification_status!=='verified'?'selected':''}>${tt('미동정','Unidentified','未同定')}</option><option value="verified" ${pp?.identification_status==='verified'?'selected':''}>${tt('동정 완료','Identified','同定済み')}</option></select></label>`}
 <div class="form-field"><span>${tt('원산지','Origin','原産地')}</span>${placePicker({id:'origin-picker',mode:'origin',region:pp?.origin_region||'',place:pp?.origin_place||'',regionInput:'originRegion',placeInput:'originPlace'})}${pp?.origin&&!pp?.origin_region?`<small>${tt('이전 기록','Earlier entry','以前の記録')}: ${esc(pp.origin)}</small>`:`<small>${tt('넓은 지역부터 고르고, 원하면 나라나 섬까지 좁힐 수 있습니다.','Start from a broad region, then narrow down to a country or island if you like.','広い地域から選び、必要なら国や島まで絞り込めます。')}</small>`}</div></div>
 <div class="form-section"><h2>03 / CARE</h2><div class="form-field"><span>${tt('적정 온도 (°C)','Temperature (°C)','適温（°C）')}</span><div class="range-row"><input name="tempMin" type="number" inputmode="decimal" step="0.5" min="-20" max="60" placeholder="${esc(tt('최저 18','min 18','最低 18'))}" ${val('temp_min')}/><span>–</span><input name="tempMax" type="number" inputmode="decimal" step="0.5" min="-20" max="60" placeholder="${esc(tt('최고 28','max 28','最高 28'))}" ${val('temp_max')}/></div></div><div class="form-field"><span>${tt('적정 습도 (%)','Humidity (%)','適正湿度（%）')}</span><div class="range-row"><input name="humidityMin" type="number" inputmode="numeric" step="1" min="0" max="100" placeholder="${esc(tt('최저 60','min 60','最低 60'))}" ${val('humidity_min')}/><span>–</span><input name="humidityMax" type="number" inputmode="numeric" step="1" min="0" max="100" placeholder="${esc(tt('최고 90','max 90','最高 90'))}" ${val('humidity_max')}/></div></div><label class="form-field"><span>${tt('메모 (선택)','Notes (optional)','メモ（任意）')}</span><textarea name="notes" maxlength="500" rows="3" placeholder="${esc(tt('들인 날, 크기, 상태, 관리 방법 등','Date acquired, size, condition, care, etc.','入手日、サイズ、状態、管理方法など'))}">${esc(pp?.notes||'')}</textarea></label></div>
 ${ppVisibilitySection(pp)}
 <button class="primary-button wide" type="submit" id="pp-save">${pp?tt('변경 사항 저장','SAVE CHANGES','変更を保存'):tt('식물 등록','ADD PLANT','植物を登録')}</button>${pp?`<button type="button" class="light-button wide detail-delete" data-action="pp-delete" data-plant-id="${esc(pp.id)}">${tt('이 식물 삭제','DELETE THIS PLANT','この植物を削除')}</button>`:''}
 <p class="footnote" style="text-align:center">${tt('사진은 저장 전에 크기를 줄이고 EXIF 위치 정보를 제거합니다.','Photos are resized and EXIF location data is removed.','写真は縮小され、EXIFの位置情報は削除されます。')}</p></form></div>`;
 overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;translateUI(overlay);hydrateSigned(overlay).catch(console.warn);syncPickers(overlay);
}
async function savePlacePlant(form){
 if(!requireCommunity())return;if(state.beta07Missing)return toast(SQL07_NOTICE());
 const d=new FormData(form),get=k=>txt(d.get(k));
 const hidden=get('ppVisibility')==='private';
 if(hidden&&!(await beta13Ready()))return toast(SQL13_NOTICE());
 const name=get('scientificName');if(!name)return toast(tt('이름이나 학명을 입력해 주세요.','Enter a name or scientific name.','名前または学名を入力してください。'));
 const n={};
 for(const k of ['tempMin','tempMax','humidityMin','humidityMax']){const v=get(k);if(v===''){n[k]=null;continue;}const num=Number(v);if(!Number.isFinite(num))return toast(tt('온도와 습도는 숫자로 입력해 주세요.','Temperature and humidity must be numbers.','温度と湿度は数字で入力してください。'));n[k]=num;}
 if([n.tempMin,n.tempMax].some(v=>v!==null&&(v<-20||v>60)))return toast(tt('온도는 -20~60°C 사이로 입력해 주세요.','Temperature must be between -20 and 60°C.','温度は-20〜60°Cで入力してください。'));
 if([n.humidityMin,n.humidityMax].some(v=>v!==null&&(v<0||v>100)))return toast(tt('습도는 0~100% 사이로 입력해 주세요.','Humidity must be between 0 and 100%.','湿度は0〜100%で入力してください。'));
 if(n.tempMin!==null&&n.tempMax!==null&&n.tempMin>n.tempMax)return toast(tt('최저 온도가 최고 온도보다 높습니다.','Minimum temperature is above the maximum.','最低温度が最高温度より高いです。'));
 if(n.humidityMin!==null&&n.humidityMax!==null&&n.humidityMin>n.humidityMax)return toast(tt('최저 습도가 최고 습도보다 높습니다.','Minimum humidity is above the maximum.','最低湿度が最高湿度より高いです。'));
 const existing=get('plantId')?state.placePlants.find(x=>x.id===get('plantId')):null;
 if(existing&&existing.owner_id!==state.user.id)return;
 const parent=role=>{const sel=get(`${role}ParentSel`);return {id:sel&&sel!=='__custom'&&myPlants().some(x=>x.id===sel)?sel:null,name:parentName(form,role)||null};};
 const seed=parent('seed'),pollen=parent('pollen'),categoryId=get('categoryId'),region=get('originRegion'),place=get('originPlace');
 const id=existing?.id||newUuid(),btn=$('#pp-save');if(btn)btn.disabled=true;
 try{
  const up=await uploadPlantPhotos(id,existing),photoPath=up.paths[0]||null;
  const row={owner_id:state.user.id,scientific_name:name,notes:get('notes'),temp_min:n.tempMin,temp_max:n.tempMax,humidity_min:n.humidityMin,humidity_max:n.humidityMax,photo_path:photoPath,photo_paths:up.paths,updated_at:new Date().toISOString(),
   category_id:categoryId&&state.categories.some(c=>c.id===categoryId)?categoryId:null,origin_region:region||null,origin_place:region&&place?place:null,seed_parent_id:seed.id,seed_parent_name:seed.name,pollen_parent_id:pollen.id,pollen_parent_name:pollen.name};
  // Older app versions read the free-text origin: keep it in step with the picker (or keep the old text).
  row.origin=region?originLabel({origin_region:region,origin_place:place}):(existing?.origin||'');
  if(!existing)row.place_id=null;
  if(!state.beta08Missing&&form.elements.identificationStatus)row.identification_status=get('identificationStatus')==='verified'?'verified':'unidentified';
  if(state.beta13Missing===false)row.is_hidden=hidden;
  const table=state.authClient.from('place_plants');
  const write=r=>existing?table.update(r).eq('id',id).eq('owner_id',state.user.id):table.insert({id,...r});
  let {error}=await write(row),beta15Skipped=false;
  if(error&&isBeta15SchemaError(error)){const {category_id,origin_region,origin_place,seed_parent_id,seed_parent_name,pollen_parent_id,pollen_parent_name,...rest}=row;({error}=await write(rest));beta15Skipped=!error;}
  if(error&&/photo_paths/i.test(error.message||'')){const {photo_paths,...legacy}=row;({error}=await write(legacy));}
  if(error){if(up.uploaded.length)await state.authClient.storage.from('place-photos').remove(up.uploaded).catch(()=>{});throw error;}
  if(up.stale.length)await state.authClient.storage.from('place-photos').remove(up.stale).catch(console.warn);
  state.ppPhotos=[];if(row.category_id){const c=state.categories.find(x=>x.id===row.category_id);state.openCats.add(c?.parent_id||row.category_id);if(c?.parent_id)state.openCats.add(c.id);}else state.openCats.add('__none');
  await loadCommunity();refreshAfterPlantChange();plantDetail(id);
  toast(beta15Skipped?SQL15_NOTICE():existing?tt('식물 정보를 저장했습니다.','Plant updated.','植物を更新しました。'):tt('식물을 등록했습니다.','Plant added.','植物を登録しました。'));
 }catch(e){toast(isBeta13SchemaError(e)?SQL13_NOTICE():isBeta07SchemaError(e)?SQL07_NOTICE():(e.message||String(e)));}
 finally{if(btn&&document.body.contains(btn))btn.disabled=false;}
}
async function deletePlacePlant(id){
 if(!requireCommunity())return;const pp=state.placePlants.find(x=>x.id===id);
 if(!pp||pp.owner_id!==state.user.id||!confirm(tt('이 식물을 삭제할까요?','Delete this plant?','この植物を削除しますか？')))return;
 const {error}=await state.authClient.from('place_plants').delete().eq('id',id).eq('owner_id',state.user.id);if(error)return toast(error.message);
 {const paths=placePlantPhotos(pp);if(paths.length)await state.authClient.storage.from('place-photos').remove(paths).catch(console.warn);}
 await loadCommunity();closeDetail();refreshAfterPlantChange();
 toast(tt('식물을 삭제했습니다.','Plant deleted.','植物を削除しました。'));
}
async function setPlantHidden(id,hidden){
 if(!requireCommunity())return;
 const pp=state.placePlants.find(x=>x.id===id);if(!pp||pp.owner_id!==state.user.id)return;
 if(!(await beta13Ready()))return toast(SQL13_NOTICE());
 const {error}=await state.authClient.from('place_plants').update({is_hidden:hidden,updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',state.user.id);
 if(error)return toast(isBeta13SchemaError(error)?SQL13_NOTICE():error.message);
 pp.is_hidden=hidden;await loadCommunity();
 if(!overlay.classList.contains('hidden')&&overlay.querySelector('[data-plant-view]')?.dataset.plantView===id)plantDetail(id);
 refreshAfterPlantChange();
 toast(hidden?tt('비공개로 전환했습니다. 나에게만 보입니다.','Now private: only you can see this plant.','非公開にしました。自分だけに表示されます。'):tt('다시 공개했습니다.','This plant is shared again.','再び公開しました。'));
}
function refreshAfterPlantChange(){if(state.tab==='plant')rerenderKeepScroll();}
function plantDetail(id){
 const x=state.placePlants.find(p=>p.id===id);if(!x)return;
 const mine=x.owner_id===state.user?.id,paths=placePlantPhotos(x),cats=mine?state.categories:(state.dex?.categories||[]),cat=catPath(x.category_id,cats);
 const gallery=paths.length?photoSlider(paths.map((p,i)=>({x:p,label:`${tt('사진','Photo','写真')} ${i+1}/${paths.length}`})),'place-photos'):'<div class="venue-detail-heading">✿</div>';
 const parentRow=(role,label)=>{const pid=x[`${role}_parent_id`],linked=pid&&state.placePlants.find(p=>p.id===pid),name=linked?linked.scientific_name:x[`${role}_parent_name`];if(!name)return '';return `<div class="detail-row"><span>${label}</span><strong>${linked?`<button type="button" class="link-button" data-action="pp-view" data-plant-id="${esc(pid)}">${esc(name)}</button>`:esc(name)}</strong></div>`;};
 const parents=parentRow('seed',tt('모본 (♀)','Seed parent (♀)','母本（♀）'))+parentRow('pollen',tt('부본 (♂)','Pollen parent (♂)','父本（♂）'));
 const kids=state.placePlants.filter(p=>p.id!==id&&(p.seed_parent_id===id||p.pollen_parent_id===id)&&(p.owner_id===state.user?.id||!p.is_hidden));
 overlay.innerHTML=`<div class="detail-body" data-plant-view="${esc(x.id)}"><div class="detail-header"><span class="eyebrow">PLANT${cat?` / ${esc(cat)}`:''}</span><span class="header-actions">${dexBackButton()}<button type="button" class="close" data-action="close">✕ ${tt('닫기','CLOSE','閉じる')}</button></span></div>${gallery}
 ${mine&&ppHidden(x)?`<div class="pp-detail-tags">${ppPrivateTag(x)}<small>${tt('나에게만 보입니다.','Only you can see this plant.','自分だけに表示されます。')}</small></div>`:''}
 <h1>${esc(x.scientific_name)}</h1>${x.identification_status==='verified'?`<p class="lead">✓ ${tt('동정 완료','Identified','同定済み')}</p>`:''}
 <div class="detail-section"><h2>${tt('정보','DETAILS','詳細')}</h2>${recordRow(tt('분류','Category','分類'),cat||tt('미분류','Unsorted','未分類'))}${recordRow(tt('원산지','Origin','原産地'),originLabel(x))}${recordRow(tt('적정 온도','Temperature','適温'),rangeText(x.temp_min,x.temp_max,'°C'))}${recordRow(tt('적정 습도','Humidity','適正湿度'),rangeText(x.humidity_min,x.humidity_max,'%'))}</div>
 ${parents?`<div class="detail-section"><h2>${tt('부모 개체','PARENTS','親個体')}</h2>${parents}</div>`:''}
 ${kids.length?`<div class="detail-section"><h2>${tt('이 식물의 자손','OFFSPRING','この植物の子')} · ${kids.length}</h2><div class="pl-list">${kids.map(plantRow).join('')}</div></div>`:''}
 ${x.notes?`<div class="detail-section"><h2>${tt('메모','NOTES','メモ')}</h2><p class="long-text">${esc(x.notes)}</p></div>`:''}
 ${mine?`<button type="button" class="primary-button wide" data-action="pp-edit" data-plant-id="${esc(x.id)}">${tt('이 식물 수정','EDIT PLANT','植物を編集')}</button>${state.beta13Missing?'':ppVisibilityButton(x,'light-button wide pp-visibility')}`:`<div class="detail-author">${authorChip(x.owner_id)}</div>`}</div>`;
 overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;translateUI(overlay);hydrateSigned(overlay).catch(console.warn);
}
function dexPlantGroups(plants,cats,mine){
 const verified=tt('✓ 동정 완료','✓ Identified','✓ 同定済み');let n=0;
 const tile=x=>{const cover=placePlantPhotos(x)[0]||null;return dexTile({no:++n,src:cachedSigned('place-photos',cover),bucket:'place-photos',path:cover,name:x.scientific_name,badge:`${mine&&ppHidden(x)?ppPrivateTag(x):''}${x.identification_status==='verified'?`<span class="dex-badge">${verified}</span>`:''}${originLabel(x)?`<span class="dex-sub">${esc(originLabel(x))}</span>`:''}`,action:'dex-plant',attrs:`data-plant-id="${esc(x.id)}"`});};
 const tops=cats.filter(c=>!c.parent_id).sort(bySort),groups=[];
 for(const c of tops){const ids=[c.id,...cats.filter(s=>s.parent_id===c.id).map(s=>s.id)],list=plants.filter(x=>ids.includes(x.category_id));if(list.length)groups.push([c.name,list]);}
 const loose=plants.filter(x=>!x.category_id||!cats.some(c=>c.id===x.category_id));if(loose.length)groups.push([tt('미분류','Unsorted','未分類'),loose]);
 return groups.map(([name,list])=>`<h3 class="dex-group">${esc(name)} <small>${list.length}</small></h3><div class="dex-grid">${list.map(tile).join('')}</div>`).join('');
}

// ---------- MATTER: events and shops (⑨), HOME posters (⑩) ----------
async function loadMatter(){
 if(!state.authClient)return;
 const c=state.authClient;
 const [ev,sh]=await Promise.all([c.from('matter_events').select('*').order('starts_on',{ascending:true}).limit(200),c.from('matter_shops').select('*').order('sort_order',{ascending:true}).limit(300)]);
 if(ev.error||sh.error){state.matterMissing=true;console.warn('MATTER tables',(ev.error||sh.error).message);return;}
 state.matterMissing=false;state.events=ev.data||[];state.shops=sh.data||[];
 try{localStorage.setItem('pm-matter-cache',JSON.stringify({events:state.events,shops:state.shops}));}catch{}
}
function restoreMatterCache(){try{const c=JSON.parse(localStorage.getItem('pm-matter-cache')||'null');if(c){state.events=c.events||[];state.shops=c.shops||[];}}catch{}}
async function checkAdmin(){
 state.isAdmin=false;if(!state.authClient||!state.user)return;
 const {data,error}=await state.authClient.rpc('is_app_admin');state.isAdmin=!error&&data===true;
}
const mediaUrl=path=>{
 if(!path)return '';
 try{const u=state.authClient?.storage.from('matter-media').getPublicUrl(path)?.data?.publicUrl;if(u)return u;}catch{}
 const base=txt(window.PM_CONFIG?.supabaseUrl).replace(/\/$/,'');return base?`${base}/storage/v1/object/public/matter-media/${String(path).split('/').map(encodeURIComponent).join('/')}`:'';
};
const safeUrl=u=>/^https?:\/\//i.test(txt(u))?txt(u):'';
const todayStr=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const eventEnd=e=>e.ends_on||e.starts_on;
const upcomingEvents=()=>state.events.filter(e=>String(eventEnd(e))>=todayStr()).sort((a,b)=>String(a.starts_on).localeCompare(String(b.starts_on)));
const pastEvents=()=>state.events.filter(e=>String(eventEnd(e))<todayStr()).sort((a,b)=>String(b.starts_on).localeCompare(String(a.starts_on)));
function eventDate(e){
 const p=s=>{const [y,m,d]=String(s||'').split('-').map(Number);return {y,m,d};},a=p(e.starts_on),b=e.ends_on&&e.ends_on!==e.starts_on?p(e.ends_on):null,same=b&&b.y===a.y&&b.m===a.m;
 if(state.locale==='en'){const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return b?(same?`${M[a.m-1]} ${a.d}–${b.d}, ${a.y}`:`${M[a.m-1]} ${a.d}, ${a.y} – ${M[b.m-1]} ${b.d}, ${b.y}`):`${M[a.m-1]} ${a.d}, ${a.y}`;}
 if(state.locale==='ja')return b?(same?`${a.y}年${a.m}月${a.d}日〜${b.d}日`:`${a.y}年${a.m}月${a.d}日〜${b.y!==a.y?`${b.y}年`:''}${b.m}月${b.d}日`):`${a.y}年${a.m}月${a.d}日`;
 return b?(same?`${a.y}. ${a.m}. ${a.d}~${b.d}`:`${a.y}. ${a.m}. ${a.d} ~ ${b.y!==a.y?`${b.y}. `:''}${b.m}. ${b.d}`):`${a.y}. ${a.m}. ${a.d}`;
}
const SHOP_KINDS=()=>({shop:tt('매장','Shop','ショップ'),showroom:tt('쇼룸','Showroom','ショールーム'),greenhouse:tt('온실·농장','Greenhouse·Farm','温室・農園'),other:tt('기타','Other','その他')});
function homeScreen(){
 const list=upcomingEvents().filter(e=>(e.poster_paths||[]).length);
 if(!list.length)return `<section class="home-hero is-empty"><div class="hero-empty"><img src="./assets/titles/brand-lockup.png" alt="RAINFOREST MEMORIES — Designed by PLANT MATTER" class="hero-brand" width="1705" height="275"/><p>${tt('예정된 행사가 없습니다.','No upcoming events.','予定されているイベントはありません。')}</p><button type="button" class="text-button" data-nav="matter">MATTER →</button></div></section>`;
 return `<section class="home-hero"><div class="hero-track">${list.map((e,i)=>`<button type="button" class="hero-slide" data-action="event-open" data-event-id="${esc(e.id)}" aria-label="${esc([e.title,e.subtitle,eventDate(e)].filter(Boolean).join(' · '))}"><img src="${esc(mediaUrl(e.poster_paths[0]))}" alt="" ${i?'loading="lazy"':''}/></button>`).join('')}</div>${list.length>1?`<div class="hero-dots" aria-hidden="true">${list.map((_,i)=>`<i class="${i?'':'on'}"></i>`).join('')}</div>`:''}</section>`;
}
function heroScrolled(track){const i=Math.round(track.scrollLeft/Math.max(1,track.clientWidth));track.parentElement.querySelectorAll('.hero-dots i').forEach((d,k)=>d.classList.toggle('on',k===i));}
function matterScreen(){
 if(state.matterView==='event')return eventsScreen();
 if(state.matterView==='shops')return shopsScreen();
 return `<section class="page bl-page"><div class="big-list lined">${bigRow({action:'matter-view',attrs:'data-view="event"',title:'Event',sub:tt('식물 행사 · 이벤트','PLANT EVENTS','植物イベント'),count:upcomingEvents().length})}${bigRow({action:'matter-view',attrs:'data-view="shops"',title:'Shop List',sub:tt('식물 매장 · 쇼룸','SHOPS & SHOWROOMS','ショップ・ショールーム'),count:state.shops.length})}</div>${state.matterMissing&&state.member?`<div class="info warning">${SQL15_NOTICE()}</div>`:''}</section>`;
}
function eventRow(e,past=false){
 return `<button type="button" class="ev-row${past?' past':''}" data-action="event-open" data-event-id="${esc(e.id)}"><span class="ev-copy"><span class="ev-title"><b>${esc(e.title)}</b>${e.subtitle?` <span class="ev-subtitle">${esc(e.subtitle)}</span>`:''}</span><span class="ev-date">${esc(eventDate(e))}</span></span><span class="go-arrow">${ICON_ARROW}</span></button>`;
}
function eventsScreen(){
 const up=upcomingEvents(),past=pastEvents();
 return `<section class="page lime-page"><h1 class="screen-title">Event</h1>${state.matterMissing&&state.member?`<div class="info warning">${SQL15_NOTICE()}</div>`:''}<div class="ev-list">${up.map(e=>eventRow(e)).join('')||`<p class="ev-empty">${tt('예정된 행사가 없습니다.','No upcoming events.','予定されているイベントはありません。')}</p>`}</div>${past.length?`<h2 class="past-head">${tt('지난 행사','PAST EVENTS','過去のイベント')}</h2><div class="ev-list past-list">${past.map(e=>eventRow(e,true)).join('')}</div>`:''}</section>`;
}
function shopRow(s){
 return `<button type="button" class="ev-row shop-row" data-action="shop-open" data-shop-id="${esc(s.id)}"><span class="ev-copy"><span class="ev-title"><b>${esc(s.name)}</b></span><span class="ev-date">${esc([SHOP_KINDS()[s.kind]||'',s.area].filter(Boolean).join(' · '))}</span></span><span class="go-arrow">${ICON_ARROW}</span></button>`;
}
function shopsScreen(){
 return `<section class="page shop-page"><h1 class="screen-title">Shop List</h1>${state.matterMissing&&state.member?`<div class="info warning">${SQL15_NOTICE()}</div>`:''}<div class="ev-list">${state.shops.map(shopRow).join('')||`<p class="ev-empty">${tt('등록된 매장이 없습니다.','No shops listed yet.','登録されたショップはありません。')}</p>`}</div></section>`;
}
// Public media (no signing). Posters are shown whole; the slider shares the BETA 13 swipe behaviour.
function mediaSlider(paths,cls=''){
 const items=paths.filter(Boolean);if(!items.length)return '';
 return `<div class="photo-slider ${cls}"><div class="pg-track">${items.map((p,i)=>`<div class="pg-slide" data-action="slide-view" data-index="${i}"><img src="${esc(mediaUrl(p))}" alt=""/></div>`).join('')}</div>${items.length>1?`<div class="pg-meta"><button type="button" class="pg-arrow" data-action="slide-prev" aria-label="${esc(tt('이전 사진','Previous photo','前の写真'))}">‹</button><span class="pg-label" data-labels="${esc(JSON.stringify(items.map((_,i)=>`${i+1}/${items.length}`)))}">1/${items.length}</span><span class="pg-dots" aria-hidden="true">${items.map((_,i)=>`<i class="${i?'':'on'}"></i>`).join('')}</span><button type="button" class="pg-arrow" data-action="slide-next" aria-label="${esc(tt('다음 사진','Next photo','次の写真'))}">›</button></div>`:''}</div>`;
}
function openMatterOverlay(html){overlay.innerHTML=html;overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;translateUI(overlay);}
function eventDetail(id){
 const e=state.events.find(x=>x.id===id);if(!e)return;const past=String(eventEnd(e))<todayStr(),link=safeUrl(e.link_url);
 openMatterOverlay(`<div class="detail-body matter-detail" data-event-view="${esc(e.id)}"><div class="detail-header"><span class="eyebrow">EVENT</span><button type="button" class="close" data-action="close">✕ ${tt('닫기','CLOSE','閉じる')}</button></div>${mediaSlider(e.poster_paths||[],'poster-slider')}
 <h1 class="md-title"><b>${esc(e.title)}</b>${e.subtitle?` <span>${esc(e.subtitle)}</span>`:''}</h1><p class="md-date">${esc(eventDate(e))}${past?` · ${tt('지난 행사','Past event','終了したイベント')}`:''}</p>
 ${e.venue?`<div class="detail-section">${recordRow(tt('장소','Venue','会場'),e.venue)}</div>`:''}${e.description?`<div class="detail-section"><p class="long-text">${esc(e.description)}</p></div>`:''}
 ${link?`<a class="primary-button wide link-button-block" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${tt('자세히 보기','MORE INFO','詳しく見る')} ↗</a>`:''}
 ${state.isAdmin?`<div class="admin-actions"><button type="button" class="light-button" data-action="event-edit" data-event-id="${esc(e.id)}">${tt('수정','EDIT','編集')}</button><button type="button" class="light-button" data-action="event-delete" data-event-id="${esc(e.id)}">${tt('삭제','DELETE','削除')}</button></div>`:''}</div>`);
}
const mapsLink=address=>state.locale==='ko'?`https://map.naver.com/p/search/${encodeURIComponent(address)}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
function shopDetail(id){
 const s=state.shops.find(x=>x.id===id);if(!s)return;const ig=txt(s.instagram).replace(/^@/,'').replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/\/.*$/,''),web=safeUrl(s.website);
 const row=(label,value)=>value?`<div class="detail-row"><span>${label}</span><strong>${value}</strong></div>`:'';
 openMatterOverlay(`<div class="detail-body matter-detail" data-shop-view="${esc(s.id)}"><div class="detail-header"><span class="eyebrow">SHOP</span><button type="button" class="close" data-action="close">✕ ${tt('닫기','CLOSE','閉じる')}</button></div>${mediaSlider(s.photo_paths||[])}
 <h1 class="md-title"><b>${esc(s.name)}</b></h1><p class="md-date">${esc([SHOP_KINDS()[s.kind]||'',s.area].filter(Boolean).join(' · '))}</p>
 <div class="detail-section">${row(tt('주소','Address','住所'),s.address?`${esc(s.address)}<br><a class="text-link" href="${esc(mapsLink(s.address))}" target="_blank" rel="noopener noreferrer">${tt('지도 앱에서 열기','Open in maps','地図アプリで開く')} ↗</a>`:'')}${row(tt('운영 시간','Hours','営業時間'),esc(s.hours))}${row(tt('전화','Phone','電話'),s.phone?`<a class="text-link" href="tel:${esc(String(s.phone).replace(/[^+0-9]/g,''))}">${esc(s.phone)}</a>`:'')}${row('Instagram',ig?`<a class="text-link" href="https://www.instagram.com/${esc(encodeURIComponent(ig))}/" target="_blank" rel="noopener noreferrer">@${esc(ig)}</a>`:'')}${row(tt('웹사이트','Website','ウェブサイト'),web?`<a class="text-link" href="${esc(web)}" target="_blank" rel="noopener noreferrer">${esc(web.replace(/^https?:\/\//,''))}</a>`:'')}</div>
 ${s.description?`<div class="detail-section"><p class="long-text">${esc(s.description)}</p></div>`:''}
 ${state.isAdmin?`<div class="admin-actions"><button type="button" class="light-button" data-action="shop-edit" data-shop-id="${esc(s.id)}">${tt('수정','EDIT','編集')}</button><button type="button" class="light-button" data-action="shop-delete" data-shop-id="${esc(s.id)}">${tt('삭제','DELETE','削除')}</button></div>`:''}</div>`);
}
// ---------- admin: add / edit / delete events and shops ----------
const MATTER_CFG={
 event:{table:'matter_events',folder:'events',limit:6,pathKey:'poster_paths',list:()=>state.events},
 shop:{table:'matter_shops',folder:'shops',limit:10,pathKey:'photo_paths',list:()=>state.shops}};
// Posters are kept whole (no crop); long side ≤ 2000px.
async function compressPoster(file){
 if(!file||!file.type.startsWith('image/'))throw Error(tt('이미지 파일만 선택할 수 있습니다.','Images only.','画像のみ選択できます。'));
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error(tt('사진을 불러오지 못했습니다.','Could not read the image.','画像を読み込めません。')));i.src=url;});
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,s=Math.min(1,2000/Math.max(w,h)),cw=Math.max(3,Math.round(w*s)),ch=Math.max(3,Math.round(h*s));
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cw,ch);ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,cw,ch);
  return c.toDataURL('image/jpeg',.84);
 }finally{URL.revokeObjectURL(url);}
}
function mediaGrid(){
 const cfg=MATTER_CFG[state.mediaKind],items=state.mediaItems;
 return items.map((x,i)=>photoThumb(x.data||mediaUrl(x.path),'','', 'data-action="media-cover"','data-action="media-remove"',i)).join('')+(items.length<cfg.limit?addTile('media-add','',items.length,cfg.limit):'');
}
function refreshMediaGrid(){const g=$('#media-grid');if(!g)return;g.innerHTML=mediaGrid();translateUI(g);syncPickButtons(g,state.mediaItems.length>=MATTER_CFG[state.mediaKind].limit);}
async function addMedia(fileList){
 const cfg=MATTER_CFG[state.mediaKind],files=[...(fileList||[])];if(!cfg||!files.length)return;
 const room=cfg.limit-state.mediaItems.length;if(room<=0)return toast(tt(`최대 ${cfg.limit}장까지입니다.`,`Up to ${cfg.limit} images.`,`最大${cfg.limit}枚です。`));
 for(const f of files.slice(0,room)){try{state.mediaItems.push({data:state.mediaKind==='event'?await compressPoster(f):await compressPhoto(f)});refreshMediaGrid();}catch(e){toast(e.message||String(e));}}
}
function matterForm(kind,id=null){
 if(!state.isAdmin)return;const cfg=MATTER_CFG[kind],x=id?cfg.list().find(r=>r.id===id):null,v=k=>esc(x?.[k]??'');
 state.mediaKind=kind;state.mediaItems=(x?.[cfg.pathKey]||[]).filter(Boolean).map(path=>({path}));
 const ev=kind==='event';
 const media=`<div class="form-field photo-field">${photoFieldHead(ev?tt('포스터','POSTERS','ポスター'):tt('사진','PHOTOS','写真'),'#media-gallery-input','#media-camera-input',state.mediaItems.length>=cfg.limit)}<div id="media-grid" class="vp-grid">${mediaGrid()}</div><small class="photo-note">${ev?tt('첫 장이 홈 화면 포스터 · 자르지 않고 저장 · 세로 9:16이 홈 화면에 가장 잘 맞습니다','First image is the HOME poster · saved uncropped · portrait 9:16 fits the HOME screen best','1枚目がホームのポスター · 切り取らずに保存 · 縦9:16がホームに最適'):PHOTO_NOTE_COVER()}</small></div><input id="media-gallery-input" class="hidden-input" type="file" accept="image/*" multiple/><input id="media-camera-input" class="hidden-input" type="file" accept="image/*" capture="environment"/>`;
 const fields=ev?`<label class="form-field"><span>${tt('행사 이름 (굵게)','Event name (bold)','イベント名（太字）')} *</span><input name="title" required maxlength="80" value="${v('title')}" placeholder="${esc(tt('예: 책방의 게코 × 그린아이','e.g. Gecko Books × Green Eye','例：Gecko Books × Green Eye'))}"/></label><label class="form-field"><span>${tt('보조 제목 (가늘게, 선택)','Subtitle (light, optional)','サブタイトル（細字・任意）')}</span><input name="subtitle" maxlength="80" value="${v('subtitle')}" placeholder="${esc(tt('예: 정글플랜츠 마켓','e.g. Jungle Plants Market','例：ジャングルプランツマーケット'))}"/></label><div class="two-col"><label class="form-field"><span>${tt('시작일','Starts','開始日')} *</span><input name="startsOn" type="date" required value="${v('starts_on')}"/></label><label class="form-field"><span>${tt('종료일 (하루면 비움)','Ends (blank if one day)','終了日（1日なら空欄）')}</span><input name="endsOn" type="date" value="${v('ends_on')}"/></label></div><label class="form-field"><span>${tt('장소','Venue','会場')}</span><input name="venue" maxlength="160" value="${v('venue')}"/></label><label class="form-field"><span>${tt('소개','Description','紹介')}</span><textarea name="description" maxlength="2000" rows="4">${v('description')}</textarea></label><label class="form-field"><span>${tt('링크 (예매·인스타그램 등)','Link (tickets, Instagram…)','リンク（チケット・Instagramなど）')}</span><input name="linkUrl" type="url" maxlength="500" placeholder="https://" value="${v('link_url')}"/></label>`
  :`<label class="form-field"><span>${tt('매장 이름','Shop name','ショップ名')} *</span><input name="name" required maxlength="80" value="${v('name')}"/></label><div class="two-col"><label class="form-field"><span>${tt('종류','Type','種類')}</span><select name="kind">${Object.entries(SHOP_KINDS()).map(([k,l])=>`<option value="${k}" ${(x?.kind||'shop')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label class="form-field"><span>${tt('지역','Area','エリア')}</span><input name="area" maxlength="80" value="${v('area')}" placeholder="${esc(tt('예: 서울 성수','e.g. Seoul Seongsu','例：ソウル 聖水'))}"/></label></div><label class="form-field"><span>${tt('주소','Address','住所')}</span><input name="address" maxlength="200" value="${v('address')}"/><small>${tt('앱 안에는 지도가 없고, 상세 화면에서 지도 앱으로 열 수 있습니다.','No map in the app; the detail screen opens your maps app.','アプリ内に地図はなく、詳細画面から地図アプリで開けます。')}</small></label><label class="form-field"><span>${tt('운영 시간','Hours','営業時間')}</span><input name="hours" maxlength="200" value="${v('hours')}" placeholder="${esc(tt('예: 화–일 12:00–19:00','e.g. Tue–Sun 12:00–19:00','例：火〜日 12:00〜19:00'))}"/></label><div class="two-col"><label class="form-field"><span>${tt('전화','Phone','電話')}</span><input name="phone" maxlength="40" inputmode="tel" value="${v('phone')}"/></label><label class="form-field"><span>Instagram</span><input name="instagram" maxlength="80" value="${v('instagram')}" placeholder="@plantmatter"/></label></div><label class="form-field"><span>${tt('웹사이트','Website','ウェブサイト')}</span><input name="website" type="url" maxlength="300" placeholder="https://" value="${v('website')}"/></label><label class="form-field"><span>${tt('소개','Description','紹介')}</span><textarea name="description" maxlength="2000" rows="4">${v('description')}</textarea></label><label class="form-field"><span>${tt('목록 순서 (작을수록 위)','List order (lower first)','並び順（小さいほど上）')}</span><input name="sortOrder" type="number" step="1" value="${esc(x?.sort_order??0)}"/></label>`;
 openMatterOverlay(`<div class="detail-body"><div class="detail-header"><span class="eyebrow">${x?'EDIT':'NEW'} ${ev?'EVENT':'SHOP'}</span><button type="button" class="close" ${x?`data-action="${kind}-open" data-${kind}-id="${esc(x.id)}"`:'data-action="close"'}>← ${tt('돌아가기','BACK','戻る')}</button></div><h1 class="screen-title">${x?(ev?'Edit Event':'Edit Shop'):(ev?'New Event':'New Shop')}</h1><form id="matter-form" data-kind="${kind}" autocomplete="off"><input type="hidden" name="matterId" value="${esc(x?.id||'')}"/>${media}${fields}<button class="primary-button wide" type="submit" id="matter-save">${tt('저장','SAVE','保存')}</button>${x?`<button type="button" class="light-button wide detail-delete" data-action="${kind}-delete" data-${kind}-id="${esc(x.id)}">${tt('삭제','DELETE','削除')}</button>`:''}</form></div>`);
}
async function saveMatter(form){
 const kind=form.dataset.kind,cfg=MATTER_CFG[kind];if(!cfg||!state.isAdmin)return;
 const d=new FormData(form),get=k=>txt(d.get(k)),existing=get('matterId')?cfg.list().find(r=>r.id===get('matterId')):null;
 let row;
 if(kind==='event'){
  row={title:get('title'),subtitle:get('subtitle'),starts_on:get('startsOn'),ends_on:get('endsOn')||null,venue:get('venue'),description:get('description'),link_url:get('linkUrl')};
  if(!row.title||!row.starts_on)return toast(tt('행사 이름과 시작일을 입력해 주세요.','Enter the event name and start date.','イベント名と開始日を入力してください。'));
  if(row.ends_on&&row.ends_on<row.starts_on)return toast(tt('종료일이 시작일보다 빠릅니다.','The end date is before the start date.','終了日が開始日より前です。'));
  if(row.link_url&&!safeUrl(row.link_url))return toast(tt('링크는 https:// 로 시작해야 합니다.','Links must start with https://','リンクは https:// で始めてください。'));
 }else{
  row={name:get('name'),kind:SHOP_KINDS()[get('kind')]?get('kind'):'shop',area:get('area'),address:get('address'),hours:get('hours'),phone:get('phone'),instagram:get('instagram'),website:get('website'),description:get('description'),sort_order:Number.isFinite(Number(get('sortOrder')))?Math.round(Number(get('sortOrder'))):0};
  if(!row.name)return toast(tt('매장 이름을 입력해 주세요.','Enter the shop name.','ショップ名を入力してください。'));
  if(row.website&&!safeUrl(row.website))return toast(tt('웹사이트는 https:// 로 시작해야 합니다.','Websites must start with https://','ウェブサイトは https:// で始めてください。'));
 }
 const id=existing?.id||newUuid(),btn=$('#matter-save'),uploaded=[];if(btn)btn.disabled=true;
 try{
  const paths=[];
  for(const [i,x] of state.mediaItems.entries()){
   if(x.path){paths.push(x.path);continue;}
   const path=`${cfg.folder}/${id}/${Date.now().toString(36)}-${i}.jpg`,blob=await (await fetch(x.data)).blob();
   const {error}=await state.authClient.storage.from('matter-media').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(error)throw error;
   uploaded.push(path);paths.push(path);
  }
  row[cfg.pathKey]=paths;row.updated_at=new Date().toISOString();
  const t=state.authClient.from(cfg.table),{error}=existing?await t.update(row).eq('id',id):await t.insert({id,...row});
  if(error)throw error;
  const stale=(existing?.[cfg.pathKey]||[]).filter(p=>p&&!paths.includes(p));if(stale.length)await state.authClient.storage.from('matter-media').remove(stale).catch(console.warn);
  state.mediaItems=[];await loadMatter();render();kind==='event'?eventDetail(id):shopDetail(id);
  toast(existing?tt('저장했습니다.','Saved.','保存しました。'):kind==='event'?tt('행사를 등록했습니다.','Event added.','イベントを登録しました。'):tt('매장을 등록했습니다.','Shop added.','ショップを登録しました。'));
 }catch(e){if(uploaded.length)await state.authClient.storage.from('matter-media').remove(uploaded).catch(()=>{});toast(isBeta15SchemaError(e)?SQL15_NOTICE():(e.message||String(e)));}
 finally{if(btn&&document.body.contains(btn))btn.disabled=false;}
}
async function deleteMatter(kind,id){
 const cfg=MATTER_CFG[kind],x=cfg?.list().find(r=>r.id===id);if(!x||!state.isAdmin)return;
 if(!confirm(tt(`‘${x.title||x.name}’을(를) 삭제할까요?`,`Delete “${x.title||x.name}”?`,`「${x.title||x.name}」を削除しますか？`)))return;
 const {error}=await state.authClient.from(cfg.table).delete().eq('id',id);if(error)return toast(error.message);
 const paths=(x[cfg.pathKey]||[]).filter(Boolean);if(paths.length)await state.authClient.storage.from('matter-media').remove(paths).catch(console.warn);
 await loadMatter();closeDetail();render();toast(tt('삭제했습니다.','Deleted.','削除しました。'));
}

// ---------- OPTION tab ----------
function optionsScreen(){
 if(state.user&&!state.profile?.onboarding_completed)state.optionView='account';
 if(state.optionView)return optionSubScreen(state.optionView);
 const incoming=state.user?friendRequestsIn().length:0;
 const rows=[['profile','Profile',tt('내 프로필 · 내 도감','MY PROFILE · MY DEX','プロフィール・図鑑')],['friends','Friends',tt('친구 찾기 · 친구 목록','FIND & MANAGE FRIENDS','友だち'),incoming],['backup','Backup',tt('온라인 저장 · 데이터 백업','ONLINE SAVE · DATA BACKUP','オンライン保存・バックアップ')],['language','Language',tt('앱 표시 언어','DISPLAY LANGUAGE','表示言語')],['account','Account',state.user?tt('계정 및 개인정보','ACCOUNT & PRIVACY','アカウント・プライバシー'):tt('로그인 · 가입','SIGN IN · SIGN UP','ログイン・登録')],['about','About',tt('앱 정보','ABOUT THIS APP','アプリ情報')]];
 return `<section class="page bl-page"><div class="big-list lined">${rows.map(([k,title,sub,badge])=>bigRow({action:'option-view',attrs:`data-view="${k}"`,title,sub,badge})).join('')}</div></section>`;
}
function optionSubScreen(v){
 const titles={profile:'Profile',friends:'Friends',backup:'Backup',language:'Language',account:'Account',about:'About'};
 let body='';
 if(v==='profile'){
  if(!state.user)body=loginNeeded(tt('프로필은 로그인 후 사용할 수 있습니다.','Sign in to use your profile.','プロフィールはログイン後に使えます。'));
  else{const finds=myFinds(),species=new Set(finds.map(r=>speciesKey(r.scientificName)).filter(Boolean)).size;body=`<div class="my-profile-card">${profileHeader()}${accountTypeCard()}<div class="stats"><div class="stat"><strong>${myPlants().length}</strong><span>${tt('내 식물','My plants','マイ植物')}</span></div><div class="stat"><strong>${finds.length}</strong><span>${tt('발견 기록','Finds','発見記録')}</span></div><div class="stat"><strong>${species}</strong><span>${tt('발견한 종','Species found','発見種')}</span></div></div></div>`;}
 }
 if(v==='friends')body=friendsView();
 if(v==='backup')body=backupBody();
 if(v==='language'){const cur=localStorage.getItem('pm-language');body=`<label class="form-field"><span>${tt('앱 표시 언어','DISPLAY LANGUAGE','表示言語')}</span><select id="language-choice" aria-label="Language"><option value="auto" ${!cur?'selected':''}>${tt('자동 (기기 언어)','Auto (device)','自動 (端末言語)')}</option><option value="ko" ${cur==='ko'?'selected':''}>한국어</option><option value="en" ${cur==='en'?'selected':''}>English</option><option value="ja" ${cur==='ja'?'selected':''}>日本語</option></select></label>`;}
 if(v==='account')body=`${authPanel()}<div class="option-section"><h2>${tt('온라인 베타','ONLINE BETA','オンラインベータ')}</h2><p class="setting-description">${esc(invitedNotice())}</p>${state.onlineError?`<p class="footnote">${esc(state.onlineError)}</p>`:''}</div>`;
 if(v==='about')body=`<p class="setting-description">RAINFOREST MEMORIES · Designed by PLANT MATTER<br>BETA 15</p><p class="footnote">${tt('내 식물과 야생에서 발견한 식물을 기록하는 앱입니다. 발견 장소는 나라까지만 기록합니다.','An app for your own plants and the plants you find in the wild. Finds are recorded by country only.','自分の植物と野外で見つけた植物を記録するアプリです。発見場所は国までだけ記録します。')}</p><p class="footnote"><a class="text-link" href="./terms.html" target="_blank" rel="noopener">${tt('이용약관','Terms','利用規約')}</a> · <a class="text-link" href="./privacy.html" target="_blank" rel="noopener">${tt('개인정보 처리 안내','Privacy','プライバシー')}</a></p>`;
 return `<section class="page opt-page"><h1 class="screen-title">${titles[v]||''}</h1>${body}</section>`;
}
function backupBody(){
 const pending=state.records.filter(r=>r.syncPending).length;
 return `<div class="option-section"><h2>${tt('온라인 저장','ONLINE SAVE','オンライン保存')}</h2><p class="mini-muted acc-status">${state.member?'INVITED TESTER':state.authClient?'NOT CONNECTED':'SETUP REQUIRED'}</p><div class="info">${state.member?tt(`저장한 기록은 온라인에 자동으로 올라갑니다. 대기 중인 업로드: ${pending}개.`,`Saved records upload automatically. Pending uploads: ${pending}.`,`保存した記録は自動でアップロードされます。アップロード待ち：${pending}件。`):tt('내 기록은 이 기기에 저장됩니다. 온라인 저장은 승인된 계정으로 로그인하면 사용할 수 있습니다.','Your records are saved on this device. Sign in with an approved account to save online.','記録はこの端末に保存されます。承認済みアカウントでログインするとオンライン保存できます。')}</div>${state.member&&localOnlyRecords().length?`<button type="button" class="primary-button wide backup-all" data-action="backup-local">${tt(`기기에만 있는 기록 ${localOnlyRecords().length}개를 비공개로 온라인 백업`,`Back up ${localOnlyRecords().length} device-only records online (private)`,`端末のみの記録${localOnlyRecords().length}件を非公開でバックアップ`)}</button>`:''}${state.member?`<button type="button" class="light-button wide" data-action="sync-now">${tt('지금 동기화','SYNC NOW','今すぐ同期')}</button>`:''}</div>
 <div class="option-section"><h2>${tt('데이터 백업','DATA BACKUP','データのバックアップ')}</h2><div class="profile-actions"><button type="button" class="light-button" data-action="export">${tt('JSON 내보내기','EXPORT JSON','JSONを書き出す')}</button><button type="button" class="light-button" data-action="import">${tt('JSON 가져오기','IMPORT JSON','JSONを読み込む')}</button></div><input type="file" class="hidden-input" accept="application/json,.json" id="import-input"/><p class="footnote">${tt('백업 파일에는 사진과 예전에 기록한 좌표가 들어 있을 수 있으니 비공개로 보관하세요.','Backup files can contain photos and earlier coordinates; keep them private.','バックアップには写真や以前の座標が含まれることがあるので、非公開で保管してください。')}</p></div>`;
}
function accountTypeCard(){
 if(!state.user||!state.profile||state.beta10Missing)return '';
 const c=state.profile.personal_category||'',cat=PERSONAL_CATEGORIES().find(([k])=>k===c);
 return `<div class="account-type"><span class="cat-heading">${tt('나의 식물 활동','MY PLANT ACTIVITY','私の植物活動')}</span><div class="pill-row cat-row">${PERSONAL_CATEGORIES().map(([k,label])=>`<button type="button" class="pill ${c===k?'active':''}" data-action="personal-category" data-cat="${k}" aria-pressed="${c===k}">${label}</button>`).join('')}</div><small class="account-desc">${cat?esc(cat[2]):tt('나를 소개할 카테고리를 골라 보세요. 도감과 검색 결과에 표시됩니다.','Pick a category that describes you. It appears in your dex and search results.','自分に合うカテゴリーを選んでください。図鑑と検索結果に表示されます。')}</small></div>`;
}
async function setPersonalCategory(cat){
 if(!state.authClient||!state.user)return;
 const {error}=await state.authClient.from('profiles').update({personal_category:cat||null,account_type:'personal',updated_at:new Date().toISOString()}).eq('id',state.user.id);
 if(error)return toast(error.message);
 await readProfile();rerenderKeepScroll();toast(tt('카테고리를 저장했습니다.','Category saved.','カテゴリーを保存しました。'));
}
// Everyone is a personal account now (BETA 15): the label is the chosen plant activity.
function accountLabel(p){
 if(!p||!p.account_type)return '';
 const c=PERSONAL_CATEGORIES().find(([k])=>k===p.personal_category);
 return c?`${tt('개인','Personal','個人')} · ${c[1]}`:tt('개인','Personal','個人');
}

// ---------- shell: top bar, tabs, back ----------
const TABS=['home','plant','matter','options'];
function topbarAction(){
 if(state.tab==='plant'&&state.plantView==='mine'&&state.member&&!state.beta07Missing)return 'plant-add';
 if(state.tab==='plant'&&state.plantView==='wild')return 'find-add';
 if(state.tab==='matter'&&state.matterView==='event'&&state.isAdmin)return 'event-add';
 if(state.tab==='matter'&&state.matterView==='shops'&&state.isAdmin)return 'shop-add';
 return '';
}
function topbarMarkup(){
 if(state.tab==='home')return `<button type="button" class="brand" data-nav="home" aria-label="${esc(tt('홈','Home','ホーム'))}"><img src="./assets/titles/brand-lockup.png" alt="RAINFOREST MEMORIES — Designed by PLANT MATTER" class="brand-lockup" width="1705" height="275"/></button><span class="tb-right"><span class="status">BETA 15</span><button type="button" class="tb-icon tb-menu" data-nav="options" aria-label="${esc(tt('메뉴','Menu','メニュー'))}">${ICON_MENU}</button></span>`;
 const add=topbarAction();
 return `<button type="button" class="tb-icon tb-back" data-action="back" aria-label="${esc(tt('뒤로','Back','戻る'))}">${ICON_BACK}</button>${add?`<button type="button" class="tb-icon tb-add" data-action="${add}" aria-label="${esc(tt('추가','Add','追加'))}">${ICON_PLUS}</button>`:''}`;
}
function screenKey(){
 if(state.tab==='plant')return state.plantView?`plant-${state.plantView}`:'plant';
 if(state.tab==='matter')return state.matterView?`matter-${state.matterView}`:'matter';
 if(state.tab==='options')return state.optionView?`options-${state.optionView}`:'options';
 return state.tab;
}
function render(){
 if(state.user&&!state.profile?.onboarding_completed&&state.tab!=='options'){state.tab='options';state.optionView='account';}
 const screens={home:homeScreen,plant:plantScreen,record:formScreen,matter:matterScreen,options:optionsScreen};
 content.innerHTML=(screens[state.tab]||homeScreen)();
 const bar=$('#topbar');if(bar)bar.innerHTML=topbarMarkup();
 const navTab=state.tab==='record'?'plant':state.tab;
 document.querySelectorAll('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.nav===navTab));
 document.body.dataset.screen=screenKey();
 if(state.tab==='record'){
  if(state.editingId){populateEditForm();if(state.draft?.editingId===state.editingId)restoreDraft(true);}
  else if(state.draft)restoreDraft();
  syncPickers(content);
 }
 translateUI();
 hydrateSigned(content).catch(console.warn);
 updateFriendBadge();
 window.scrollTo({top:0,behavior:'instant'});
}
function rerenderKeepScroll(){const y=window.scrollY;render();window.scrollTo(0,y);}
function nav(tab){
 if(!TABS.includes(tab))return;
 if(state.tab==='record')saveDraftSoon(true);
 // Tapping the tab you are on goes back to its first screen.
 if(tab===state.tab){if(tab==='plant')state.plantView=null;if(tab==='matter')state.matterView=null;if(tab==='options'&&state.profile?.onboarding_completed!==false)state.optionView=null;}
 state.tab=tab;state.editingId=null;state.photoData=null;state.formPhotos=[];state.formHabitat=[];
 closeDetail();render();
}
function openFindForm(){
 if(state.tab==='record')return;
 state.editingId=state.draft?.editingId&&getRecord(state.draft.editingId)?state.draft.editingId:null;state.photoData=null;state.formPhotos=[];state.formHabitat=[];
 if(state.editingId){const r=editableRecord(state.editingId);state.formPhotos=recordPlantPhotos(r);state.formHabitat=recordHabitatPhotos(r);}
 state.tab='record';closeDetail();render();
}
function goBack(){
 if(state.tab==='record'){saveDraftSoon(true);state.tab='plant';state.plantView='wild';state.editingId=null;state.formPhotos=[];state.formHabitat=[];return render();}
 if(state.tab==='plant'&&state.plantView){state.plantView=null;return render();}
 if(state.tab==='matter'&&state.matterView){state.matterView=null;return render();}
 if(state.tab==='options'&&state.optionView){if(state.user&&!state.profile?.onboarding_completed)return toast(tt('먼저 기본 정보를 설정해 주세요.','Please finish setting up your account first.','先に基本情報を設定してください。'));state.optionView=null;return render();}
 nav('home');
}
function updateFriendBadge(){const n=state.user?friendRequestsIn().length:0,btn=document.querySelector('.bottom-nav [data-nav="options"]');if(btn)btn.classList.toggle('has-badge',n>0);}
function refreshFriendUI(){
 updateFriendBadge();
 if(!overlay.classList.contains('hidden')&&state.dex&&state.dexUserId===state.dex.uid&&$('.dex-head',overlay)){const y=overlay.scrollTop;renderUserDex();overlay.scrollTop=y;}
 if(state.tab==='options'&&(state.optionView==='friends'||!state.optionView))rerenderKeepScroll();
}

// ---------- wild find form (③): country only ----------
function formScreen(){
 const editing=state.editingId&&editableRecord(state.editingId);
 return `<section class="page form-page"><h1 class="screen-title">${editing?'Edit Find':'New Wild Find'}</h1><p class="lead">${editing?tt('사진·학명·나라·환경을 언제든 고칠 수 있습니다. 기록 ID와 동정 의견은 유지됩니다.','Edit photos, name, country and habitat anytime. The record ID and identifications stay.','写真・学名・国・環境はいつでも修正できます。記録IDと同定意見は保持されます。'):tt('야생에서 만난 식물을 기록하세요. 입력 내용은 자동으로 임시 저장되고, 저장하면 온라인에도 저장됩니다.','Record a plant you found in the wild. Drafts save automatically and saved records go online too.','野外で見つけた植物を記録しましょう。下書きは自動保存され、保存した記録はオンラインにも保存されます。')}</p><form id="observation-form" autocomplete="off"><p id="draft-status" class="draft-status">${tt('자동 임시 저장','Drafts save automatically','自動で下書き保存')}</p>${obsPhotoSection()}<div class="form-section"><h2>02 / TAXONOMY</h2>${fieldInput('scientificName','학명 / Scientific name','예: Ficus sp. (미동정 가능)')}${fieldInput('family','과명 / Family','예: Moraceae')}${fieldSelect('identificationStatus','동정 상태',[['unidentified','미동정'],['proposed','동정 제안'],['review','검토 중'],['verified','동정 완료']])}</div>${observedSection()}<div class="form-section"><h2>04 / COUNTRY</h2><div class="form-field"><span>${tt('발견한 나라','Country where you found it','発見した国')}</span>${placePicker({id:'find-country',mode:'country',placeInput:'countryCode',labelInput:'country'})}<small>${tt('정확한 장소 대신 나라까지만 기록합니다. 넓은 지역을 고른 뒤 나라를 고르세요.','Only the country is recorded, never the exact spot. Pick a broad region, then the country.','正確な場所ではなく国だけを記録します。地域を選んでから国を選んでください。')}</small></div></div><div class="form-section"><h2>05 / FIELD NOTES</h2>${fieldSelect('habit','생육 형태',[['지생','지생'],['착생','착생'],['암생','암생'],['포복','포복'],['덩굴','덩굴'],['관목','관목'],['교목','교목'],['수생','수생'],['기타','기타']])}${fieldSelect('phenology','생육 상태',[['영양생장','영양생장'],['개화','개화'],['결실','결실'],['포자 형성','포자 형성'],['휴면','휴면']])}${fieldInput('habitat','서식지 유형','운무림 / 산지 열대우림')}${fieldInput('substrate','기질 / Substrate','이끼, 암면, 낙엽층 등')}${fieldInput('elevation','해발 고도 (m)','1200','number','step="any"')}<label class="form-field"><span>현장 메모</span><textarea name="notes" placeholder="잎·줄기·꽃의 특징, 동반 식생, 환경 등"></textarea></label></div>${sharingSection(editing)}<button type="button" class="advanced-toggle" data-action="advanced">＋ 전문 환경 측정 및 표본 기록 펼치기</button><div id="advanced-fields" class="advanced"><div class="form-section"><h2>07 / ENVIRONMENTAL MEASUREMENTS</h2><div class="two-col">${fieldInput('lux','조도 (lx)','850','number','step="any"')}${fieldInput('ppfd','PPFD (µmol/m²/s)','25','number','step="any"')}</div><div class="two-col">${fieldInput('temperature','기온 (°C)','23.5','number','step="any"')}${fieldInput('humidity','상대습도 (%)','88','number','step="any" min="0" max="100"')}</div>${fieldSelect('measurementSource','측정 근거',[['not-recorded','미기록'],['instrument','계측 장비를 사용한 실측'],['estimated','추정값 또는 외부 자료'],['unspecified','출처 미지정']])}${fieldInput('measurementDevice','측정 장비','조도계 모델 / 측정 높이')}${fieldInput('measuredAt','측정 시각','','datetime-local')}</div><div class="form-section"><h2>08 / COLLECTION & RESEARCH</h2>${fieldInput('fieldNumber','필드 번호 / Field number','PMF-001')}${fieldInput('collector','관찰자 / Observer','')}${fieldInput('population','개체군 / Abundance','작은 군락 형태')}${fieldInput('associatedSpecies','동반 식생 / Associated species','')}${fieldInput('voucher','표본·바우처 / Voucher','표본 미채집 / 기관·번호')}</div></div><div class="info warning" style="margin:18px 0">${tt('사진은 저장하기 전에 크기를 줄이고 위치가 담긴 EXIF 정보를 지웁니다. 사진 속 표지판처럼 장소가 드러나는 단서는 피해 주세요.','Photos are resized and their EXIF location data removed before saving. Avoid signs or landmarks that reveal the spot.','写真は保存前に縮小し、位置を含むEXIF情報を削除します。看板など場所が分かる手がかりは避けてください。')}</div><button class="primary-button wide" type="submit" id="save-button">${editing?'변경 사항 저장하기':'관찰 기록 저장하기'}</button>${editing?'<button class="light-button wide cancel-edit" type="button" data-action="cancel-edit">수정 취소</button>':''}<p class="footnote" style="text-align:center">${tt('기록은 이 기기에 먼저 저장되고, 승인된 멤버는 온라인에도 자동으로 저장됩니다.','Records are saved on this device first and, for approved members, online too.','記録はまず端末に保存され、承認済みメンバーはオンラインにも自動保存されます。')}</p></form></section>`;
}
// What others see of a find's place: the country, unless an older record chose "location private".
function findCountryText(r){
 if(!canEdit(r)&&r.privacy==='private')return tt('비공개','Hidden','非公開');
 const code=findCountry(r);if(code)return `${countryLabel(code)} · ${regionName(regionOf(code))}`;
 return r.country||'';
}
function rowFromRecord(r){
 return {id:r.id,owner_id:state.user.id,scientific_name:r.scientificName||'미동정 식물',family:r.family||null,country:r.country||null,locality:null,
  // BETA 15: finds are shared by country only; no coordinates or place names go to the shared table.
  latitude:null,longitude:null,privacy:r.privacy==='private'?'private':'coarse',elevation:r.elevation??null,habitat:r.habitat||null,habit:r.habit||null,
  substrate:r.substrate||null,phenology:r.phenology||null,lux:r.lux===''?null:r.lux??null,ppfd:r.ppfd===''?null:r.ppfd??null,
  temperature:r.temperature===''?null:r.temperature??null,humidity:r.humidity===''?null:r.humidity??null,
  observed_at:r.observedAt||new Date().toISOString(),notes:r.notes||null,identification_status:r.identificationStatus||'unidentified',
  measurement_source:r.measurementSource||'not-recorded',measurement_device:r.measurementDevice||null,measured_at:r.measuredAt||null,
  photo_path:r.photoPath||null,is_hidden:!!r.hidden,observed_time_unknown:!!r.observedTimeUnknown,country_code:r.countryCode||null,expedition_id:r.projectId||null,updated_at:new Date().toISOString()};
}

// ---------- community data (no places) and the member dex ----------
async function loadCommunity(){
 if(!state.member||!state.authClient)return;
 const client=state.authClient;
 const [likes,comments]=await Promise.all([client.from('field_likes').select('observation_id,user_id').limit(1000),client.from('field_comments').select('id,observation_id,author_id,body,created_at').order('created_at',{ascending:false}).limit(1000)]);
 if(likes.error||comments.error){state.communitySetupRequired=true;state.communityError=(likes.error||comments.error).message;console.warn('BETA06 community migration required',state.communityError);return;}
 state.communitySetupRequired=false;state.likes=likes.data||[];state.comments=comments.data||[];
 const plants=await client.from('place_plants').select('*').order('created_at',{ascending:true}).limit(2000);
 if(plants.error){state.beta07Missing=true;state.placePlants=[];console.warn('BETA07 migration required',plants.error.message);}else{state.beta07Missing=false;state.placePlants=(plants.data||[]).filter(x=>!x.is_hidden||x.owner_id===state.user?.id);}
 await detectBeta13(client,plants);
 const ids=[...new Set([...state.comments.map(c=>c.author_id),...state.sharedRecords.map(r=>r.ownerId),...state.placePlants.map(x=>x.owner_id)].filter(Boolean))];state.authorNames={};
 if(ids.length){const {data}=await client.from('profiles').select('*').in('id',ids.slice(0,300));for(const p of data||[]){state.authorNames[p.id]=p.display_name;rememberPerson(p);}}
}
async function openUserDex(uid){
 if(!uid)return;if(!state.member||!state.authClient)return toast(tt('도감은 승인된 베타 멤버만 볼 수 있습니다.','The dex needs an approved beta account.','図鑑は承認済みメンバーのみ閲覧できます。'));
 state.detailBackUser=null;state.dexUserId=uid;
 overlay.innerHTML=`<div class="detail-body"><div class="detail-header"><span class="eyebrow">FIELD DEX</span><button type="button" class="close" data-action="close">✕ ${tt('닫기','CLOSE','閉じる')}</button></div><div class="loader">${tt('도감을 불러오는 중…','Loading dex…','図鑑を読み込み中…')}</div></div>`;
 overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;
 const c=state.authClient;
 try{
  const [prof,obs,plants,cats]=await Promise.all([
   c.from('profiles').select('*').eq('id',uid).maybeSingle(),
   c.from('field_observations').select('*').eq('owner_id',uid).order('observed_at',{ascending:true}).limit(500),
   c.from('place_plants').select('*').eq('owner_id',uid).order('created_at',{ascending:true}).limit(1000),
   c.from('plant_categories').select('*').eq('owner_id',uid).limit(500)]);
  if(prof.error)throw prof.error;if(!prof.data)throw Error(tt('이용자를 찾을 수 없습니다.','User not found.','ユーザーが見つかりません。'));
  if(state.dexUserId!==uid)return;
  const rows=obs.error?[]:(obs.data||[]);
  await signBucket('field-photos',rows.map(r=>r.photo_path));
  const records=rows.map(r=>fromCloud(r,cachedSigned('field-photos',r.photo_path),null)).sort((a,b)=>new Date(a.observedAt)-new Date(b.observedAt));
  const plantRows=plants.error?[]:(plants.data||[]).filter(x=>!x.is_hidden||x.owner_id===state.user?.id);
  for(const p of plantRows){const i=state.placePlants.findIndex(x=>x.id===p.id);if(i>=0)state.placePlants[i]=p;else state.placePlants.push(p);}
  rememberPerson(prof.data);
  state.dexRecords=records;state.dex={uid,profile:prof.data,records,plants:plantRows,categories:cats?.error?[]:(cats?.data||[])};
  renderUserDex();
 }catch(e){if(state.dexUserId===uid){overlay.querySelector('.loader').textContent=e.message||String(e);}}
}
function renderUserDex(){
 const d=state.dex;if(!d)return;
 const p=d.profile,mine=d.uid===state.user?.id,recs=d.records,plants=d.plants;
 const found=new Set(recs.map(r=>speciesKey(r.scientificName)).filter(Boolean)).size,owned=new Set(plants.map(x=>speciesKey(x.scientific_name)).filter(Boolean)).size;
 const verified=tt('✓ 동정 완료','✓ Identified','✓ 同定済み');
 const obsTiles=recs.map((r,i)=>dexTile({no:i+1,src:photoSource(r),bucket:'field-photos',path:r.photoPath,name:r.scientificName||tt('미동정 식물','Unidentified plant','未同定の植物'),badge:`${r.hidden?'<span class="tiny-tag private-tag">PRIVATE</span>':''}${r.identificationStatus==='verified'?`<span class="dex-badge">${verified}</span>`:`<span class="dex-sub">${esc([findCountry(r)?countryLabel(findCountry(r)):'',fmt(r.observedAt)].filter(Boolean).join(' · '))}</span>`}`,action:'dex-record',attrs:`data-record-id="${esc(r.id)}"`})).join('');
 const plantGroups=dexPlantGroups(plants,d.categories||[],mine);
 const contacts=[p.public_email?`<a class="contact-row" href="mailto:${esc(p.public_email)}"><span>${tt('이메일','EMAIL','メール')}</span><strong>${esc(p.public_email)}</strong></a>`:'',p.public_phone?`<a class="contact-row" href="tel:${esc(String(p.public_phone).replace(/[^+0-9]/g,''))}"><span>${tt('전화','PHONE','電話')}</span><strong>${esc(p.public_phone)}</strong></a>`:''].join('');
 overlay.innerHTML=`<div class="detail-body dex"><div class="detail-header"><span class="eyebrow">FIELD DEX / ${tt('식물 도감','PLANT DEX','植物図鑑')}</span><button type="button" class="close" data-action="close">✕ ${tt('닫기','CLOSE','閉じる')}</button></div>
 <div class="dex-head">${avatarMarkup(p.avatar_path,p.display_name,'avatar-xl')}<div><h1>${esc(p.display_name||tt('멤버','Member','メンバー'))}</h1>${accountLabel(p)?`<p class="dex-account">${esc(accountLabel(p))}</p>`:''}${mine?'':`<div class="dex-friend">${friendButtons(d.uid)}</div>`}${mine?`<p class="mini-muted">${tt('내 도감 · 다른 멤버에게 보이는 모습입니다. PRIVATE·비공개 표시는 나에게만 보입니다.','My dex as other members see it. PRIVATE items are visible only to you.','自分の図鑑 · 他のメンバーから見える表示です。PRIVATE・非公開は自分だけに表示されます。')}</p>`:''}</div></div>
 <div class="dex-stats three"><div><strong>${recs.length}</strong><span>${tt('발견 기록','Finds','発見記録')}</span></div><div><strong>${found}</strong><span>${tt('발견한 종','Species found','発見種')}</span></div><div><strong>${owned}</strong><span>${tt('보유 종','Species kept','保有種')}</span></div></div>
 <section class="dex-section"><h2>${tt('자연에서 발견한 식물','FOUND IN THE WILD','野外で発見した植物')}</h2>${obsTiles?`<div class="dex-grid">${obsTiles}</div>`:`<p class="mini-muted">${tt('공개된 발견 기록이 없습니다.','No shared finds yet.','公開された発見記録はありません。')}</p>`}</section>
 <section class="dex-section"><h2>${tt('보유 식물','PLANTS KEPT','保有植物')}</h2>${plantGroups||`<p class="mini-muted">${tt('등록된 보유 식물이 없습니다.','No plants listed.','登録された植物はありません。')}</p>`}</section>
 <section class="dex-section"><h2>${tt('공개 연락처','PUBLIC CONTACT','公開連絡先')}</h2>${contacts||`<p class="mini-muted">${tt('공개된 연락처가 없습니다.','No public contact details.','公開された連絡先はありません。')}</p>`}</section></div>`;
 overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');overlay.scrollTop=0;translateUI(overlay);
 hydrateSigned(overlay).catch(console.warn);
}

// Event delegation keeps the static app dependency-free and compatible with GitHub Pages.
document.addEventListener('click',async event=>{
 const navBtn=event.target.closest('[data-nav]');if(navBtn){nav(navBtn.dataset.nav);return;}
 const imageHit=event.target.closest('.record-card .botanical');if(imageHit&&imageHit.dataset.photoId){openPhotoViewer(imageHit.dataset.photoId);return;}
 const rec=event.target.closest('[data-detail]');if(rec){detail(rec.dataset.detail);return;}
 const edit=event.target.closest('[data-edit]');if(edit){editRecord(edit.dataset.edit);return;}
 const del=event.target.closest('[data-delete]');if(del){if(confirm('이 관찰 기록을 삭제할까요? 온라인 공유 중인 기록은 테스트 그룹에서도 삭제됩니다.'))try{await removeObservation(del.dataset.delete);closeDetail();render();toast('기록을 삭제했습니다.')}catch(e){toast('삭제에 실패했습니다: '+e.message);}return;}
 const action=event.target.closest('[data-action]');if(!action)return;
 const ds=action.dataset;
 switch(ds.action){
  // shell
  case 'back':goBack();break;
  case 'plant-view':state.plantView=ds.view==='wild'?'wild':'mine';render();break;
  case 'matter-view':state.matterView=ds.view==='shops'?'shops':'event';render();break;
  case 'option-view':state.tab='options';state.optionView=ds.view||null;closeDetail();render();break;
  case 'close':closeDetail();break;
  // PLANT: categories, plants, finds
  case 'cat-toggle':{const id=ds.catId;if(state.openCats.has(id))state.openCats.delete(id);else state.openCats.add(id);rerenderKeepScroll();break;}
  case 'cat-add':await addCategory(null);break;
  case 'cat-sub-add':await addCategory(ds.catId);break;
  case 'cat-rename':await renameCategory(ds.catId);break;
  case 'cat-delete':await deleteCategory(ds.catId);break;
  case 'plant-add':plantForm({});break;
  case 'plant-add-in':plantForm({categoryId:ds.catId});break;
  case 'pp-view':plantDetail(ds.plantId);break;
  case 'pp-edit':plantForm({plantId:ds.plantId});break;
  case 'pp-delete':await deletePlacePlant(ds.plantId);break;
  case 'pp-hide':await setPlantHidden(ds.plantId,true);break;
  case 'pp-unhide':await setPlantHidden(ds.plantId,false);break;
  case 'pp-photo-add':$('#pp-gallery-input')?.click();break;
  case 'pp-photo-remove':state.ppPhotos.splice(Number(ds.index),1);refreshPpPhotos();break;
  case 'pp-photo-cover':{const [x]=state.ppPhotos.splice(Number(ds.index),1);if(x)state.ppPhotos.unshift(x);refreshPpPhotos();break;}
  case 'region-toggle':{const k=ds.region;if(state.openRegions.has(k))state.openRegions.delete(k);else state.openRegions.add(k);rerenderKeepScroll();break;}
  case 'find-add':openFindForm();break;
  case 'picker-open':togglePicker(ds.picker);break;
  case 'picker-region':{const el=document.getElementById(ds.picker);if(el){el.dataset.open=el.dataset.open===ds.region?'':ds.region;renderPickerPanel(el);}break;}
  case 'picker-choose':choosePlace(ds.picker,ds.region||'',ds.place||'');break;
  // MATTER + HOME
  case 'event-open':eventDetail(ds.eventId);break;
  case 'event-add':matterForm('event');break;
  case 'event-edit':matterForm('event',ds.eventId);break;
  case 'event-delete':await deleteMatter('event',ds.eventId);break;
  case 'shop-open':shopDetail(ds.shopId);break;
  case 'shop-add':matterForm('shop');break;
  case 'shop-edit':matterForm('shop',ds.shopId);break;
  case 'shop-delete':await deleteMatter('shop',ds.shopId);break;
  case 'media-add':$('#media-gallery-input')?.click();break;
  case 'media-remove':state.mediaItems.splice(Number(ds.index),1);refreshMediaGrid();break;
  case 'media-cover':{const [x]=state.mediaItems.splice(Number(ds.index),1);if(x)state.mediaItems.unshift(x);refreshMediaGrid();break;}
  // records, comments, identification
  case 'like':await toggleLike(ds.recordId);break;
  case 'open-comments':detail(ds.recordId);setTimeout(()=>$('#comment-section')?.scrollIntoView({block:'center',behavior:'smooth'}),30);break;
  case 'delete-comment':await deleteComment(ds.commentId);break;
  case 'photo-view':openPhotoViewer(ds.photoId);break;
  case 'photo-close':closePhotoViewer();break;
  case 'share-record':await publishRecord(ds.recordId);break;
  case 'sync-now':await syncPendingRecords();toast(tt('온라인 동기화를 확인했습니다.','Sync checked.','同期を確認しました。'));break;
  case 'cancel-edit':cancelEdit();break;
  case 'observed-now':setObservedFields(new Date().toISOString(),false);saveDraftSoon();break;
  case 'observed-clear-time':{const f=$('#observation-form');if(f){f.elements.observedTime.value='';saveDraftSoon();}break;}
  case 'record-hide':await setRecordHidden(ds.recordId,true);break;
  case 'record-unhide':await setRecordHidden(ds.recordId,false);break;
  case 'backup-local':await backupLocalRecords();break;
  case 'backup-record':{const local=state.records.find(x=>x.id===ds.recordId);if(local&&state.member){await storeRecord({...local,onlinePublished:true,syncPending:true,hidden:true});await syncPendingRecords();detail(local.id);toast(tt('비공개로 온라인에 백업했습니다.','Backed up online as private.','非公開でバックアップしました。'));}break;}
  case 'photo-pick':{const sel=ds.input||'';if(/^#[a-z-]+$/.test(sel))$(sel)?.click();break;}
  case 'obs-photo-add':$(ds.kind==='habitat'?'#habitat-gallery-input':'#gallery-input')?.click();break;
  case 'obs-photo-remove':{const list=ds.kind==='habitat'?state.formHabitat:state.formPhotos;list.splice(Number(ds.index),1);refreshObsPhotos();break;}
  case 'obs-photo-cover':{const [x]=state.formPhotos.splice(Number(ds.index),1);if(x)state.formPhotos.unshift(x);refreshObsPhotos();break;}
  case 'slide-prev':slideBy(action,-1);break;
  case 'slide-next':slideBy(action,1);break;
  case 'slide-view':{const img=action.querySelector('img');if(img)openPhotoViewer(action.closest('.photo-slider')?.dataset.recordId,img.src);break;}
  case 'advanced':$('#advanced-fields')?.classList.toggle('open');action.textContent=translateText($('#advanced-fields').classList.contains('open')?'− 전문 항목 접기':'＋ 전문 환경 측정 및 표본 기록 펼치기',state.locale);break;
  case 'id-verify':await setIdentification(ds.recordId,'verified');break;
  case 'id-adopt':await setIdentification(ds.recordId,'verified',ds.name);break;
  case 'id-unverify':{const rr=getRecord(ds.recordId);await setIdentification(ds.recordId,rr?.suggestions?.length?'proposed':'unidentified');break;}
  // people, profile, dex
  case 'avatar-pick':$('#avatar-input')?.click();break;
  case 'avatar-remove':await removeAvatar();break;
  case 'personal-category':await setPersonalCategory(state.profile?.personal_category===ds.cat?'':ds.cat);break;
  case 'friend-add':await friendAction('add',ds.userId);break;
  case 'friend-accept':await friendAction('accept',ds.userId);break;
  case 'friend-decline':await friendAction('decline',ds.userId);break;
  case 'friend-cancel':await friendAction('cancel',ds.userId);break;
  case 'friend-remove':await friendAction('remove',ds.userId);break;
  case 'user-open':await openUserDex(ds.userId);break;
  case 'dex-record':state.detailBackUser=state.dex?.uid||null;detail(ds.recordId);break;
  case 'dex-plant':state.detailBackUser=state.dex?.uid||null;plantDetail(ds.plantId);break;
  // data and account
  case 'export':exportRecords();break;
  case 'import':$('#import-input')?.click();break;
  case 'google-login':await signInGoogle();break;
  case 'auth-retry':state.authError='';state.authLoading=false;render();break;
  case 'auth-toggle':state.authMode=state.authMode==='signin'?'signup':'signin';render();break;
  case 'reset-password':await resetPassword();break;
  case 'signout':await signOut();break;
  case 'delete-account':await deleteAccount();break;
 }
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){closeDetail();closePhotoViewer();document.querySelectorAll('.place-picker .picker-panel').forEach(p=>p.classList.add('hidden'));return;}
 if(event.key==='Enter'&&event.target.classList?.contains('picker-search')){event.preventDefault();return;}
 if((event.key==='Enter'||event.key===' ')&&event.target.matches('[role=button][data-action]:not(button)')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
});
document.addEventListener('input',event=>{
 const t=event.target;
 if(t.classList?.contains('picker-search')){const el=document.getElementById(t.dataset.picker);if(el){const pos=t.selectionStart;renderPickerPanel(el,t.value);const s=el.querySelector('.picker-search');if(s){s.focus();try{s.setSelectionRange(pos,pos);}catch{}}}return;}
 if(t.closest('#place-plant-form')){const form=t.form;if(t.name==='scientificName'){t.dataset.auto=t.value.trim()?'0':'1';return;}if(/ParentName$/.test(t.name)){updateCrossName(form);return;}}
 if(t.closest('#observation-form'))saveDraftSoon();
});
document.addEventListener('change',event=>{
 const t=event.target;
 if(t.id==='language-choice'){const v=t.value;if(v==='auto')localStorage.removeItem('pm-language');else localStorage.setItem('pm-language',v);state.locale=v==='auto'?(/^ja/i.test(navigator.language)?'ja':/^en/i.test(navigator.language)?'en':'ko'):v;render();return;}
 if(t.dataset?.parent&&t.form){const custom=t.form.elements[`${t.dataset.parent}ParentName`];if(custom){custom.classList.toggle('hidden',t.value!=='__custom');if(t.value==='__custom')custom.focus();}updateCrossName(t.form);return;}
 if(t.closest('#observation-form'))saveDraftSoon();
 if(t.id==='gallery-input'||t.id==='camera-input'){addObsPhotos(t.files,'plant');t.value='';}
 if(t.id==='habitat-gallery-input'||t.id==='habitat-camera-input'){addObsPhotos(t.files,'habitat');t.value='';}
 if(t.id==='pp-gallery-input'||t.id==='pp-camera-input'){addPpPhotos(t.files);t.value='';}
 if(t.id==='media-gallery-input'||t.id==='media-camera-input'){addMedia(t.files);t.value='';}
 if(t.id==='import-input'){importRecords(t.files?.[0]);t.value='';}
 if(t.id==='avatar-input'||t.id==='avatar-camera-input'){uploadAvatar(t.files?.[0]);t.value='';}
 if(t.name==='displayName'&&t.closest('#profile-form'))updateNameHint(t);
});
document.addEventListener('submit',event=>{
 // getAttribute: a field named "id" inside a form would shadow form.id.
 const f=event.target,stop=()=>event.preventDefault(),fid=f.getAttribute('id');
 if(fid==='observation-form'){stop();saveForm(f);}
 if(fid==='suggest-form'){stop();addSuggestion(f);}
 if(fid==='comment-form'){stop();addComment(f);}
 if(fid==='place-plant-form'){stop();savePlacePlant(f);}
 if(fid==='matter-form'){stop();saveMatter(f);}
 if(fid==='people-search'){stop();searchPeople($('#people-query')?.value);}
 if(fid==='auth-form'){stop();submitAuth(f);}
 if(fid==='profile-form'){stop();submitProfile(f);}
});
document.addEventListener('toggle',event=>{const key=event.target?.dataset?.acc;if(key)setSectionOpen(key,event.target.open);},true);
document.addEventListener('scroll',event=>{const t=event.target;if(t?.classList?.contains('pg-track'))sliderIndexChanged(t);else if(t?.classList?.contains('hero-track'))heroScrolled(t);},true);
document.addEventListener('load',event=>{const t=event.target?.closest?.('.pg-track');if(t)fitSliderHeight(t);},true);
(async function init(){
 await loadCountries().catch(console.warn);
 restoreMatterCache();
 try{state.db=await openDatabase();await reload();await loadExtras();}catch(e){console.error('IndexedDB unavailable',e);toast('기기 저장소를 열 수 없습니다. 사생활 보호 모드 또는 브라우저 설정을 확인하세요.');}
 render();
 await initAuth();
 await loadMatter().catch(console.warn);
 render();
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.tab==='record')saveDraftSoon(true);});
 window.addEventListener('online',()=>{if(state.member){syncPendingRecords().catch(console.warn);loadSharedRecords().catch(console.warn);}loadMatter().then(()=>{if(state.tab==='home'||state.tab==='matter')render();}).catch(console.warn);toast('인터넷 연결이 복구되었습니다.');});
 if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('ServiceWorker registration failed',e));}
})();

import {CATALOG,clone,uid,emptyDocument,newFurniture,newOpening,distance,snapPoint,snapFurniture,createCalibration,History,normalizeAngle,validateDocument,demoDocument} from './core.mjs';
import {furnitureSymbol} from './furniture.mjs';
import {View3D} from './view3d.mjs';
import {documentBounds,wallLength,nearestWall,snapWallPoint,openingError,roomPolygon,roomArea,roomInteriorPoint,moveWallEndpoints,refreshRooms} from './plan.mjs';
import {splitWall,nearestEndpoint,connectEndpoints,furnitureIds,pruneGroups,groupFurniture,ungroupFurniture,translateFurniture,rotateFurniture,copyFurniture,openingLeaf,layoutIssues} from './editing.mjs';
import {FINISHES,wallFinish,skirting,ceiling} from './finishes.mjs';
import {inspectGLB,MODEL_LIMIT} from './models.mjs';

const $=id=>document.getElementById(id), svg=$('plan'), history=new History();
const STORE='floorplan-designer-v1';
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let doc=demoDocument(), selection=null, tool='select', placing=null, points=[],hover=null,gesture=null,view=null,mode='2d',three=null;
let connectTarget=null,warningDoc=null,warnings={issues:[],truncated:false},warningIds=new Set();
let restored=false;
let restoreError='',originalCache='';
try {originalCache=localStorage.getItem(STORE);if(originalCache){doc=validateDocument(JSON.parse(originalCache));restored=true;}}catch(error){restoreError='原有缓存无法恢复，自动保存已暂停；请点击「备份原缓存」保留原文件后继续。';console.warn('Local plan unavailable:',error.message);}
function message(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
try{three=new View3D($('viewport'),(kind,id,event)=>{selectObject(kind,id,event?.shiftKey);render();},text=>message(text,true));}catch(error){$('viewport').textContent='三维视图暂不可用，请检查本地 Three.js 文件及 WebGL 支持。';console.error(error);}

function save(){
  if(restoreError){$('save-state').textContent='自动保存暂停：请先备份原缓存';return;}
  try{localStorage.setItem(STORE,JSON.stringify(doc));$('save-state').textContent='已保存到此浏览器';}
  catch(error){$('save-state').textContent='自动保存失败，请导出方案备份';}
}
function commit(before,refit=false){
  try{pruneGroups(doc);if(doc.autoRooms)refreshRooms(doc,uid);doc=validateDocument(doc);}
  catch(error){doc=before;render();message(`修改未保存：${error.message}`,true);return false;}
  history.push(before,doc);render(refit);save();return true;
}
function selected(){
  if(!selection)return null;
  return (selection.kind==='furniture'?doc.furniture:selection.kind==='wall'?doc.plan.walls:selection.kind==='room'?doc.rooms:selection.kind==='opening'?doc.openings:doc.measurements).find(v=>v.id===selection.id);
}
function selectedFurniture(){const ids=selection?.kind==='furniture'?furnitureIds(doc,selection.ids||[selection.id]):[];return doc.furniture.filter(f=>ids.includes(f.id));}
function selectObject(kind,id,additive=false,keep=false){
  if(kind!=='furniture'){selection=kind?{kind,id}:null;return;}
  const unit=furnitureIds(doc,[id]),current=selectedFurniture().map(f=>f.id);
  let ids=unit;
  if(additive){const remove=unit.every(v=>current.includes(v));ids=remove?current.filter(v=>!unit.includes(v)):[...new Set([...current,...unit])];}
  else if(keep&&current.includes(id))ids=current;
  selection=ids.length?{kind,id:ids.includes(id)?id:ids[0],ids}:null;
}
function edit(action,success){const before=clone(doc);try{action();if(commit(before)&&success)message(success);}catch(error){doc=before;render();message(error.message,true);}}
function renderIssues(){
  const enabled=$('check-layout').checked;
  if(enabled&&warningDoc!==doc){warnings=layoutIssues(doc);warningDoc=doc;}
  warningIds=enabled?new Set(warnings.issues.flatMap(v=>v.ids)):new Set();
  $('layout-summary').textContent=enabled?`${warnings.truncated?'至少 ':''}${warnings.issues.length} 处布局提示`:'布局检查已关闭';
  $('layout-issues').innerHTML=!enabled?'':warnings.issues.length?warnings.issues.map((v,i)=>`<button type="button" data-issue="${i}">${esc(v.label)}</button>`).join(''):'<p>未发现明显重叠或穿墙。</p>';
}
function renderMultiProperties(items){
  const grouped=items.every(f=>f.groupId&&f.groupId===items[0].groupId),uniform=items.every(f=>(f.elevation??0)===(items[0].elevation??0));
  $('properties').innerHTML=`<h3>${grouped?'家具组合':'多选家具'} · ${items.length} 件</h3><p class="tip" style="padding:0">Shift 点击增减选择；拖动、方向键和旋转操作作用于全部选中家具。旋转围绕所选家具中心进行。</p><form id="multi-form"><label>统一离地高度 / mm<input id="multi-elevation" type="number" min="0" max="10000" step="any" value="${uniform?items[0].elevation??0:''}" placeholder="当前高度不一致" required></label><button type="submit">应用离地高度</button></form><div class="property-actions"><button id="group" ${grouped?'disabled':''}>组合</button><button id="ungroup" ${items.some(f=>f.groupId)?'':'disabled'}>解组</button><button id="rotate">旋转 90°</button><button id="duplicate">复制</button><button id="lock-group">全部锁定</button><button id="unlock-group">全部解锁</button><button id="delete" class="danger">删除</button></div>`;
  const ids=items.map(f=>f.id);
  $('group').onclick=()=>edit(()=>groupFurniture(doc,ids,uid()),'已组合，点击任一成员可选择整个组合。');
  $('ungroup').onclick=()=>edit(()=>ungroupFurniture(doc,ids),'已解组，可分别选择家具。');
  $('rotate').onclick=rotateSelected;$('duplicate').onclick=duplicateSelected;$('delete').onclick=removeSelected;
  $('lock-group').onclick=()=>edit(()=>items.forEach(f=>f.locked=true),'所选家具已锁定。');
  $('unlock-group').onclick=()=>edit(()=>items.forEach(f=>f.locked=false),'所选家具已解锁。');
  $('multi-form').onsubmit=e=>{e.preventDefault();edit(()=>{if(items.some(f=>f.locked))throw new Error('所选家具中有锁定对象，请先解锁。');const value=Number($('multi-elevation').value);items.forEach(f=>f.elevation=value);},'所选家具的离地高度已更新。');};
}
function setMode(value){three?.walk?.stop();mode=value;$('workspace').dataset.mode=value;document.querySelectorAll('[data-mode]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',b.dataset.mode===value);});requestAnimationFrame(()=>three?.resize());}
function setTool(value,type=null){
  if(doc.image&&!doc.calibrated&&['place','door','window'].includes(value)){value='calibrate';type=null;}
  tool=value;placing=type;points=[];hover=null;connectTarget=null;svg.dataset.tool=value;
  document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===value));
  const hints={select:'选择并拖动对象；R 旋转，Delete 删除。',wall:'依次点击墙线的起点和终点；按住 Shift 可画斜墙。',room:'点击房间区域的两个对角；这是手工区域，不会自动识别房间。',measure:'点击两个点，记录它们之间的距离。',calibrate:'在原图上点击一段已知尺寸的两个端点，再输入实际毫米数。',place:`点击平面图放置${catalogEntries().find(i=>i.key===type)?.name||'家具'}，或按 Esc 取消。`};
  hints.door='点击墙体放置门；选中后可拖动或调整洞口尺寸。';hints.window='点击墙体放置窗；选中后可设置窗台高度。';
  hints.split='点击墙上需要分割的位置；不能切穿门窗洞口。';hints.connect='先点击需要移动的墙端点，再点击另一段墙的目标端点。';
  hints.calibrate='请点击原图上一段已标注尺寸的两个端点，再输入该段真实长度和单位。标定完成后再放家具。';
  $('wall-options').hidden=value!=='wall';
  message(hints[value]);if(value==='calibrate'){setMode('2d');$('show-image').checked=true;fitPlan();}else if(value!=='select'&&mode==='3d')setMode('2d');renderCatalog();renderPlan();
}
function fitPlan(){const original=tool==='calibrate'&&doc.image,b=original?{x:0,y:0,...doc.plan.image_size}:documentBounds(doc),pad=Math.max(b.width,b.height)*(original?.04:.10);view={x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad};renderPlan();}
function formatLength(pixels){return `${doc.calibrated?'':'≈'}${Math.round(pixels*doc.mmPerPixel).toLocaleString()} mm`;}
const meters=mm=>Number((mm/1000).toFixed(3)).toLocaleString();
function renderScale(){
  const b=doc.plan.bounds,s=doc.mmPerPixel;
  $('scale-state').textContent=doc.calibrated?`已标定 · 1 px = ${Number(s.toFixed(3))} mm`:'未标定 · 比例暂不可靠';$('scale-state').className=`pill ${doc.calibrated?'ready':''}`;
  $('scale-guide').hidden=!doc.image;$('scale-guide').classList.toggle('unverified',!doc.calibrated);
  $('scale-guide-title').textContent=doc.calibrated?'家具大小不对？先核对户型比例':'上传图片尚未标定，请先设置真实尺寸';
  const reference=doc.calibrationReference?`参考线 ${meters(doc.calibrationReference.millimeters)} m。`:'未记录参考线，可重新点选复核。';
  $('scale-guide-detail').textContent=doc.calibrated?`当前识别范围约 ${meters(b.width*s)} × ${meters(b.height*s)} m。${reference}`:'当前比例只是占位值，不代表实际户型尺寸；家具将按你标定后的比例显示。';
  $('review-scale').textContent=doc.calibrated?'复核 / 校正比例':'开始比例标定';
}
function previewCalibration(){
  const output=$('calibration-preview'),button=$('apply-calibration');button.disabled=true;
  if(!$('real-distance').value.trim()){output.textContent='请输入原图这段尺寸线标注的真实长度，例如 9255 mm 或 9.255 m。';return;}
  try{
    const next=createCalibration(points[0],points[1],Number($('real-distance').value),$('distance-unit').value),b=doc.plan.bounds,ratio=doc.mmPerPixel/next.mmPerPixel;
    output.textContent=`参考线：${meters(next.reference.millimeters)} m；校正后户型识别范围约 ${meters(b.width*next.mmPerPixel)} × ${meters(b.height*next.mmPerPixel)} m。家具在原图上的宽深将变为现在的 ${(ratio*100).toFixed(1)}%，家具实际尺寸不变。`;
    button.disabled=false;
  }catch(error){output.textContent=error.message;}
}
function openCalibration(){
  $('real-distance').value='';$('distance-unit').value='mm';
  $('calibration-current').textContent=`所选参考线在当前比例下${doc.calibrated?'':'暂'}为 ${meters(distance(points[0],points[1])*doc.mmPerPixel)} m，请与原图标注核对。`;
  renderPlan();previewCalibration();$('calibration-dialog').showModal();$('real-distance').focus();
}
function catalogEntries(){return [...CATALOG.map(f=>({...f,key:f.type})),...(doc.models||[]).map(m=>({...m,key:`model:${m.id}`,type:'model',category:'导入模型',color:'#9caeba'}))];}
function renderCatalog(){
  const category=$('category').value,query=$('catalog-search').value.trim().toLocaleLowerCase(),all=catalogEntries(),items=all.filter(f=>(category==='全部家具'||f.category===category)&&`${f.name} ${f.category} ${f.type}`.toLocaleLowerCase().includes(query));
  $('catalog-count').textContent=`${items.length} / ${all.length}`;
  $('catalog-items').innerHTML=items.length?items.map(f=>`<button class="furniture-card ${placing===f.key?'active':''}" data-type="${esc(f.key)}" draggable="true" title="放置${esc(f.name)}"><svg viewBox="0 0 110 110" aria-hidden="true"><g transform="translate(5 5)">${furnitureSymbol(f.type,f.color)}</g></svg><b>${esc(f.name)}</b><small>${f.width} × ${f.depth}</small></button>`).join(''):'<p class="catalog-empty">没有匹配的家具</p>';
}
function renderPlan(){
  if(!view)return;
  svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
  const b=doc.plan.bounds,unit=doc.mmPerPixel,step=500/unit,font=Math.max(9,Math.min(17,view.width/60));
  let html=`<defs><pattern id="grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M${step} 0H0V${step}" fill="none" stroke="#dce6e1" stroke-width=".6"/></pattern><pattern id="wood" width="60" height="12" patternUnits="userSpaceOnUse"><rect width="60" height="12" fill="#e6d9c3"/><path d="M0 0H60M30 0V12" stroke="#d4c4ab" stroke-width=".5"/></pattern><pattern id="tile" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#e5edeb"/><path d="M0 0H22V22" fill="none" stroke="#c8d8d3" stroke-width=".6"/></pattern></defs>`;
  html+=`<rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="${tool==='calibrate'?'#ffffff':'url(#grid)'}"/>`;
  if(tool==='calibrate'&&doc.image){
    html+=`<image href="${doc.image}" width="${doc.plan.image_size.width}" height="${doc.plan.image_size.height}" pointer-events="none"/>`;
    const ref=doc.calibrationReference;
    if(ref&&!points.length)html+=`<g pointer-events="none"><line x1="${ref.start.x}" y1="${ref.start.z}" x2="${ref.end.x}" y2="${ref.end.z}" stroke="#326e6b" stroke-width="3" stroke-dasharray="6 4"/><text x="${(ref.start.x+ref.end.x)/2+8}" y="${(ref.start.z+ref.end.z)/2}" font-size="${font}" fill="#23584f" stroke="white" stroke-width="3" paint-order="stroke">上次参考：${meters(ref.millimeters)} m</text></g>`;
  }else{
  for(const [index,r] of doc.rooms.entries()){
    const active=selection?.id===r.id;
    html+=`<defs><pattern id="floor-${index}" href="#${r.material==='tile'?'tile':'wood'}" patternTransform="rotate(${r.floorAngle??0})"/></defs><polygon data-kind="room" data-id="${esc(r.id)}" points="${roomPolygon(r).map(p=>`${p.x},${p.z}`).join(' ')}" fill="${r.material==='plain'?'#eef1e9':`url(#floor-${index})`}" stroke="${active?'#c6783f':'#d5dfd9'}" stroke-width="${active?3:1}"/>`;
  }
  if(doc.image&&$('show-image').checked)html+=`<image href="${doc.image}" width="${doc.plan.image_size.width}" height="${doc.plan.image_size.height}" opacity=".30" pointer-events="none"/>`;
  for(const w of doc.plan.walls){
    const active=selection?.id===w.id;
    html+=`<g data-kind="wall" data-id="${esc(w.id)}"><line x1="${w.x1}" y1="${w.z1}" x2="${w.x2}" y2="${w.z2}" stroke="transparent" stroke-width="${Math.max(w.thickness,14)}"/><line x1="${w.x1}" y1="${w.z1}" x2="${w.x2}" y2="${w.z2}" stroke="${active?'#c4844e':'#465d59'}" stroke-width="${w.thickness}" stroke-linecap="square"/></g>`;
    if(active)for(const end of [1,2])html+=`<text x="${w[`x${end}`]}" y="${w[`z${end}`]-w.thickness-8}" font-size="${font}" fill="#a85f2e" stroke="white" stroke-width="3" paint-order="stroke">${end===1?'起点':'终点'}</text>`;
    if(tool==='connect')for(const end of [1,2])html+=`<circle cx="${w[`x${end}`]}" cy="${w[`z${end}`]}" r="${Math.max(5,view.width/180)}" fill="#fff" stroke="#326e6b" stroke-width="2" pointer-events="none"/>`;
    const length=Math.hypot(w.x2-w.x1,w.z2-w.z1);
    if($('show-dimensions').checked&&length*unit>=1100){const angle=Math.atan2(w.z2-w.z1,w.x2-w.x1)*180/Math.PI;
      html+=`<text x="0" y="${-w.thickness/2-5}" transform="translate(${(w.x1+w.x2)/2} ${(w.z1+w.z2)/2}) rotate(${angle>90?angle-180:angle})" text-anchor="middle" font-size="${font*.64}" fill="#6c7e78" stroke="#fafcfb" stroke-width="2.3" paint-order="stroke">${doc.calibrated?'':'≈'}${Math.round(length*unit)}</text>`;
    }
  }
  for(const o of doc.openings){
    const w=doc.plan.walls.find(w=>w.id===o.wallId);if(!w)continue;
    const length=wallLength(w),t=o.offset/(length*unit),width=o.width/unit,x=w.x1+(w.x2-w.x1)*t,z=w.z1+(w.z2-w.z1)*t,angle=Math.atan2(w.z2-w.z1,w.x2-w.x1)*180/Math.PI,color=selection?.id===o.id?'#c6783f':'#397b88';
    const leaf=openingLeaf(o),hx=leaf.hinge/unit,ex=leaf.x/unit,ez=leaf.z/unit;
    const swing=o.type==='door'||leaf.angle>0?`<path d="M${hx} 0L${ex} ${ez}${leaf.angle>0?` M${-hx} 0A${width} ${width} 0 0 ${leaf.direction*leaf.side>0?1:0} ${ex} ${ez}`:''}" stroke="${color}" stroke-width="1.5" fill="none"/>`:`<path d="M${-width/2} -2H${width/2} M${-width/2} 2H${width/2}" stroke="${color}" stroke-width="1.5"/>`;
    html+=`<g data-kind="opening" data-id="${esc(o.id)}" transform="translate(${x} ${z}) rotate(${angle})"><title>${o.type==='door'?'门':'窗'} ${o.width} × ${o.height} mm</title><rect x="${-width/2}" y="${-w.thickness/2-1}" width="${width}" height="${w.thickness+2}" fill="#fafcfb" stroke="${color}" stroke-width="1.5"/>${swing}</g>`;
  }
  for(const f of [...doc.furniture].sort((a,b)=>(a.type==='rug'?-1:0)-(b.type==='rug'?-1:0))){
    const w=f.width/unit,d=f.depth/unit,active=selection?.kind==='furniture'&&(selection.ids||[selection.id]).includes(f.id),warning=warningIds.has(f.id);
    html+=`<g data-kind="furniture" data-id="${esc(f.id)}" transform="translate(${f.x} ${f.z}) rotate(${f.rotation})"><title>${esc(f.name)} ${f.width} × ${f.depth} mm · 离地 ${f.elevation??0} mm${f.groupId?' · 组合成员':''}</title><svg x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">${furnitureSymbol(f.type,f.color)}</svg>${active||warning?`<rect x="${-w/2-3}" y="${-d/2-3}" width="${w+6}" height="${d+6}" fill="none" stroke="${active?'#cf7a41':'#bd4940'}" stroke-width="2" stroke-dasharray="5 3" pointer-events="none"/>`:''}</g>`;
  }
  for(const r of doc.rooms){const area=roomArea(r)*unit*unit/1e6,p=roomInteriorPoint(r);
    html+=`<text x="${p.x}" y="${p.z}" text-anchor="middle" font-size="${font}" font-weight="600" fill="#3e5d57" stroke="white" stroke-width="3" paint-order="stroke">${esc(r.name)}<tspan x="${p.x}" dy="${font*1.3}" font-size="${font*.75}" font-weight="400">${doc.calibrated?area.toFixed(1)+' m²':'区域未标定'}</tspan></text>`;
  }
  for(const m of doc.measurements){html+=`<g data-kind="measurement" data-id="${esc(m.id)}"><line x1="${m.x1}" y1="${m.z1}" x2="${m.x2}" y2="${m.z2}" stroke="transparent" stroke-width="14"/><line x1="${m.x1}" y1="${m.z1}" x2="${m.x2}" y2="${m.z2}" stroke="#c27542" stroke-width="2" stroke-dasharray="5 3"/><circle cx="${m.x1}" cy="${m.z1}" r="3" fill="#c27542"/><circle cx="${m.x2}" cy="${m.z2}" r="3" fill="#c27542"/><text x="${(m.x1+m.x2)/2}" y="${(m.z1+m.z2)/2-6}" text-anchor="middle" font-size="${font*.85}" fill="#ac673a" stroke="white" stroke-width="3" paint-order="stroke">${formatLength(Math.hypot(m.x2-m.x1,m.z2-m.z1))}</text></g>`;}
  }
  if(points.length){const a=points[0],c=points[1]||hover||a;html+=`<circle cx="${a.x}" cy="${a.z}" r="4" fill="#cb7c43"/><circle cx="${c.x}" cy="${c.z}" r="4" fill="#cb7c43"/><line x1="${a.x}" y1="${a.z}" x2="${c.x}" y2="${c.z}" stroke="#cb7c43" stroke-width="2" stroke-dasharray="5 3"/><text x="${(a.x+c.x)/2}" y="${(a.z+c.z)/2-10}" font-size="${font}" fill="#ac673a" stroke="white" stroke-width="3" paint-order="stroke">${tool==='calibrate'?'标定参考线':formatLength(distance(a,c))}</text>`;}
  svg.innerHTML=html;
}
function renderProperties(){
  const item=selected(),kind=selection?.kind;
  const items=selectedFurniture();if(items.length>1){renderMultiProperties(items);return;}
  if(!item){$('properties').innerHTML='<h3>从家具库开始</h3><p class="tip" style="padding:0">点击一件家具，再点击平面图放置。选中对象后可在这里修改尺寸、旋转和材质。</p>';return;}
  const field=(label,id,value,min=10,max=10000)=>`<label>${label}<input id="prop-${id}" type="number" value="${value}" min="${min}" max="${max}" step="any" required></label>`;
  let html=`<form id="property-form"><h3>${kind==='furniture'?esc(item.name):kind==='wall'?'墙线':kind==='room'?'房间区域':kind==='opening'?(item.type==='door'?'门':'窗'):'距离标注'}</h3>`;
  if(kind==='furniture'){
    html+=`<label>名称<input id="prop-name" value="${esc(item.name)}" maxlength="40"></label><div class="field-grid">${field('宽度 / mm','width',item.width)}${field('深度 / mm','depth',item.depth)}${field('高度 / mm','height',item.height)}${field('旋转 / °','rotation',item.rotation,-360,360)}${field('离地高度 / mm','elevation',item.elevation??0,0,10000)}</div><label>颜色<input id="prop-color" type="color" value="${item.color}"></label><label class="check"><input id="prop-locked" type="checkbox" ${item.locked?'checked':''}>锁定位置与尺寸</label><p class="tip" style="padding:0">Shift 点击其他家具可多选并组合。</p>`;
  } else if(kind==='wall')html+=`<div class="field-grid">${field('厚度 / mm','thickness',Number((item.thickness*doc.mmPerPixel).toFixed(2)),20,1000)}${field('高度 / mm','height',item.height??3000,100,10000)}${field('长度 / mm','length',Number((wallLength(item)*doc.mmPerPixel).toFixed(2)),100,100000)}${['x1','z1','x2','z2'].map((k,i)=>field(['起点 X / mm','起点 Y / mm','终点 X / mm','终点 Y / mm'][i],k,Number((item[k]*doc.mmPerPixel).toFixed(2)),-100000000,100000000)).join('')}</div><label class="check"><input id="prop-bearing" type="checkbox" ${item.bearing?'checked':''}>标记为承重墙（人工标记）</label><p class="tip" style="padding:0">修改端点会带动共用该端点的墙。修改长度时按端点方向调整终点；门窗随墙移动。标记不代表结构鉴定。</p>`;
  else if(kind==='opening')html+=`<div class="field-grid">${field('距墙起点 / mm','offset',item.offset,0,100000000)}${field('宽度 / mm','width',item.width,100,100000)}${field('高度 / mm','height',item.height,100,10000)}${item.type==='window'?field('窗台高 / mm','sillHeight',item.sillHeight,0,10000):''}${field('开启角度 / °','openAngle',item.openAngle??(item.type==='door'?90:0),0,90)}</div><label>铰链位置<select id="prop-hinge"><option value="start" ${item.hinge!=='end'?'selected':''}>墙起点侧</option><option value="end" ${item.hinge==='end'?'selected':''}>墙终点侧</option></select></label><label>开启侧（沿墙起点走向终点）<select id="prop-swing"><option value="1" ${(item.swing??1)===1?'selected':''}>右侧</option><option value="-1" ${item.swing===-1?'selected':''}>左侧</option></select></label><p class="tip" style="padding:0">位置按洞口中心计算；二维拖动可沿墙移动。角度 0° 表示关闭；窗按单扇平开示意。</p>`;
  else if(kind==='room')html+=`<label>区域名称<input id="prop-name" value="${esc(item.name)}" maxlength="40"></label><label>地面<select id="prop-material"><option value="wood" ${item.material==='wood'?'selected':''}>木地板</option><option value="tile" ${item.material==='tile'?'selected':''}>地砖</option><option value="plain" ${item.material==='plain'?'selected':''}>素色</option></select></label><p>${doc.calibrated?(roomArea(item)*doc.mmPerPixel**2/1e6).toFixed(2)+' m²':'标定后显示区域面积'}</p><p class="tip" style="padding:0">${item.source==='walls'?'按墙中心线围合计算，非净使用面积。轮廓随墙更新，请移动墙体调整房间。':'手工区域面积。'}</p>`;
  else html+=`<p>${formatLength(Math.hypot(item.x2-item.x1,item.z2-item.z1))}</p>`;
  if(kind==='wall'){
    for(const [side,label] of [['left','左侧'],['right','右侧']]){const f=wallFinish(item,side);html+=`<fieldset><legend>${label}墙面 · 沿起点走向终点</legend><label>材质<select id="prop-${side}-material">${FINISHES.map(([k,n])=>`<option value="${k}" ${f.material===k?'selected':''}>${n}</option>`).join('')}</select></label><label>颜色<input id="prop-${side}-color" type="color" value="${f.color}"></label></fieldset>`;}
    const s=skirting(item);html+=`<fieldset><legend>两侧踢脚线</legend><label class="check"><input id="prop-skirting-enabled" type="checkbox" ${s.enabled?'checked':''}>显示踢脚线</label>${field('踢脚线高度 / mm','skirting-height',s.height,20,300)}<label>颜色<input id="prop-skirting-color" type="color" value="${s.color}"></label></fieldset>`;
  }
  if(kind==='room'){const c=ceiling(item);html+=`${field('地面铺贴方向 / °','floorAngle',item.floorAngle??0,0,360)}<fieldset><legend>平顶天花</legend><label class="check"><input id="prop-ceiling-enabled" type="checkbox" ${c.enabled?'checked':''}>显示天花</label>${field('天花降高 / mm','ceiling-drop',c.drop,0,1000)}<label>颜色<input id="prop-ceiling-color" type="color" value="${c.color}"></label><p class="tip">室内视角且使用实际高度时显示。降高从房间最低墙顶计算，手工区域按 3000 mm 墙高。</p></fieldset>`;}
  if(kind==='furniture'&&item.type==='model')html+='<p class="tip">GLB 保留原模型材质；颜色仅用于二维占位符。宽深高可分别缩放，原始比例需自行保留。</p>';
  html+='<div class="property-actions">';if(kind!=='measurement')html+='<button class="primary" type="submit">应用修改</button>';
  if(kind==='furniture')html+='<button id="rotate" type="button">旋转 90°</button><button id="duplicate" type="button">复制</button>';
  html+='<button id="delete" class="danger" type="button">删除</button></div></form>';
  $('properties').innerHTML=html;
  $('property-form').addEventListener('submit',e=>{
    e.preventDefault();const before=clone(doc);
    if(kind==='furniture'){
      if(item.locked && $('prop-locked').checked){message('请先取消锁定再修改家具。',true);return;}
      const values=Object.fromEntries(['width','depth','height','rotation','elevation'].map(k=>[k,Number($(`prop-${k}`).value)]));
      if(!['width','depth','height'].every(k=>Number.isFinite(values[k])&&values[k]>=10&&values[k]<=10000)||!Number.isFinite(values.rotation)){message('请输入有效的家具尺寸。',true);return;}
      Object.assign(item,values,{rotation:normalizeAngle(values.rotation),name:$('prop-name').value||item.name,color:$('prop-color').value,locked:$('prop-locked').checked});
    }else if(kind==='wall'){
      const ends=Object.fromEntries(['x1','z1','x2','z2'].map(k=>[k,Number($(`prop-${k}`).value)/doc.mmPerPixel]));
      const length=Number($('prop-length').value);if(Math.abs(length-wallLength(item)*doc.mmPerPixel)>.01){const angle=Math.atan2(ends.z2-ends.z1,ends.x2-ends.x1);ends.x2=ends.x1+Math.cos(angle)*length/doc.mmPerPixel;ends.z2=ends.z1+Math.sin(angle)*length/doc.mmPerPixel;}
      moveWallEndpoints(doc,item.id,ends);item.thickness=Number($('prop-thickness').value)/doc.mmPerPixel;item.height=Number($('prop-height').value);item.bearing=$('prop-bearing').checked;
      for(const side of ['left','right'])item[side+'Finish']={material:$(`prop-${side}-material`).value,color:$(`prop-${side}-color`).value};
      item.skirting={enabled:$('prop-skirting-enabled').checked,height:Number($('prop-skirting-height').value),color:$('prop-skirting-color').value};
    }else if(kind==='opening'){
      Object.assign(item,Object.fromEntries(['offset','width','height','openAngle'].map(k=>[k,Number($(`prop-${k}`).value)])),{sillHeight:item.type==='window'?Number($('prop-sillHeight').value):0,hinge:$('prop-hinge').value,swing:Number($('prop-swing').value)});
    }else if(kind==='room'){item.name=$('prop-name').value||'房间';item.material=$('prop-material').value;item.floorAngle=Number($('prop-floorAngle').value);item.ceiling={enabled:$('prop-ceiling-enabled').checked,drop:Number($('prop-ceiling-drop').value),color:$('prop-ceiling-color').value};}
    if(commit(before))message('对象已更新，二维和三维已同步。');
  });
  $('delete').onclick=removeSelected;if($('rotate'))$('rotate').onclick=rotateSelected;if($('duplicate'))$('duplicate').onclick=duplicateSelected;
}
function render(refit=false){
  if(selection&&!selected())selection=null;
  if(selection?.kind==='furniture'){const ids=selectedFurniture().map(f=>f.id);selection=ids.length?{kind:'furniture',id:ids.includes(selection.id)?selection.id:ids[0],ids}:null;}
  $('project-title').value=doc.title;renderScale();
  $('counts').textContent=`${doc.plan.walls.length} 段墙 · ${doc.openings.length} 个门窗 · ${doc.furniture.length} 件家具 · ${doc.rooms.length} 个区域`;
  $('auto-rooms').checked=doc.autoRooms;
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
  renderCatalog();renderIssues();if(refit||!view)fitPlan();else renderPlan();renderProperties();three?.update(doc,selection,refit);
}
function ensureScale(){if(doc.image&&!doc.calibrated){setTool('calibrate');return false;}return true;}
function addFurniture(type,p){if(!ensureScale())return;const asset=type?.startsWith('model:')?doc.models.find(m=>m.id===type.slice(6)):null;if(type?.startsWith('model:')&&!asset){message('该模型已不在当前方案中，请重新选择。',true);return;}const before=clone(doc),item=asset?{id:uid(),type:'model',modelId:asset.id,name:asset.name,width:asset.width,depth:asset.depth,height:asset.height,color:'#9caeba',x:p.x,z:p.z,rotation:0,elevation:0,locked:false}:newFurniture(type,p.x,p.z);Object.assign(item,snapFurniture(item,doc,$('snap-grid').checked,$('snap-wall').checked));doc.furniture.push(item);selection={kind:'furniture',id:item.id};setTool('select');if(commit(before))message(`已放置${item.name}，可拖动或修改尺寸。`);}
function addOpening(type,p){
  if(!ensureScale())return;
  const hit=nearestWall(p,doc.plan.walls,180/doc.mmPerPixel);if(!hit){message('请点击墙线附近放置门窗。',true);return;}
  let item;try{item=newOpening(type,hit.wall,hit.t*wallLength(hit.wall)*doc.mmPerPixel,doc.mmPerPixel);}catch(error){message(error.message,true);return;}
  const error=openingError(item,doc);if(error){message(error,true);return;}
  const before=clone(doc);doc.openings.push(item);selection={kind:'opening',id:item.id};setTool('select');if(commit(before))message('门窗已放置，可拖动或修改尺寸；三维墙体已开洞。');
}
function rotateSelected(){const ids=selectedFurniture().map(f=>f.id);if(ids.length)edit(()=>rotateFurniture(doc,ids,90));}
function duplicateSelected(){const ids=selectedFurniture().map(f=>f.id);if(!ids.length||!ensureScale())return;edit(()=>{const copies=copyFurniture(doc,ids,uid);selection={kind:'furniture',id:copies[0],ids:copies};},'已复制所选家具，组合关系保留。');}
function removeSelected(){
  const item=selected();if(!item)return;
  if(selection.kind==='furniture'){const items=selectedFurniture();edit(()=>{if(items.some(f=>f.locked))throw new Error('所选家具中有锁定对象，请先解锁。');const ids=new Set(items.map(f=>f.id));doc.furniture=doc.furniture.filter(f=>!ids.has(f.id));selection=null;});return;}
  if(selection.kind==='room'&&item.source==='walls'&&doc.autoRooms){message('自动房间随墙生成；请先关闭「房间随墙更新」再删除。',true);return;}
  const before=clone(doc),array=selection.kind==='wall'?doc.plan.walls:selection.kind==='room'?doc.rooms:selection.kind==='opening'?doc.openings:doc.measurements;
  if(selection.kind==='wall'){doc.openings=doc.openings.filter(o=>o.wallId!==item.id);if(!doc.autoRooms)doc.rooms=doc.rooms.filter(r=>r.source!=='walls'||!r.wallIds.includes(item.id));}
  array.splice(array.indexOf(item),1);selection=null;commit(before);
}
function undo(){const next=history.undo(doc);if(next){doc=next;selection=null;render(true);save();message('已撤销上一步。');}}
function redo(){const next=history.redo(doc);if(next){doc=next;selection=null;render(true);save();message('已重做。');}}
function point(event){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());return {x:q.x,z:q.y};}
function aligned(p,event){
  p=snapPoint(p,doc.mmPerPixel,$('snap-grid').checked&&tool!=='calibrate');
  if(tool==='wall'){
    if(points.length){const a=points[0];if(!event.shiftKey){if(Math.abs(p.x-a.x)>Math.abs(p.z-a.z))p.z=a.z;else p.x=a.x;}
      const exact=Number($('wall-length').value);if(exact>0&&Number.isFinite(exact)){const angle=Math.atan2(p.z-a.z,p.x-a.x);return {x:a.x+Math.cos(angle)*exact/doc.mmPerPixel,z:a.z+Math.sin(angle)*exact/doc.mmPerPixel};}
    }
    if($('snap-endpoints').checked)p=snapWallPoint(p,doc.plan.walls,120/doc.mmPerPixel);
  }
  return p;
}
svg.addEventListener('contextmenu',e=>e.preventDefault());
svg.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==2&&e.button!==1)return;e.preventDefault();svg.focus();let p=point(e);
  if(e.button===2||e.button===1){gesture={kind:'pan',start:{x:e.clientX,z:e.clientY},view:{...view},matrix:svg.getScreenCTM().inverse()};svg.setPointerCapture(e.pointerId);return;}
  if(tool==='place'){addFurniture(placing,p);return;}
  if(tool==='door'||tool==='window'){addOpening(tool,p);return;}
  if(tool==='split'){
    const hit=nearestWall(p,doc.plan.walls,180/doc.mmPerPixel);if(!hit){message('请点击要分割的墙线。',true);return;}
    edit(()=>{splitWall(doc,hit.wall.id,p,uid());selection={kind:'wall',id:hit.wall.id};},'墙体已分割，门窗位置保持不变。');return;
  }
  if(tool==='connect'){
    const hit=nearestEndpoint(p,doc.plan.walls,180/doc.mmPerPixel);if(!hit){message('请点击墙端点圆圈。',true);return;}
    if(!connectTarget){connectTarget=hit;points=[{x:hit.x,z:hit.z}];hover=null;message('再点击另一段墙的目标端点；第一个端点及与其相连的墙会移动到这里。');renderPlan();return;}
    const from=connectTarget;edit(()=>{connectEndpoints(doc,from,hit);selection={kind:'wall',id:from.wallId};},'端点已连接，关联墙体与门窗已同步。');connectTarget=null;points=[];hover=null;renderPlan();return;
  }
  if(tool!=='select'){
    if(tool==='wall'&&!$('wall-length').checkValidity()){message('定长请输入 100–100000 mm，或留空自由绘制。',true);return;}
    p=aligned(p,e);points.push(p);
    if(points.length===2){const [a,b]=points;
      if(distance(a,b)<2){points=[a];return;}
      if(tool==='calibrate'){openCalibration();return;}
      const before=clone(doc),id=uid();
      if(tool==='wall'){doc.plan.walls.push({id,x1:a.x,z1:a.z,x2:b.x,z2:b.z,thickness:200/doc.mmPerPixel,height:3000});selection={kind:'wall',id};}
      if(tool==='room'){
        if(Math.abs(a.x-b.x)<10||Math.abs(a.z-b.z)<10){points=[];message('区域过小，请重新选择两个对角。',true);renderPlan();return;}
        doc.rooms.push({id,name:'新房间',x:Math.min(a.x,b.x),z:Math.min(a.z,b.z),width:Math.abs(a.x-b.x),depth:Math.abs(a.z-b.z),material:'wood'});selection={kind:'room',id};
      }
      if(tool==='measure'){doc.measurements.push({id,x1:a.x,z1:a.z,x2:b.x,z2:b.z});selection={kind:'measurement',id};}
      if(tool==='wall'&&$('continuous-walls').checked){points=[b];hover=null;if(commit(before))message('墙已绘制，继续点击下一段终点；Esc 结束。');else{points=[];renderPlan();}}
      else{setTool('select');commit(before);}
    }else renderPlan();return;
  }
  const target=e.target.closest('[data-kind]');selectObject(target?.dataset.kind,target?.dataset.id,e.shiftKey,true);
  const item=selected();
  const items=selectedFurniture();
  if(item&&!item.locked&&!e.shiftKey&&!items.some(f=>f.locked)&&!(selection.kind==='room'&&item.source==='walls')){gesture={kind:'object',start:p,before:clone(doc),original:clone(item),furniture:clone(items),moved:false};svg.setPointerCapture(e.pointerId);}
  render();
});
svg.addEventListener('pointermove',e=>{
  if(gesture?.kind==='pan'){
    const dx=e.clientX-gesture.start.x,dz=e.clientY-gesture.start.z,m=gesture.matrix;
    view={...gesture.view,x:gesture.view.x-(dx*m.a+dz*m.c),y:gesture.view.y-(dx*m.b+dz*m.d)};renderPlan();return;
  }
  let p=point(e);
  if(gesture?.kind==='object'){
    const item=selected(),o=gesture.original;if(!item)return;const dx=p.x-gesture.start.x,dz=p.z-gesture.start.z;
    if(Math.hypot(dx,dz)<1&&!gesture.moved)return;gesture.moved=true;
    if(selection.kind==='furniture'){
      const next=snapFurniture({...item,x:o.x+dx,z:o.z+dz},doc,$('snap-grid').checked,$('snap-wall').checked),tx=next.x-o.x,tz=next.z-o.z;
      for(const original of gesture.furniture){const member=doc.furniture.find(f=>f.id===original.id);member.x=original.x+tx;member.z=original.z+tz;}
    }
    else if(selection.kind==='opening'){
      const wall=doc.plan.walls.find(w=>w.id===item.wallId),hit=nearestWall(p,[wall]);
      const next={...item,offset:hit.t*wallLength(wall)*doc.mmPerPixel};if(!openingError(next,doc))Object.assign(item,next);
    }
    else if(selection.kind==='room'){const next=snapPoint({x:o.x+dx,z:o.z+dz},doc.mmPerPixel,$('snap-grid').checked);Object.assign(item,next);if(o.polygon)item.polygon=o.polygon.map(v=>({x:v.x+next.x-o.x,z:v.z+next.z-o.z}));}
    else{let a=snapPoint({x:o.x1+dx,z:o.z1+dz},doc.mmPerPixel,$('snap-grid').checked);if(selection.kind==='wall'&&$('snap-endpoints').checked)a=snapWallPoint(a,doc.plan.walls.filter(w=>w.id!==item.id),120/doc.mmPerPixel);const next={x1:a.x,z1:a.z,x2:o.x2+a.x-o.x1,z2:o.z2+a.z-o.z1};if(selection.kind==='wall')moveWallEndpoints(doc,item.id,next);else Object.assign(item,next);}
    renderPlan();return;
  }
  if(points.length===1){hover=tool==='connect'?(nearestEndpoint(p,doc.plan.walls,180/doc.mmPerPixel)||p):aligned(p,e);renderPlan();}
});
svg.addEventListener('pointerup',e=>{if(!gesture)return;const g=gesture;gesture=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(g.kind==='object'&&g.moved)commit(g.before);});
svg.addEventListener('pointercancel',()=>{if(gesture?.before){doc=gesture.before;render();}gesture=null;});
svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.12:.89,point(e));},{passive:false});
function zoom(factor,anchor={x:view.x+view.width/2,z:view.y+view.height/2}){const w=view.width*factor;if(w<80||w>30000)return;view={x:anchor.x-(anchor.x-view.x)*factor,y:anchor.z-(anchor.z-view.y)*factor,width:w,height:view.height*factor};renderPlan();}
svg.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
svg.addEventListener('drop',e=>{e.preventDefault();const type=e.dataTransfer.getData('application/x-floorplan-furniture');if(catalogEntries().some(f=>f.key===type))addFurniture(type,point(e));});
$('catalog-items').addEventListener('click',e=>{const card=e.target.closest('[data-type]');if(card)setTool('place',card.dataset.type);});
$('catalog-items').addEventListener('dragstart',e=>{const card=e.target.closest('[data-type]');if(card){e.dataTransfer.setData('application/x-floorplan-furniture',card.dataset.type);e.dataTransfer.effectAllowed='copy';if(mode==='3d')setMode('2d');}});
$('category').onchange=renderCatalog;
$('catalog-search').oninput=renderCatalog;
$('prune-models').onclick=()=>edit(()=>{doc.models=doc.models.filter(m=>doc.furniture.some(f=>f.modelId===m.id));if(placing?.startsWith('model:'))setTool('select');},'已清理未使用模型，可撤销恢复。');
const readDataURL=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('文件读取失败。'));reader.readAsDataURL(file);});
$('model-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;e.target.disabled=true;const start=doc;message('正在读取 GLB 模型…');
  try{
    if(!three)throw new Error('GLB 导入需要可用的三维视图。');
    if(!/\.glb$/i.test(file.name)||file.size>MODEL_LIMIT)throw new Error('请选择不超过 4 MB 的 GLB 文件。');
    inspectGLB(await file.arrayBuffer());const data=await readDataURL(file),asset={id:uid(),name:file.name.replace(/\.glb$/i,'').slice(0,40)||'导入模型',data:'data:model/gltf-binary;base64,'+data.split(',')[1],width:1000,depth:1000,height:1000};
    validateDocument({...start,models:[...(start.models||[]),asset]});
    const loaded=await three.models.load(asset);Object.assign(asset,loaded.dimensions);
    if(doc!==start)throw new Error('读取期间方案已变化，请重新导入模型。');
    const before=clone(doc);doc.models.push(asset);
    if(commit(before)){$('category').value='导入模型';$('catalog-search').value='';setTool('place',`model:${asset.id}`);message(`模型「${asset.name}」已导入，尺寸 ${asset.width} × ${asset.depth} × ${asset.height} mm；请核对尺寸后放置。`);}
  }catch(error){three?.models.retain(doc.models||[]);message(`模型导入失败：${error.message}`,true);}finally{e.target.disabled=false;e.target.value='';}
};
$('check-layout').onchange=()=>render();
$('layout-issues').onclick=e=>{const button=e.target.closest('[data-issue]');if(!button)return;const issue=warnings.issues[Number(button.dataset.issue)],ids=doc.furniture.filter(f=>issue.ids.includes(f.id)).map(f=>f.id);if(!ids.length)return;selection={kind:'furniture',id:ids[0],ids};setTool('select');setMode('2d');render(true);message(issue.label+'；提示基于外接尺寸，请结合实际模型判断。');};
$('recognize-rooms').onclick=()=>{
  const before=clone(doc);
  try{const count=refreshRooms(doc,uid);if(!count){doc=before;message('未找到闭合房间，请先连接墙体端点；识别不会自动跨越缺口。',true);return;}doc.autoRooms=true;if(commit(before))message(`已识别 ${count} 个闭合房间，后续随墙更新；手工区域保留，可单独删除。`);}
  catch(error){doc=before;message(error.message,true);}
};
$('auto-rooms').onchange=e=>{const before=clone(doc);doc.autoRooms=e.target.checked;commit(before);};
$('backup-cache').onclick=()=>{if(originalCache)download(originalCache,'原缓存备份.json','application/json');restoreError='';$('backup-cache').hidden=true;save();message('已发起原缓存备份下载，自动保存已恢复。');};
$('new-project').onclick=()=>{const before=clone(doc);doc=emptyDocument();doc.calibrated=true;selection=null;setMode('2d');setTool('wall');if(commit(before,true))message('新建空白户型：尺寸按毫米绘制，可连续画墙；Esc 结束。可撤销返回原方案。');};
document.querySelectorAll('button[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
for(const id of ['show-image','show-dimensions'])$(id).onchange=renderPlan;
$('fit-plan').onclick=fitPlan;$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);
$('undo').onclick=undo;$('redo').onclick=redo;
$('iso').onclick=()=>three?.fit('iso');$('top').onclick=()=>three?.fit('top');
$('interior').onclick=()=>{if(three){three.interior(selection?.kind==='room'?selected():null);message('已进入室内视角：WASD / 方向键前后左右行走，拖动环视，Shift 加速；也可长按画面下方方向按钮。');}};
$('lighting').onchange=e=>three?.setLighting(e.target.value);
$('quality').onchange=e=>{if(three){three.quality=e.target.checked;three.dirty=true;}};
$('low').onclick=()=>{if(three){three.low=!three.low;$('low').setAttribute('aria-pressed',three.low);$('low').textContent=three.low?'布置预览':'实际高度';$('scene-note').textContent=three.low?'墙体与高柜已降低显示高度，便于查看布置；实际尺寸不变。':'按设置的墙高和家具尺寸显示；可切换布置预览查看室内。';three.update(doc,selection,true);}};
$('project-title').onchange=()=>{const before=clone(doc);doc.title=$('project-title').value.trim()||'未命名方案';commit(before);};
$('review-scale').onclick=()=>setTool('calibrate');
$('real-distance').oninput=previewCalibration;$('distance-unit').onchange=previewCalibration;
$('calibration-form').onsubmit=e=>{
  e.preventDefault();
  try{
    const next=createCalibration(points[0],points[1],Number($('real-distance').value),$('distance-unit').value),before=clone(doc);
    doc.mmPerPixel=next.mmPerPixel;doc.calibrationReference=next.reference;doc.calibrated=true;
    if(commit(before,true)){$('calibration-dialog').close();setTool('select');fitPlan();message(`已按参考线 ${meters(next.reference.millimeters)} m 校正比例；家具实际尺寸不变，请核对摆放位置。`);}
    else $('calibration-preview').textContent=$('status').textContent;
  }catch(error){$('calibration-preview').textContent=error.message;}
};
$('cancel-calibration').onclick=()=>{$('calibration-dialog').close();setTool('select');};
$('calibration-dialog').addEventListener('cancel',()=>setTool('select'));
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented)return;
  if(e.target.matches('input,textarea,select')||e.target.isContentEditable||$('calibration-dialog').open)return;
  if(e.key==='Escape'){if(gesture?.before)doc=gesture.before;gesture=null;setTool('select');render();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
  if(e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.metaKey)rotateSelected();
  const items=selectedFurniture();if(items.length&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();const step=(e.shiftKey?100:10)/doc.mmPerPixel;edit(()=>translateFurniture(doc,items.map(f=>f.id),e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0));
  }
});
function download(data,name,type){const url=typeof data==='string'&&data.startsWith('data:')?data:URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();if(url.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(url),1000);}
const filename=()=>doc.title.replace(/[<>:"/\\|?*]/g,'_');
$('export').onclick=()=>{download(JSON.stringify(doc),`${filename()}.json`,'application/json');message('方案已导出，包含户型、家具、模型、硬装设置和底图。');};
$('export-image').onclick=()=>{if(three){download(three.screenshot(),`${filename()}-3D.png`,'image/png');message('三维效果图已保存。');}};
$('demo').onclick=()=>{const before=clone(doc);doc=demoDocument();selection=null;setTool('select');if(commit(before,true))message('已加载可编辑示例。示例家具为人工摆放，可撤销返回原方案。');};
$('project-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  const start=doc;e.target.disabled=true;
  try{if(file.size>15*1024*1024)throw new Error('方案文件过大，最大支持 15 MB。');const next=validateDocument(JSON.parse(await file.text()));if(next.models.length){if(!three)throw new Error('含 GLB 的方案需要可用的三维视图。');for(const asset of next.models)await three.models.load(asset);}if(doc!==start)throw new Error('读取期间方案已变化，请重新导入。');const before=clone(doc);doc=next;selection=null;setTool('select');if(commit(before,true))message('方案已导入，可以继续编辑。');}catch(error){three?.models.retain(doc.models||[]);message(`导入失败：${error.message}`,true);}finally{e.target.value='';e.target.disabled=false;}
};
async function previewImage(file){const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.88);}finally{URL.revokeObjectURL(url);}}
$('image-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;e.target.disabled=true;message('正在识别户型墙线…');
  try{
    const body=new FormData();body.append('file',file);const response=await fetch('http://localhost:5000/upload',{method:'POST',body});const plan=await response.json();if(!response.ok)throw new Error(plan.error||'识别失败');
    const image=await previewImage(file),before=clone(doc),next=emptyDocument();next.title=file.name.replace(/\.[^.]+$/,'');next.plan=plan;next.image=image;
    doc=next;selection=null;setTool('select');setMode('2d');if(commit(before,true)){setTool('calibrate');message(`已识别 ${plan.walls.length} 段墙线。请在完整原图上点击一段尺寸标注的两个端点，输入真实长度后再放家具。`);}
  }catch(error){message(`上传失败：${error.message}`,true);}finally{e.target.disabled=false;e.target.value='';}
};
renderCatalog();render(true);setMode('2d');$('backup-cache').hidden=!restoreError;message(restoreError||(restored?'已恢复此浏览器中保存的方案。':'这是可编辑的家装示例。可直接摆放家具，或上传你自己的户型图。'),!!restoreError);

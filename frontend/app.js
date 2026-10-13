import {CATALOG,clone,uid,emptyDocument,newFurniture,newOpening,distance,snapPoint,snapFurniture,calibration,History,normalizeAngle,validateDocument,demoDocument} from './core.mjs';
import {furnitureSymbol} from './furniture.mjs';
import {View3D} from './view3d.mjs';
import {documentBounds,wallLength,nearestWall,snapWallPoint,openingError,roomPolygon,roomArea,roomInteriorPoint,moveWallEndpoints,refreshRooms} from './plan.mjs';

const $=id=>document.getElementById(id), svg=$('plan'), history=new History();
const STORE='floorplan-designer-v1';
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let doc=demoDocument(), selection=null, tool='select', placing=null, points=[],hover=null,gesture=null,view=null,mode='2d',three=null;
let restored=false;
let restoreError='',originalCache='';
try {originalCache=localStorage.getItem(STORE);if(originalCache){doc=validateDocument(JSON.parse(originalCache));restored=true;}}catch(error){restoreError='原有缓存无法恢复，自动保存已暂停；请点击「备份原缓存」保留原文件后继续。';console.warn('Local plan unavailable:',error.message);}
function message(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
try{three=new View3D($('viewport'),(kind,id)=>{selection={kind,id};render();});}catch(error){$('viewport').textContent='三维视图暂不可用，请检查 Three.js 网络加载及 WebGL 支持。';console.error(error);}

function save(){
  if(restoreError){$('save-state').textContent='自动保存暂停：请先备份原缓存';return;}
  try{localStorage.setItem(STORE,JSON.stringify(doc));$('save-state').textContent='已保存到此浏览器';}
  catch(error){$('save-state').textContent='自动保存失败，请导出方案备份';}
}
function commit(before,refit=false){
  try{if(doc.autoRooms)refreshRooms(doc,uid);doc=validateDocument(doc);}
  catch(error){doc=before;render();message(`修改未保存：${error.message}`,true);return false;}
  history.push(before,doc);render(refit);save();return true;
}
function selected(){
  if(!selection)return null;
  return (selection.kind==='furniture'?doc.furniture:selection.kind==='wall'?doc.plan.walls:selection.kind==='room'?doc.rooms:selection.kind==='opening'?doc.openings:doc.measurements).find(v=>v.id===selection.id);
}
function setMode(value){three?.walk?.stop();mode=value;$('workspace').dataset.mode=value;document.querySelectorAll('[data-mode]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',b.dataset.mode===value);});requestAnimationFrame(()=>three?.resize());}
function setTool(value,type=null){
  tool=value;placing=type;points=[];hover=null;svg.dataset.tool=value;
  document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===value));
  const hints={select:'选择并拖动对象；R 旋转，Delete 删除。',wall:'依次点击墙线的起点和终点；按住 Shift 可画斜墙。',room:'点击房间区域的两个对角；这是手工区域，不会自动识别房间。',measure:'点击两个点，记录它们之间的距离。',calibrate:'在原图上点击一段已知尺寸的两个端点，再输入实际毫米数。',place:`点击平面图放置${CATALOG.find(i=>i.type===type)?.name||'家具'}，或按 Esc 取消。`};
  hints.door='点击墙体放置门；选中后可拖动或调整洞口尺寸。';hints.window='点击墙体放置窗；选中后可设置窗台高度。';
  $('wall-options').hidden=value!=='wall';
  message(hints[value]);if(value!=='select'&&mode==='3d')setMode('2d');renderCatalog();renderPlan();
}
function fitPlan(){const b=documentBounds(doc),pad=Math.max(b.width,b.height)*.10;view={x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad};renderPlan();}
function formatLength(pixels){return `${doc.calibrated?'':'≈'}${Math.round(pixels*doc.mmPerPixel).toLocaleString()} mm`;}
function renderCatalog(){
  const category=$('category').value,items=CATALOG.filter(f=>category==='全部家具'||f.category===category);
  $('catalog-count').textContent=`${CATALOG.length} items`;
  $('catalog-items').innerHTML=items.map(f=>`<button class="furniture-card ${placing===f.type?'active':''}" data-type="${f.type}" draggable="true" title="放置${f.name}"><svg viewBox="0 0 110 110" aria-hidden="true"><g transform="translate(5 5)">${furnitureSymbol(f.type,f.color)}</g></svg><b>${f.name}</b><small>${f.width} × ${f.depth}</small></button>`).join('');
}
function renderPlan(){
  if(!view)return;
  svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
  const b=doc.plan.bounds,unit=doc.mmPerPixel,step=500/unit,font=Math.max(9,Math.min(17,view.width/60));
  let html=`<defs><pattern id="grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M${step} 0H0V${step}" fill="none" stroke="#dce6e1" stroke-width=".6"/></pattern><pattern id="wood" width="60" height="12" patternUnits="userSpaceOnUse"><rect width="60" height="12" fill="#e6d9c3"/><path d="M0 0H60M30 0V12" stroke="#d4c4ab" stroke-width=".5"/></pattern><pattern id="tile" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#e5edeb"/><path d="M0 0H22V22" fill="none" stroke="#c8d8d3" stroke-width=".6"/></pattern></defs>`;
  html+=`<rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="url(#grid)"/>`;
  for(const r of doc.rooms){
    const active=selection?.id===r.id;
    html+=`<polygon data-kind="room" data-id="${esc(r.id)}" points="${roomPolygon(r).map(p=>`${p.x},${p.z}`).join(' ')}" fill="${r.material==='plain'?'#eef1e9':`url(#${r.material})`}" stroke="${active?'#c6783f':'#d5dfd9'}" stroke-width="${active?3:1}"/>`;
  }
  if(doc.image&&$('show-image').checked)html+=`<image href="${doc.image}" width="${doc.plan.image_size.width}" height="${doc.plan.image_size.height}" opacity=".30" pointer-events="none"/>`;
  for(const w of doc.plan.walls){
    const active=selection?.id===w.id;
    html+=`<g data-kind="wall" data-id="${esc(w.id)}"><line x1="${w.x1}" y1="${w.z1}" x2="${w.x2}" y2="${w.z2}" stroke="transparent" stroke-width="${Math.max(w.thickness,14)}"/><line x1="${w.x1}" y1="${w.z1}" x2="${w.x2}" y2="${w.z2}" stroke="${active?'#c4844e':'#465d59'}" stroke-width="${w.thickness}" stroke-linecap="square"/></g>`;
    const length=Math.hypot(w.x2-w.x1,w.z2-w.z1);
    if($('show-dimensions').checked&&length*unit>=1100){const angle=Math.atan2(w.z2-w.z1,w.x2-w.x1)*180/Math.PI;
      html+=`<text x="0" y="${-w.thickness/2-5}" transform="translate(${(w.x1+w.x2)/2} ${(w.z1+w.z2)/2}) rotate(${angle>90?angle-180:angle})" text-anchor="middle" font-size="${font*.64}" fill="#6c7e78" stroke="#fafcfb" stroke-width="2.3" paint-order="stroke">${doc.calibrated?'':'≈'}${Math.round(length*unit)}</text>`;
    }
  }
  for(const o of doc.openings){
    const w=doc.plan.walls.find(w=>w.id===o.wallId);if(!w)continue;
    const length=wallLength(w),t=o.offset/(length*unit),width=o.width/unit,x=w.x1+(w.x2-w.x1)*t,z=w.z1+(w.z2-w.z1)*t,angle=Math.atan2(w.z2-w.z1,w.x2-w.x1)*180/Math.PI,color=selection?.id===o.id?'#c6783f':'#397b88';
    html+=`<g data-kind="opening" data-id="${esc(o.id)}" transform="translate(${x} ${z}) rotate(${angle})"><title>${o.type==='door'?'门':'窗'} ${o.width} × ${o.height} mm</title><rect x="${-width/2}" y="${-w.thickness/2-1}" width="${width}" height="${w.thickness+2}" fill="#fafcfb" stroke="${color}" stroke-width="1.5"/>${o.type==='door'?`<path d="M${-width/2} 0v${width} M${width/2} 0 A${width} ${width} 0 0 1 ${-width/2} ${width}" stroke="${color}" stroke-width="1.5" fill="none"/>`:`<path d="M${-width/2} -2H${width/2} M${-width/2} 2H${width/2}" stroke="${color}" stroke-width="1.5"/>`}</g>`;
  }
  for(const f of [...doc.furniture].sort((a,b)=>(a.type==='rug'?-1:0)-(b.type==='rug'?-1:0))){
    const w=f.width/unit,d=f.depth/unit,active=selection?.id===f.id;
    html+=`<g data-kind="furniture" data-id="${esc(f.id)}" transform="translate(${f.x} ${f.z}) rotate(${f.rotation})"><title>${esc(f.name)} ${f.width} × ${f.depth} mm</title><svg x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">${furnitureSymbol(f.type,f.color)}</svg>${active?`<rect x="${-w/2-3}" y="${-d/2-3}" width="${w+6}" height="${d+6}" fill="none" stroke="#cf7a41" stroke-width="2" stroke-dasharray="5 3" pointer-events="none"/>`:''}</g>`;
  }
  for(const r of doc.rooms){const area=roomArea(r)*unit*unit/1e6,p=roomInteriorPoint(r);
    html+=`<text x="${p.x}" y="${p.z}" text-anchor="middle" font-size="${font}" font-weight="600" fill="#3e5d57" stroke="white" stroke-width="3" paint-order="stroke">${esc(r.name)}<tspan x="${p.x}" dy="${font*1.3}" font-size="${font*.75}" font-weight="400">${doc.calibrated?area.toFixed(1)+' m²':'区域未标定'}</tspan></text>`;
  }
  for(const m of doc.measurements){html+=`<g data-kind="measurement" data-id="${esc(m.id)}"><line x1="${m.x1}" y1="${m.z1}" x2="${m.x2}" y2="${m.z2}" stroke="transparent" stroke-width="14"/><line x1="${m.x1}" y1="${m.z1}" x2="${m.x2}" y2="${m.z2}" stroke="#c27542" stroke-width="2" stroke-dasharray="5 3"/><circle cx="${m.x1}" cy="${m.z1}" r="3" fill="#c27542"/><circle cx="${m.x2}" cy="${m.z2}" r="3" fill="#c27542"/><text x="${(m.x1+m.x2)/2}" y="${(m.z1+m.z2)/2-6}" text-anchor="middle" font-size="${font*.85}" fill="#ac673a" stroke="white" stroke-width="3" paint-order="stroke">${formatLength(Math.hypot(m.x2-m.x1,m.z2-m.z1))}</text></g>`;}
  if(points.length){const a=points[0],c=hover||a;html+=`<circle cx="${a.x}" cy="${a.z}" r="4" fill="#cb7c43"/><line x1="${a.x}" y1="${a.z}" x2="${c.x}" y2="${c.z}" stroke="#cb7c43" stroke-width="2" stroke-dasharray="5 3"/><text x="${(a.x+c.x)/2}" y="${(a.z+c.z)/2-10}" font-size="${font}" fill="#ac673a" stroke="white" stroke-width="3" paint-order="stroke">${formatLength(distance(a,c))}</text>`;}
  svg.innerHTML=html;
}
function renderProperties(){
  const item=selected(),kind=selection?.kind;
  if(!item){$('properties').innerHTML='<h3>从家具库开始</h3><p class="tip" style="padding:0">点击一件家具，再点击平面图放置。选中对象后可在这里修改尺寸、旋转和材质。</p>';return;}
  const field=(label,id,value,min=10,max=10000)=>`<label>${label}<input id="prop-${id}" type="number" value="${value}" min="${min}" max="${max}" step="any" required></label>`;
  let html=`<form id="property-form"><h3>${kind==='furniture'?esc(item.name):kind==='wall'?'墙线':kind==='room'?'房间区域':kind==='opening'?(item.type==='door'?'门':'窗'):'距离标注'}</h3>`;
  if(kind==='furniture'){
    html+=`<label>名称<input id="prop-name" value="${esc(item.name)}" maxlength="40"></label><div class="field-grid">${field('宽度 / mm','width',item.width)}${field('深度 / mm','depth',item.depth)}${field('高度 / mm','height',item.height)}${field('旋转 / °','rotation',item.rotation,-360,360)}</div><label>颜色<input id="prop-color" type="color" value="${item.color}"></label><label class="check"><input id="prop-locked" type="checkbox" ${item.locked?'checked':''}>锁定位置与尺寸</label>`;
  } else if(kind==='wall')html+=`<div class="field-grid">${field('厚度 / mm','thickness',Number((item.thickness*doc.mmPerPixel).toFixed(2)),20,1000)}${field('高度 / mm','height',item.height??3000,100,10000)}${field('长度 / mm','length',Number((wallLength(item)*doc.mmPerPixel).toFixed(2)),100,100000)}${['x1','z1','x2','z2'].map((k,i)=>field(['起点 X / mm','起点 Y / mm','终点 X / mm','终点 Y / mm'][i],k,Number((item[k]*doc.mmPerPixel).toFixed(2)),-100000000,100000000)).join('')}</div><label class="check"><input id="prop-bearing" type="checkbox" ${item.bearing?'checked':''}>标记为承重墙（人工标记）</label><p class="tip" style="padding:0">修改端点会带动共用该端点的墙。修改长度时按端点方向调整终点；门窗随墙移动。标记不代表结构鉴定。</p>`;
  else if(kind==='opening')html+=`<div class="field-grid">${field('距墙起点 / mm','offset',item.offset,0,100000000)}${field('宽度 / mm','width',item.width,100,100000)}${field('高度 / mm','height',item.height,100,10000)}${item.type==='window'?field('窗台高 / mm','sillHeight',item.sillHeight,0,10000):''}</div><p class="tip" style="padding:0">位置按洞口中心计算；二维拖动可沿墙移动。删除墙体会同时删除门窗。</p>`;
  else if(kind==='room')html+=`<label>区域名称<input id="prop-name" value="${esc(item.name)}" maxlength="40"></label><label>地面<select id="prop-material"><option value="wood" ${item.material==='wood'?'selected':''}>木地板</option><option value="tile" ${item.material==='tile'?'selected':''}>地砖</option><option value="plain" ${item.material==='plain'?'selected':''}>素色</option></select></label><p>${doc.calibrated?(roomArea(item)*doc.mmPerPixel**2/1e6).toFixed(2)+' m²':'标定后显示区域面积'}</p><p class="tip" style="padding:0">${item.source==='walls'?'按墙中心线围合计算，非净使用面积。轮廓随墙更新，请移动墙体调整房间。':'手工区域面积。'}</p>`;
  else html+=`<p>${formatLength(Math.hypot(item.x2-item.x1,item.z2-item.z1))}</p>`;
  html+='<div class="property-actions">';if(kind!=='measurement')html+='<button class="primary" type="submit">应用修改</button>';
  if(kind==='furniture')html+='<button id="rotate" type="button">旋转 90°</button><button id="duplicate" type="button">复制</button>';
  html+='<button id="delete" class="danger" type="button">删除</button></div></form>';
  $('properties').innerHTML=html;
  $('property-form').addEventListener('submit',e=>{
    e.preventDefault();const before=clone(doc);
    if(kind==='furniture'){
      if(item.locked && $('prop-locked').checked){message('请先取消锁定再修改家具。',true);return;}
      const values=Object.fromEntries(['width','depth','height','rotation'].map(k=>[k,Number($(`prop-${k}`).value)]));
      if(!['width','depth','height'].every(k=>Number.isFinite(values[k])&&values[k]>=10&&values[k]<=10000)||!Number.isFinite(values.rotation)){message('请输入有效的家具尺寸。',true);return;}
      Object.assign(item,values,{rotation:normalizeAngle(values.rotation),name:$('prop-name').value||item.name,color:$('prop-color').value,locked:$('prop-locked').checked});
    }else if(kind==='wall'){
      const ends=Object.fromEntries(['x1','z1','x2','z2'].map(k=>[k,Number($(`prop-${k}`).value)/doc.mmPerPixel]));
      const length=Number($('prop-length').value);if(Math.abs(length-wallLength(item)*doc.mmPerPixel)>.01){const angle=Math.atan2(ends.z2-ends.z1,ends.x2-ends.x1);ends.x2=ends.x1+Math.cos(angle)*length/doc.mmPerPixel;ends.z2=ends.z1+Math.sin(angle)*length/doc.mmPerPixel;}
      moveWallEndpoints(doc,item.id,ends);item.thickness=Number($('prop-thickness').value)/doc.mmPerPixel;item.height=Number($('prop-height').value);item.bearing=$('prop-bearing').checked;
    }else if(kind==='opening'){
      Object.assign(item,Object.fromEntries(['offset','width','height'].map(k=>[k,Number($(`prop-${k}`).value)])),{sillHeight:item.type==='window'?Number($('prop-sillHeight').value):0});
    }else if(kind==='room'){item.name=$('prop-name').value||'房间';item.material=$('prop-material').value;}
    if(commit(before))message('对象已更新，二维和三维已同步。');
  });
  $('delete').onclick=removeSelected;if($('rotate'))$('rotate').onclick=rotateSelected;if($('duplicate'))$('duplicate').onclick=duplicateSelected;
}
function render(refit=false){
  if(selection&&!selected())selection=null;
  $('project-title').value=doc.title;$('scale-state').textContent=doc.calibrated?'已标定 · mm':'未标定 · 尺寸仅示意';$('scale-state').className=`pill ${doc.calibrated?'ready':''}`;
  $('counts').textContent=`${doc.plan.walls.length} 段墙 · ${doc.openings.length} 个门窗 · ${doc.furniture.length} 件家具 · ${doc.rooms.length} 个区域`;
  $('auto-rooms').checked=doc.autoRooms;
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
  if(refit||!view)fitPlan();else renderPlan();renderProperties();three?.update(doc,selection,refit);
}
function addFurniture(type,p){const before=clone(doc),item=newFurniture(type,p.x,p.z);Object.assign(item,snapFurniture(item,doc,$('snap-grid').checked,$('snap-wall').checked));doc.furniture.push(item);selection={kind:'furniture',id:item.id};setTool('select');if(commit(before))message(`已放置${item.name}，可拖动或修改尺寸。`);}
function addOpening(type,p){
  const hit=nearestWall(p,doc.plan.walls,180/doc.mmPerPixel);if(!hit){message('请点击墙线附近放置门窗。',true);return;}
  let item;try{item=newOpening(type,hit.wall,hit.t*wallLength(hit.wall)*doc.mmPerPixel,doc.mmPerPixel);}catch(error){message(error.message,true);return;}
  const error=openingError(item,doc);if(error){message(error,true);return;}
  const before=clone(doc);doc.openings.push(item);selection={kind:'opening',id:item.id};setTool('select');if(commit(before))message('门窗已放置，可拖动或修改尺寸；三维墙体已开洞。');
}
function rotateSelected(){const item=selected();if(selection?.kind!=='furniture'||!item)return;if(item.locked){message('家具已锁定。',true);return;}const before=clone(doc);item.rotation=normalizeAngle(item.rotation+90);commit(before);}
function duplicateSelected(){const item=selected();if(selection?.kind!=='furniture'||!item)return;const before=clone(doc),copy={...clone(item),id:uid(),x:item.x+200/doc.mmPerPixel,z:item.z+200/doc.mmPerPixel,locked:false};doc.furniture.push(copy);selection.id=copy.id;commit(before);}
function removeSelected(){const item=selected();if(!item)return;if(item.locked){message('请先解锁家具再删除。',true);return;}if(selection.kind==='room'&&item.source==='walls'&&doc.autoRooms){message('自动房间随墙生成；请先关闭「房间随墙更新」再删除。',true);return;}const before=clone(doc);const array=selection.kind==='furniture'?doc.furniture:selection.kind==='wall'?doc.plan.walls:selection.kind==='room'?doc.rooms:selection.kind==='opening'?doc.openings:doc.measurements;if(selection.kind==='wall'){doc.openings=doc.openings.filter(o=>o.wallId!==item.id);if(!doc.autoRooms)doc.rooms=doc.rooms.filter(r=>r.source!=='walls'||!r.wallIds.includes(item.id));}array.splice(array.indexOf(item),1);selection=null;commit(before);}
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
  if(tool!=='select'){
    if(tool==='wall'&&!$('wall-length').checkValidity()){message('定长请输入 100–100000 mm，或留空自由绘制。',true);return;}
    p=aligned(p,e);points.push(p);
    if(points.length===2){const [a,b]=points;
      if(distance(a,b)<2){points=[a];return;}
      if(tool==='calibrate'){$('calibration-dialog').showModal();$('real-distance').focus();$('real-distance').select();return;}
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
  const target=e.target.closest('[data-kind]');selection=target?{kind:target.dataset.kind,id:target.dataset.id}:null;
  const item=selected();
  if(item&&!item.locked&&!(selection.kind==='room'&&item.source==='walls')){gesture={kind:'object',start:p,before:clone(doc),original:clone(item),moved:false};svg.setPointerCapture(e.pointerId);}
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
    if(selection.kind==='furniture'){Object.assign(item,snapFurniture({...item,x:o.x+dx,z:o.z+dz},doc,$('snap-grid').checked,$('snap-wall').checked));}
    else if(selection.kind==='opening'){
      const wall=doc.plan.walls.find(w=>w.id===item.wallId),hit=nearestWall(p,[wall]);
      const next={...item,offset:hit.t*wallLength(wall)*doc.mmPerPixel};if(!openingError(next,doc))Object.assign(item,next);
    }
    else if(selection.kind==='room'){const next=snapPoint({x:o.x+dx,z:o.z+dz},doc.mmPerPixel,$('snap-grid').checked);Object.assign(item,next);if(o.polygon)item.polygon=o.polygon.map(v=>({x:v.x+next.x-o.x,z:v.z+next.z-o.z}));}
    else{let a=snapPoint({x:o.x1+dx,z:o.z1+dz},doc.mmPerPixel,$('snap-grid').checked);if(selection.kind==='wall'&&$('snap-endpoints').checked)a=snapWallPoint(a,doc.plan.walls.filter(w=>w.id!==item.id),120/doc.mmPerPixel);const next={x1:a.x,z1:a.z,x2:o.x2+a.x-o.x1,z2:o.z2+a.z-o.z1};if(selection.kind==='wall')moveWallEndpoints(doc,item.id,next);else Object.assign(item,next);}
    renderPlan();return;
  }
  if(points.length===1){hover=aligned(p,e);renderPlan();}
});
svg.addEventListener('pointerup',e=>{if(!gesture)return;const g=gesture;gesture=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(g.kind==='object'&&g.moved)commit(g.before);});
svg.addEventListener('pointercancel',()=>{if(gesture?.before){doc=gesture.before;render();}gesture=null;});
svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.12:.89,point(e));},{passive:false});
function zoom(factor,anchor={x:view.x+view.width/2,z:view.y+view.height/2}){const w=view.width*factor;if(w<80||w>30000)return;view={x:anchor.x-(anchor.x-view.x)*factor,y:anchor.z-(anchor.z-view.y)*factor,width:w,height:view.height*factor};renderPlan();}
svg.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
svg.addEventListener('drop',e=>{e.preventDefault();const type=e.dataTransfer.getData('application/x-floorplan-furniture');if(CATALOG.some(f=>f.type===type))addFurniture(type,point(e));});
$('catalog-items').addEventListener('click',e=>{const card=e.target.closest('[data-type]');if(card)setTool('place',card.dataset.type);});
$('catalog-items').addEventListener('dragstart',e=>{const card=e.target.closest('[data-type]');if(card){e.dataTransfer.setData('application/x-floorplan-furniture',card.dataset.type);e.dataTransfer.effectAllowed='copy';if(mode==='3d')setMode('2d');}});
$('category').onchange=renderCatalog;
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
$('calibration-form').onsubmit=e=>{e.preventDefault();try{const factor=calibration(points[0],points[1],Number($('real-distance').value)),before=clone(doc);doc.mmPerPixel=factor;doc.calibrated=true;$('calibration-dialog').close();setTool('select');if(commit(before,true))message('比例已标定。家具和门窗保留实际毫米尺寸，请重新检查摆放位置。');}catch(error){message(error.message,true);}};
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
  const item=selected();if(item&&selection.kind==='furniture'&&!item.locked&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();const before=clone(doc),step=(e.shiftKey?100:10)/doc.mmPerPixel;item.x+=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;item.z+=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;commit(before);
  }
});
function download(data,name,type){const url=typeof data==='string'&&data.startsWith('data:')?data:URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();if(url.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(url),1000);}
const filename=()=>doc.title.replace(/[<>:"/\\|?*]/g,'_');
$('export').onclick=()=>{download(JSON.stringify(doc,null,2),`${filename()}.json`,'application/json');message('方案已导出，包含户型、家具、尺寸、区域和底图。');};
$('export-image').onclick=()=>{if(three){download(three.screenshot(),`${filename()}-3D.png`,'image/png');message('三维效果图已保存。');}};
$('demo').onclick=()=>{const before=clone(doc);doc=demoDocument();selection=null;setTool('select');if(commit(before,true))message('已加载可编辑示例。示例家具为人工摆放，可撤销返回原方案。');};
$('project-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>15*1024*1024)throw new Error('方案文件过大，最大支持 15 MB。');const next=validateDocument(JSON.parse(await file.text())),before=clone(doc);doc=next;selection=null;setTool('select');if(commit(before,true))message('方案已导入，可以继续编辑。');}catch(error){message(`导入失败：${error.message}`,true);}finally{e.target.value='';}
};
async function previewImage(file){const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.88);}finally{URL.revokeObjectURL(url);}}
$('image-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;e.target.disabled=true;message('正在识别户型墙线…');
  try{
    const body=new FormData();body.append('file',file);const response=await fetch('http://localhost:5000/upload',{method:'POST',body});const plan=await response.json();if(!response.ok)throw new Error(plan.error||'识别失败');
    const image=await previewImage(file),before=clone(doc),next=emptyDocument();next.title=file.name.replace(/\.[^.]+$/,'');next.plan=plan;next.image=image;
    doc=next;selection=null;setTool('select');setMode('2d');if(commit(before,true))message(`已识别 ${plan.walls.length} 段墙线。请先「比例标定」，再摆放家具；墙线可手工修正。`);
  }catch(error){message(`上传失败：${error.message}`,true);}finally{e.target.disabled=false;e.target.value='';}
};
renderCatalog();render(true);setMode('2d');$('backup-cache').hidden=!restoreError;message(restoreError||(restored?'已恢复此浏览器中保存的方案。':'这是可编辑的家装示例。可直接摆放家具，或上传你自己的户型图。'),!!restoreError);

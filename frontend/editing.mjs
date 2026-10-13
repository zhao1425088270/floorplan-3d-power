import {wallLength,projectToWall,moveWallEndpoints,wallSections} from './plan.mjs';

export function splitWall(doc,id,point,newId){
  const wall=doc.plan.walls.find(w=>w.id===id);if(!wall)throw new Error('请先选择要分割的墙。');
  const p=projectToWall(point,wall),cut=p.t*wallLength(wall)*doc.mmPerPixel,length=wallLength(wall)*doc.mmPerPixel;
  if(cut<100||length-cut<100)throw new Error('分割后每段墙至少保留 100 mm。');
  const openings=doc.openings.filter(o=>o.wallId===id);
  if(openings.some(o=>cut>o.offset-o.width/2+1e-6&&cut<o.offset+o.width/2-1e-6))throw new Error('不能从门窗洞口中间分割，请选择洞口之外的位置。');
  const second={...wall,id:newId,x1:p.x,z1:p.z};wall.x2=p.x;wall.z2=p.z;
  doc.plan.walls.splice(doc.plan.walls.indexOf(wall)+1,0,second);
  for(const o of openings)if(o.offset>=cut){o.wallId=newId;o.offset-=cut;}
  for(const r of doc.rooms)if(r.wallIds?.includes(id))r.wallIds=r.wallIds.flatMap(v=>v===id?[id,newId]:[v]);
  return second;
}
export function nearestEndpoint(point,walls,threshold){
  let best=null;
  for(const w of walls)for(const end of [1,2]){const x=w[`x${end}`],z=w[`z${end}`],distance=Math.hypot(point.x-x,point.z-z);if(distance<=threshold&&(!best||distance<best.distance))best={wallId:w.id,end,x,z,distance};}
  return best;
}
export function connectEndpoints(doc,from,to){
  const wall=doc.plan.walls.find(w=>w.id===from.wallId),target=doc.plan.walls.find(w=>w.id===to.wallId);
  if(!wall||!target||![1,2].includes(from.end)||![1,2].includes(to.end))throw new Error('请选择两个有效墙端点。');
  if(wall.id===target.id)throw new Error('请选择另一段墙的端点。');
  const x=target[`x${to.end}`],z=target[`z${to.end}`];
  if(Math.hypot(wall[`x${from.end}`]-x,wall[`z${from.end}`]-z)<1e-6)throw new Error('这两个端点已经连接。');
  const next={x1:wall.x1,z1:wall.z1,x2:wall.x2,z2:wall.z2,[`x${from.end}`]:x,[`z${from.end}`]:z};
  moveWallEndpoints(doc,wall.id,next);
}

export function furnitureIds(doc,ids){
  const chosen=new Set(ids),groups=new Set(doc.furniture.filter(f=>chosen.has(f.id)&&f.groupId).map(f=>f.groupId));
  return doc.furniture.filter(f=>chosen.has(f.id)||groups.has(f.groupId)).map(f=>f.id);
}
export function pruneGroups(doc){
  const counts=new Map();for(const f of doc.furniture)if(f.groupId)counts.set(f.groupId,(counts.get(f.groupId)||0)+1);
  for(const f of doc.furniture)if(f.groupId&&counts.get(f.groupId)<2)delete f.groupId;
}
function selectedItems(doc,ids){const chosen=new Set(furnitureIds(doc,ids));return doc.furniture.filter(f=>chosen.has(f.id));}
function movable(items){if(items.some(f=>f.locked))throw new Error('所选家具中有锁定对象，请先解锁。');}
export function groupFurniture(doc,ids,groupId){
  const items=selectedItems(doc,ids);if(items.length<2)throw new Error('请按住 Shift 选择至少两件家具。');movable(items);
  for(const f of items)f.groupId=groupId;
}
export function ungroupFurniture(doc,ids){const items=selectedItems(doc,ids);movable(items);for(const f of items)delete f.groupId;}
export function translateFurniture(doc,ids,dx,dz){const items=selectedItems(doc,ids);movable(items);for(const f of items){f.x+=dx;f.z+=dz;}}
export function rotateFurniture(doc,ids,degrees){
  const items=selectedItems(doc,ids);if(!items.length)return;movable(items);
  const x=items.reduce((sum,f)=>sum+f.x,0)/items.length,z=items.reduce((sum,f)=>sum+f.z,0)/items.length,a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  for(const f of items){const dx=f.x-x,dz=f.z-z;f.x=x+dx*c-dz*s;f.z=z+dx*s+dz*c;f.rotation=((f.rotation+degrees)%360+360)%360;}
}
export function copyFurniture(doc,ids,makeId){
  const items=selectedItems(doc,ids),groups=new Map(),copies=items.map(f=>{
    const copy={...f,id:makeId(),x:f.x+200/doc.mmPerPixel,z:f.z+200/doc.mmPerPixel,locked:false};
    if(f.groupId){if(!groups.has(f.groupId))groups.set(f.groupId,makeId());copy.groupId=groups.get(f.groupId);}return copy;
  });
  doc.furniture.push(...copies);return copies.map(f=>f.id);
}
export function openingLeaf(opening){
  const direction=opening.hinge==='end'?-1:1,side=opening.swing??1,angle=(opening.openAngle??(opening.type==='door'?90:0))*Math.PI/180;
  const hinge=-direction*opening.width/2;
  return {direction,side,angle,hinge,x:hinge+direction*Math.cos(angle)*opening.width,z:side*Math.sin(angle)*opening.width};
}

function rectangle(x,z,width,depth,rotation){
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz])=>({x:x+sx*width/2*c-sz*depth/2*s,z:z+sx*width/2*s+sz*depth/2*c}));
}
function overlaps(a,b){
  for(const polygon of [a,b])for(let i=0;i<2;i++){
    const p=polygon[i],q=polygon[i+1],length=Math.hypot(q.x-p.x,q.z-p.z),nx=-(q.z-p.z)/length,nz=(q.x-p.x)/length;
    const project=poly=>poly.map(v=>v.x*nx+v.z*nz),pa=project(a),pb=project(b);
    if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=1)return false;
  }
  return true;
}
const verticalOverlap=(a,b)=>Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom)>1;
// Dimension-based oriented boxes: warnings, not a collision response or mesh intersection.
export function layoutIssues(doc,limit=80){
  const issues=[],scale=doc.mmPerPixel,items=doc.furniture.filter(f=>f.type!=='rug').map(f=>({item:f,polygon:rectangle(f.x*scale,f.z*scale,f.width,f.depth,f.rotation),bottom:f.elevation??0,top:(f.elevation??0)+f.height}));
  const add=(type,ids,label)=>{issues.push({type,ids,label});return issues.length>=limit;};
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const a=items[i],b=items[j];
    if(verticalOverlap(a,b)&&overlaps(a.polygon,b.polygon)&&add('overlap',[a.item.id,b.item.id],`${a.item.name} 与 ${b.item.name} 可能重叠`))return {issues,truncated:true};
  }
  for(const wall of doc.plan.walls){
    const length=wallLength(wall),dx=(wall.x2-wall.x1)/length,dz=(wall.z2-wall.z1)/length,angle=Math.atan2(dz,dx)*180/Math.PI;
    const pieces=wallSections(wall,doc.openings,scale).map(p=>({...p,polygon:rectangle(wall.x1*scale+dx*(p.start+p.end)/2,wall.z1*scale+dz*(p.start+p.end)/2,p.end-p.start,wall.thickness*scale,angle)}));
    for(const f of items)if(pieces.some(p=>verticalOverlap(f,p)&&overlaps(f.polygon,p.polygon))&&add('wall',[f.item.id,wall.id],`${f.item.name} 可能穿墙`))return {issues,truncated:true};
  }
  return {issues,truncated:false};
}

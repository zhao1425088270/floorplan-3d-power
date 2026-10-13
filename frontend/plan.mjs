const EPS=1e-6;
export const wallLength=w=>Math.hypot(w.x2-w.x1,w.z2-w.z1);
export const roomPolygon=r=>r.polygon||[{x:r.x,z:r.z},{x:r.x+r.width,z:r.z},{x:r.x+r.width,z:r.z+r.depth},{x:r.x,z:r.z+r.depth}];
export function signedArea(points){return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0)/2;}
export const roomArea=r=>Math.abs(signedArea(roomPolygon(r)));
export function polygonBounds(points){
  const xs=points.map(p=>p.x),zs=points.map(p=>p.z),x=Math.min(...xs),z=Math.min(...zs);
  return {x,z,width:Math.max(...xs)-x,depth:Math.max(...zs)-z};
}
export function pointInPolygon(p,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
export function isSimplePolygon(points){
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a.x-b.x,a.z-b.z)<EPS)return false;
    for(let j=i+1;j<points.length;j++){
      if(j===i+1||(i===0&&j===points.length-1))continue;
      const c=points[j],d=points[(j+1)%points.length],r=subtract(b,a),s=subtract(d,c),q=subtract(c,a),den=cross(r,s);
      if(Math.abs(den)>EPS){const t=cross(q,s)/den,u=cross(q,r)/den;if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS)return false;}
      else if(Math.abs(cross(q,r))<EPS){
        const w={x1:a.x,z1:a.z,x2:b.x,z2:b.z},v={x1:c.x,z1:c.z,x2:d.x,z2:d.z};
        if(projectToWall(c,w).distance<EPS||projectToWall(d,w).distance<EPS||projectToWall(a,v).distance<EPS||projectToWall(b,v).distance<EPS)return false;
      }
    }
  }
  return true;
}
export function roomInteriorPoint(room){
  const p=roomPolygon(room),levels=[...new Set(p.map(v=>v.z))].sort((a,b)=>a-b);
  let best=null;
  for(let j=1;j<levels.length;j++){
    const z=(levels[j-1]+levels[j])/2,xs=[];
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((a.z>z)!==(b.z>z))xs.push(a.x+(z-a.z)*(b.x-a.x)/(b.z-a.z));}
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2){const span=xs[i+1]-xs[i];if(!best||span>best.span)best={x:(xs[i]+xs[i+1])/2,z,span};}
  }
  return best?{x:best.x,z:best.z}:{x:room.x+room.width/2,z:room.z+room.depth/2};
}
export function projectToWall(p,w){
  const dx=w.x2-w.x1,dz=w.z2-w.z1,length=wallLength(w);
  const t=length?Math.max(0,Math.min(1,((p.x-w.x1)*dx+(p.z-w.z1)*dz)/(length*length))):0;
  const x=w.x1+t*dx,z=w.z1+t*dz;
  return {x,z,t,distance:Math.hypot(p.x-x,p.z-z)};
}
export function nearestWall(p,walls,threshold=Infinity){
  let best=null;
  for(const wall of walls){const q=projectToWall(p,wall);if(q.distance<=threshold&&(!best||q.distance<best.distance))best={...q,wall};}
  return best;
}
export function snapWallPoint(p,walls,threshold){
  let best=null;
  for(const w of walls)for(const q of [{x:w.x1,z:w.z1},{x:w.x2,z:w.z2}]){const d=Math.hypot(p.x-q.x,p.z-q.z);if(d<=threshold&&(!best||d<best.distance))best={...q,distance:d};}
  if(best)return {x:best.x,z:best.z};
  const q=nearestWall(p,walls,threshold);return q?{x:q.x,z:q.z}:p;
}
export function openingError(opening,doc){
  const w=doc.plan.walls.find(w=>w.id===opening.wallId);
  if(!w)return '门窗关联的墙体不存在。';
  const {offset,width,height,sillHeight,type}=opening;
  if(!['door','window'].includes(type)||![offset,width,height,sillHeight].every(Number.isFinite)||width<100||height<100||sillHeight<0)return '门窗尺寸不正确。';
  if(type==='door'&&sillHeight!==0)return '门的离地高度必须为 0。';
  if(offset-width/2<-EPS||offset+width/2>wallLength(w)*doc.mmPerPixel+EPS)return '门窗超出墙体端点，请调整位置或宽度。';
  if(height+sillHeight>(w.height??3000)+EPS)return '门窗顶部超过墙高，请调整高度或窗台高。';
  for(const other of doc.openings||[]){
    if(other.id===opening.id||other.wallId!==opening.wallId)continue;
    if(Math.abs(other.offset-offset)<(other.width+width)/2-EPS&&Math.max(other.sillHeight,sillHeight)<Math.min(other.sillHeight+other.height,sillHeight+height)-EPS)return '门窗洞口重叠，请调整位置。';
  }
  return null;
}
// Rectangular wall pieces in millimeters; no CSG or solid spans through an opening.
export function wallSections(w,openings,mmPerPixel,previewHeight=Infinity){
  const length=wallLength(w)*mmPerPixel,height=Math.min(w.height??3000,previewHeight);
  const cuts=openings.filter(o=>o.wallId===w.id),xs=[0,length];
  for(const o of cuts)xs.push(Math.max(0,o.offset-o.width/2),Math.min(length,o.offset+o.width/2));
  const sorted=[...new Set(xs)].sort((a,b)=>a-b),pieces=[];
  for(let i=1;i<sorted.length;i++){
    const start=sorted[i-1],end=sorted[i],mid=(start+end)/2;if(end-start<EPS)continue;
    const gaps=cuts.filter(o=>mid>o.offset-o.width/2&&mid<o.offset+o.width/2).map(o=>[Math.min(height,o.sillHeight),Math.min(height,o.sillHeight+o.height)]).sort((a,b)=>a[0]-b[0]);
    let bottom=0;
    for(const [lo,hi] of gaps){if(lo>bottom)pieces.push({start,end,bottom,top:lo});bottom=Math.max(bottom,hi);}
    if(bottom<height)pieces.push({start,end,bottom,top:height});
  }
  return pieces;
}
export function documentBounds(doc){
  const b=doc.plan.bounds,points=[{x:b.x,z:b.y},{x:b.x+b.width,z:b.y+b.height}];
  for(const w of doc.plan.walls)for(const p of [{x:w.x1,z:w.z1},{x:w.x2,z:w.z2}])for(const sign of [-1,1])points.push({x:p.x+sign*w.thickness/2,z:p.z+sign*w.thickness/2});
  for(const r of doc.rooms)points.push(...roomPolygon(r));
  for(const f of doc.furniture){const a=f.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);for(const x of [-f.width/2,f.width/2])for(const z of [-f.depth/2,f.depth/2])points.push({x:f.x+(x*c-z*s)/doc.mmPerPixel,z:f.z+(x*s+z*c)/doc.mmPerPixel});}
  for(const m of doc.measurements)points.push({x:m.x1,z:m.z1},{x:m.x2,z:m.z2});
  const bounds=polygonBounds(points);return {x:bounds.x,y:bounds.z,width:bounds.width,height:bounds.depth};
}
export function moveWallEndpoints(doc,id,next){
  const wall=doc.plan.walls.find(w=>w.id===id),old={...wall};
  for(const [x,z] of [['x1','z1'],['x2','z2']]){
    for(const other of doc.plan.walls){if(other.id===id)continue;for(const [ox,oz] of [['x1','z1'],['x2','z2']]){
      if(Math.hypot(other[ox]-old[x],other[oz]-old[z])<EPS){other[ox]=next[x];other[oz]=next[z];}
    }}
  }
  Object.assign(wall,next);
}
const cross=(a,b)=>a.x*b.z-a.z*b.x;
const subtract=(a,b)=>({x:a.x-b.x,z:a.z-b.z});
// Split at crossings/T junctions, then walk directed edges with the face on the left.
export function detectRooms(walls){
  if(walls.length>600)throw new Error('自动识别最多支持 600 段墙，请先精简误检墙线。');
  const segments=walls.filter(w=>wallLength(w)>EPS).map(w=>({a:{x:w.x1,z:w.z1},b:{x:w.x2,z:w.z2},cuts:[0,1],id:w.id}));
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j],r=subtract(a.b,a.a),s=subtract(b.b,b.a),q=subtract(b.a,a.a),den=cross(r,s);
    if(Math.abs(den)>EPS){const t=cross(q,s)/den,u=cross(q,r)/den;if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS){a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)));}}
    else if(Math.abs(cross(q,r))<EPS){for(const [first,second] of [[a,b],[b,a]])for(const p of [second.a,second.b]){const w={x1:first.a.x,z1:first.a.z,x2:first.b.x,z2:first.b.z},v=projectToWall(p,w);if(v.distance<EPS)first.cuts.push(v.t);}}
  }
  const nodes=new Map(),edgeWalls=new Map();
  const node=p=>{const key=`${p.x.toFixed(5)},${p.z.toFixed(5)}`;if(!nodes.has(key))nodes.set(key,{...p,key,neighbors:new Set()});return nodes.get(key);};
  for(const s of segments){const cuts=[...new Set(s.cuts)].sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){
    const at=t=>node({x:s.a.x+(s.b.x-s.a.x)*t,z:s.a.z+(s.b.z-s.a.z)*t}),a=at(cuts[i-1]),b=at(cuts[i]);if(a===b)continue;
    a.neighbors.add(b.key);b.neighbors.add(a.key);edgeWalls.set(`${a.key}|${b.key}`,s.id);edgeWalls.set(`${b.key}|${a.key}`,s.id);
  }}
  // Dangling wall stubs do not bound a room.
  const queue=[...nodes.values()].filter(n=>n.neighbors.size<2);
  while(queue.length){const n=queue.pop();for(const key of n.neighbors){const v=nodes.get(key);v.neighbors.delete(n.key);if(v.neighbors.size===1)queue.push(v);}n.neighbors.clear();}
  for(const n of nodes.values())n.order=[...n.neighbors].sort((a,b)=>Math.atan2(nodes.get(a).z-n.z,nodes.get(a).x-n.x)-Math.atan2(nodes.get(b).z-n.z,nodes.get(b).x-n.x));
  const visited=new Set(),rooms=[];
  for(const n of nodes.values())for(const neighbor of n.order){
    const start=`${n.key}|${neighbor}`;if(visited.has(start))continue;
    let a=n.key,b=neighbor;const polygon=[],wallIds=[];
    while(!visited.has(`${a}|${b}`)){
      visited.add(`${a}|${b}`);const from=nodes.get(a),to=nodes.get(b);polygon.push({x:from.x,z:from.z});wallIds.push(edgeWalls.get(`${a}|${b}`));
      const index=to.order.indexOf(a),next=to.order[(index-1+to.order.length)%to.order.length];a=b;b=next;
    }
    if(`${a}|${b}`===start&&signedArea(polygon)>EPS){
      if(new Set(polygon.map(p=>`${p.x},${p.z}`)).size!==polygon.length)throw new Error('墙网包含内环或桥接结构，请先拆分为简单闭合房间。');
      rooms.push({...polygonBounds(polygon),polygon,wallIds:[...new Set(wallIds)],source:'walls'});
    }
  }
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
    if(pointInPolygon(roomInteriorPoint(rooms[i]),rooms[j].polygon)||pointInPolygon(roomInteriorPoint(rooms[j]),rooms[i].polygon))throw new Error('暂不支持带内庭的嵌套房间，请使用手工区域。');
  }
  return rooms;
}
export function refreshRooms(doc,makeId){
  const found=detectRooms(doc.plan.walls),old=doc.rooms.filter(r=>r.source==='walls'),used=new Set();
  doc.rooms=[...doc.rooms.filter(r=>r.source!=='walls'),...found.map((room,index)=>{
    const center=roomInteriorPoint(room),previous=old.find(r=>!used.has(r.id)&&r.wallIds.length===room.wallIds.length&&r.wallIds.every(id=>room.wallIds.includes(id)))||old.find(r=>!used.has(r.id)&&pointInPolygon(center,roomPolygon(r)));
    if(previous)used.add(previous.id);
    return {...room,id:previous?.id||makeId(),name:previous?.name||`房间 ${index+1}`,material:previous?.material||'wood'};
  })];
  return found.length;
}

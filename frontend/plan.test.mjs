import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDocument,newFurniture,newOpening,validateDocument,History,clone} from './core.mjs';
import {detectRooms,roomArea,roomInteriorPoint,pointInPolygon,wallSections,openingError,nearestWall,snapWallPoint,documentBounds,moveWallEndpoints,refreshRooms} from './plan.mjs';

const wall=(id,x1,z1,x2,z2)=>({id,x1,z1,x2,z2,thickness:20,height:3000});
const rectangle=()=>[wall('a',0,0,400,0),wall('b',400,0,400,300),wall('c',400,300,0,300),wall('d',0,300,0,0)];
function plan(){const d=emptyDocument();d.plan.walls=rectangle();return d;}
const door=()=>({id:'door',wallId:'a',type:'door',offset:2000,width:900,height:2100,sillHeight:0});

test('legacy documents load with optional wall height and no openings',()=>{
  const d=plan();delete d.openings;delete d.autoRooms;delete d.plan.walls[0].height;
  const loaded=validateDocument(d);assert.deepEqual(loaded.openings,[]);assert.equal(loaded.autoRooms,false);
  assert.equal(wallSections(loaded.plan.walls[0],[],10)[0].top,3000);
});
test('door and window voids retain wall below sill and above lintel',()=>{
  const d=plan(),w=d.plan.walls[0],o=door();d.openings=[o];
  assert.equal(openingError(o,d),null);
  const pieces=wallSections(w,d.openings,10);
  assert.ok(!pieces.some(p=>p.start<2000&&p.end>2000&&p.bottom<1000&&p.top>1000));
  assert.ok(pieces.some(p=>p.start<2000&&p.end>2000&&p.bottom===2100&&p.top===3000));
  const window={...o,type:'window',sillHeight:900,height:1200};
  assert.deepEqual(wallSections(w,[window],10).filter(p=>p.start<2000&&p.end>2000).map(p=>[p.bottom,p.top]),[[0,900],[2100,3000]]);
  assert.ok(wallSections(w,[o],10,650).every(p=>p.end<=1550||p.start>=2450));
});
test('reject dangling, overlapping and out-of-bounds openings, including after wall edits',()=>{
  for(const changes of [{wallId:'missing'},{offset:100},{width:5000},{height:3100},{sillHeight:20},{height:NaN}]){
    const d=plan();d.openings=[{...door(),...changes}];assert.throws(()=>validateDocument(d));
  }
  const d=plan();d.openings=[door(),{...door(),id:'second',offset:2200}];assert.throws(()=>validateDocument(d),/重叠/);
  d.openings=[door()];d.plan.walls[0].height=2000;assert.throws(()=>validateDocument(d),/墙高/);
  d.plan.walls[0].height=3000;d.plan.walls[0].x2=100;assert.throws(()=>validateDocument(d),/端点/);
});
test('opening projections and endpoint snapping work on diagonal and reversed walls',()=>{
  const walls=[wall('s',100,100,0,0)],hit=nearestWall({x:60,z:40},walls);
  assert.ok(Math.abs(hit.t-.5)<1e-9);assert.deepEqual(snapWallPoint({x:101,z:98},walls,5),{x:100,z:100});
  assert.equal(nearestWall({x:400,z:400},walls,10),null);
});
test('initial openings fit short walls and clicks near wall endpoints',()=>{
  const d=plan();d.plan.walls=[wall('short',0,0,80,0)];d.plan.walls[0].height=1800;
  for(const type of ['door','window']){
    const o=newOpening(type,d.plan.walls[0],10,d.mmPerPixel);assert.equal(o.width,800);assert.equal(o.offset,400);assert.equal(openingError(o,d),null);
  }
  assert.throws(()=>newOpening('door',wall('tiny',0,0,5,0),0,10),/墙体过短/);
});
test('find adjacent rooms at T junctions and ignore dangling wall stubs',()=>{
  const walls=[...rectangle(),wall('partition',200,0,200,300),wall('stub',50,0,50,50)];
  const rooms=detectRooms(walls);assert.equal(rooms.length,2);assert.deepEqual(rooms.map(roomArea),[60000,60000]);
  assert.equal(detectRooms(rectangle().slice(0,3)).length,0);
  assert.equal(detectRooms([...rectangle(),wall('duplicate',100,0,300,0)]).length,1);
});
test('concave room uses polygon area and interior point, not bounding rectangle',()=>{
  const p=[[0,0],[400,0],[400,100],[100,100],[100,400],[0,400]],walls=p.map((a,i)=>wall(String(i),...a,...p[(i+1)%p.length]));
  const rooms=detectRooms(walls);assert.equal(rooms.length,1);assert.equal(roomArea(rooms[0]),70000);
  assert.ok(pointInPolygon(roomInteriorPoint(rooms[0]),rooms[0].polygon));
  assert.equal(rooms[0].width*rooms[0].depth,160000);
});
test('cross junction makes four rooms and disjoint rooms remain separate',()=>{
  assert.equal(detectRooms([...rectangle(),wall('v',200,0,200,300),wall('h',0,150,400,150)]).length,4);
  const separate=rectangle().map(w=>({...w,id:w.id+'2',x1:w.x1+600,x2:w.x2+600}));
  assert.equal(detectRooms([...rectangle(),...separate]).length,2);
});
test('nested courtyards are rejected instead of generating overlapping floors',()=>{
  const inner=rectangle().map(w=>({...w,id:w.id+'2',x1:w.x1/4+100,x2:w.x2/4+100,z1:w.z1/4+100,z2:w.z2/4+100}));
  assert.throws(()=>detectRooms([...rectangle(),...inner]),/嵌套/);
});
test('import rejects self-crossing or degenerate room polygons',()=>{
  const d=plan();
  for(const polygon of [[{x:0,z:0},{x:300,z:300},{x:0,z:300},{x:200,z:0}],[{x:0,z:0},{x:300,z:0},{x:300,z:0},{x:0,z:300}]]){
    d.rooms=[{id:'bad-room',name:'房间',material:'wood',polygon}];assert.throws(()=>validateDocument(d),/房间轮廓/);
  }
});
test('shared endpoints move together, room metadata persists, undo restores geometry and openings',()=>{
  const d=plan();d.openings=[door()];let id=0;refreshRooms(d,()=>`r${++id}`);d.rooms[0].name='客厅';d.rooms[0].material='tile';d.autoRooms=true;
  const before=clone(d),history=new History();moveWallEndpoints(d,'a',{x1:0,z1:-100,x2:400,z2:-100});refreshRooms(d,()=>`r${++id}`);
  assert.equal(d.plan.walls[1].z1,-100);assert.equal(d.plan.walls[3].z2,-100);assert.equal(roomArea(d.rooms[0]),160000);
  assert.equal(d.rooms[0].name,'客厅');assert.equal(d.rooms[0].material,'tile');assert.equal(d.rooms[0].id,before.rooms[0].id);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),d);
  history.push(before,d);assert.deepEqual(history.undo(d),before);assert.deepEqual(history.redo(before),d);
});
test('fit bounds include extended walls, rotated furniture and measurement endpoints',()=>{
  const d=plan();d.plan.walls.push(wall('far',2000,0,2500,0));const f=newFurniture('bed',-500,-500);f.rotation=45;d.furniture.push(f);d.measurements.push({id:'m',x1:0,z1:0,x2:0,z2:2000});
  const b=documentBounds(d);assert.ok(b.x<-600);assert.ok(b.y<-600);assert.ok(b.x+b.width>=2510);assert.ok(b.y+b.height>=2000);
});
test('the same validator rejects object limits before committing or reloading',()=>{
  const d=plan();d.furniture=Array.from({length:500},(_,i)=>({...newFurniture('chair',100,100),id:`f${i}`}));assert.equal(validateDocument(d).furniture.length,500);
  d.furniture.push({...newFurniture('chair',100,100),id:'overflow'});assert.throws(()=>validateDocument(d),/过多对象/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeFurniture} from './furniture.mjs';
import {softBox} from './surfaces.mjs';
import {CATALOG,newFurniture} from './core.mjs';
import {makeWall,roomGeometry} from './building.mjs';
const T=createRequire(import.meta.url)('./vendor/three.min.js');
const surfaces={material:()=>new T.MeshPhysicalMaterial()};
test('rounded furniture parts preserve specified outer dimensions',()=>{
  const g=softBox(T,2.4,.85,.9,.04);g.computeBoundingBox();const size=g.boundingBox.getSize(new T.Vector3());
  for(const [n,expected] of [[size.x,2.4],[size.y,.85],[size.z,.9]])assert.ok(Math.abs(n-expected)<1e-5);
  assert.ok([...g.attributes.position.array].every(Number.isFinite));g.dispose();
});
test('all furniture models have finite geometry and retain document dimensions',()=>{
  for(const entry of CATALOG){const item=newFurniture(entry.type,0,0),before=JSON.stringify(item),mesh=makeFurniture(T,item,surfaces),bounds=new T.Box3().setFromObject(mesh);assert.equal(JSON.stringify(item),before);assert.equal(mesh.userData.id,item.id);assert.ok(bounds.max.y>0);assert.ok(bounds.max.y<4);mesh.traverse(o=>{if(o.geometry){assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));o.geometry.dispose();}o.material?.dispose();});}
});
test('bed and wardrobe millimeter dimensions convert to meters',()=>{
  for(const type of ['bed','wardrobe']){const item=newFurniture(type,0,0),model=makeFurniture(T,item,surfaces),size=new T.Box3().setFromObject(model).getSize(new T.Vector3());assert.ok(Math.abs(size.x-item.width/1000)<.001);assert.ok(Math.abs(size.y-item.height/1000)<.001);}
});

test('rendered wall ray passes through door but hits lintel and solid wall',()=>{
  const wall={id:'w',x1:0,z1:0,x2:400,z2:0,thickness:20,height:3200};
  const doc={mmPerPixel:10,openings:[{id:'door',wallId:'w',type:'door',offset:2000,width:900,height:2100,sillHeight:0}]};
  const model=makeWall(T,wall,doc,surfaces);model.updateMatrixWorld(true);
  const hits=(x,y)=>new T.Raycaster(new T.Vector3(x,y,-1),new T.Vector3(0,0,1)).intersectObject(model,true);
  assert.equal(hits(2,1).length,0);assert.ok(hits(2,2.5).length);assert.ok(hits(.5,1).length);
  const size=new T.Box3().setFromObject(model).getSize(new T.Vector3());assert.ok(Math.abs(size.y-3.2)<1e-5);
  model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
test('concave floor triangulation leaves the missing corner empty',()=>{
  const polygon=[{x:0,z:0},{x:400,z:0},{x:400,z:100},{x:100,z:100},{x:100,z:400},{x:0,z:400}];
  const floor=new T.Mesh(roomGeometry(T,{polygon},.01,0,0),new T.MeshBasicMaterial({side:T.DoubleSide}));floor.updateMatrixWorld(true);
  const hits=(x,z)=>new T.Raycaster(new T.Vector3(x,2,z),new T.Vector3(0,-1,0)).intersectObject(floor);
  assert.ok(hits(.5,3).length);assert.ok(hits(3,.5).length);assert.equal(hits(3,3).length,0);
  floor.geometry.dispose();floor.material.dispose();
});

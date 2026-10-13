import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeFurniture} from './furniture.mjs';
import {softBox} from './surfaces.mjs';
import {CATALOG,newFurniture} from './core.mjs';
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

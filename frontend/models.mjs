export const MODEL_LIMIT=4*1024*1024;
const PREFIX='data:model/gltf-binary;base64,';
const supported=new Set(['KHR_materials_unlit','KHR_materials_pbrSpecularGlossiness','KHR_materials_clearcoat','KHR_materials_transmission','KHR_texture_transform','KHR_mesh_quantization','KHR_lights_punctual','EXT_texture_webp']);
export function modelBuffer(data){
  if(typeof data!=='string'||!data.startsWith(PREFIX)||data.length>PREFIX.length+Math.ceil(MODEL_LIMIT/3)*4)throw new Error('模型数据无效，单个 GLB 最大 4 MB。');
  const raw=data.slice(PREFIX.length);if(raw.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))throw new Error('模型编码无效。');
  return Uint8Array.from(atob(raw),c=>c.charCodeAt(0)).buffer;
}
export function inspectGLB(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20||buffer.byteLength>MODEL_LIMIT)throw new Error('请选择不超过 4 MB 的 GLB 文件。');
  const v=new DataView(buffer);
  if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==buffer.byteLength)throw new Error('仅支持 glTF 2.0 的 GLB 文件。');
  let json=null,bin=0;
  for(let p=12;p<buffer.byteLength;){
    if(p+8>buffer.byteLength)throw new Error('GLB 数据不完整。');
    const size=v.getUint32(p,true),type=v.getUint32(p+4,true);if(size%4||p+8+size>buffer.byteLength)throw new Error('GLB 数据块不完整。');
    if(p===12&&type!==0x4e4f534a)throw new Error('GLB 缺少描述数据。');
    if(type===0x4e4f534a){if(json)throw new Error('GLB 描述数据重复。');json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,p+8,size)));}
    if(type===0x004e4942)bin+=size;p+=8+size;
  }
  if(json?.asset?.version!=='2.0'||!json.meshes?.length)throw new Error('GLB 中没有可用模型。');
  if(json.skins?.length||json.meshes.some(m=>m.primitives?.some(p=>p.targets?.length)))throw new Error('暂不支持骨骼或变形模型，请导出静态 GLB。');
  if((json.extensionsUsed||[]).some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(e))||(json.extensionsRequired||[]).some(e=>!supported.has(e)))throw new Error('模型使用了暂不支持的压缩或扩展，请导出普通静态 GLB。');
  if(!Array.isArray(json.buffers)||json.buffers.length!==1||json.buffers[0].uri!==undefined||!Number.isInteger(json.buffers[0].byteLength)||json.buffers[0].byteLength<1||json.buffers[0].byteLength>bin)throw new Error('模型缓冲区必须内嵌在 GLB 中。');
  if((json.images||[]).some(i=>i.uri!==undefined||!Number.isInteger(i.bufferView)||!['image/png','image/jpeg','image/webp'].includes(i.mimeType)))throw new Error('贴图必须内嵌在 GLB 中，支持 PNG、JPEG、WebP。');
  if((json.nodes?.length||0)>2000||(json.meshes||[]).reduce((n,m)=>n+(m.primitives?.length||0),0)>500||(json.accessors||[]).some(a=>a.count>1000000)||(json.images?.length||0)>32)throw new Error('模型过于复杂，请精简后导入。');
  return json;
}
// Cache validation of immutable payloads; editing a dimension need not decode the GLB again.
const checked=new Map();
export function validateModels(models=[]){
  if(!Array.isArray(models)||models.length>12)throw new Error('方案最多保留 12 个自定义模型。');
  const ids=new Set();let bytes=0;
  for(const m of models){
    if(!m||typeof m.id!=='string'||!m.id.length||m.id.length>80||ids.has(m.id)||typeof m.name!=='string'||!m.name.length||m.name.length>40||!['width','height','depth'].every(k=>Number.isFinite(m[k])&&m[k]>=10&&m[k]<=10000))throw new Error('自定义模型信息不正确。');
    ids.add(m.id);
    if(!checked.has(m.data)){const b=modelBuffer(m.data);inspectGLB(b);if(checked.size>=12)checked.delete(checked.keys().next().value);checked.set(m.data,b.byteLength);}
    bytes+=checked.get(m.data);if(bytes>8*1024*1024)throw new Error('方案内 GLB 总大小不能超过 8 MB。');
  }
  return ids;
}
export function disposeModel(root){
  const resources=new Set();root.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});resources.forEach(r=>r.dispose());
}
export class ModelLibrary {
  constructor(T){this.T=T;this.cache=new Map();}
  load(asset){
    if(this.cache.has(asset.data))return this.cache.get(asset.data).promise;
    const T=this.T,buffer=modelBuffer(asset.data);inspectGLB(buffer);
    const entry={root:null,error:null};this.cache.set(asset.data,entry);
    const manager=new T.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:')&&!url.startsWith('data:'))throw new Error('模型不能加载外部资源。');return url;});
    entry.promise=new Promise((resolve,reject)=>new T.GLTFLoader(manager).parse(buffer,'',resolve,reject)).then(gltf=>{
      const scene=gltf.scene;scene.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
      if(![size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>.000001)){disposeModel(scene);throw new Error('模型尺寸无效，需要有宽、深、高的静态模型。');}
      scene.traverse(o=>{o.userData={modelShared:true};if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      // Imported cameras/lights do not alter the room's lighting or interaction.
      const extras=[];scene.traverse(o=>{if(o.isLight||o.isCamera)extras.push(o);});extras.forEach(o=>o.parent?.remove(o));
      const root=new T.Group();scene.position.sub(new T.Vector3(center.x,bounds.min.y,center.z));root.add(scene);root.scale.set(1/size.x,1/size.y,1/size.z);
      entry.root=root;entry.dimensions={width:Math.max(10,Math.min(10000,Math.round(size.x*1000))),height:Math.max(10,Math.min(10000,Math.round(size.y*1000))),depth:Math.max(10,Math.min(10000,Math.round(size.z*1000)))};
      if(this.cache.get(asset.data)!==entry)disposeModel(root);return entry;
    }).catch(error=>{entry.error=error;throw error;});
    return entry.promise;
  }
  instance(asset,item){
    const root=this.cache.get(asset?.data)?.root;if(!root)return null;
    const object=new this.T.Group();object.add(root.clone(true));object.scale.set(item.width/1000,item.height/1000,item.depth/1000);object.rotation.y=-item.rotation*Math.PI/180;object.userData={kind:'furniture',id:item.id};return object;
  }
  retain(assets){const keep=new Set(assets.map(a=>a.data));for(const [data,entry] of this.cache)if(!keep.has(data)){if(entry.root)disposeModel(entry.root);this.cache.delete(data);}}
}

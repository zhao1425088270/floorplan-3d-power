import {openingError,roomArea,polygonBounds,roomPolygon,isSimplePolygon,wallLength} from './plan.mjs';
import {validateModels} from './models.mjs';
import {validateFinishes} from './finishes.mjs';

export const CATALOG = [
  {type:'sofa',name:'三人沙发',category:'客厅',width:2400,depth:900,height:850,color:'#7f9f99'},
  {type:'armchair',name:'单人沙发',category:'客厅',width:850,depth:850,height:800,color:'#b6957c'},
  {type:'coffee',name:'茶几',category:'客厅',width:1200,depth:600,height:420,color:'#b99369'},
  {type:'tv',name:'电视柜',category:'客厅',width:2000,depth:400,height:500,color:'#b89c7c'},
  {type:'rug',name:'地毯',category:'客厅',width:2400,depth:1700,height:15,color:'#c8bca4'},
  {type:'plant',name:'绿植',category:'客厅',width:500,depth:500,height:1100,color:'#6b8c67'},
  {type:'bed',name:'双人床',category:'卧室',width:1800,depth:2100,height:650,color:'#91a5b8'},
  {type:'singlebed',name:'单人床',category:'卧室',width:1200,depth:2000,height:600,color:'#ad9cbb'},
  {type:'wardrobe',name:'衣柜',category:'卧室',width:1800,depth:600,height:2400,color:'#c2af92'},
  {type:'desk',name:'书桌',category:'卧室',width:1200,depth:600,height:750,color:'#bd9f78'},
  {type:'dining',name:'四人餐桌',category:'餐厨',width:1400,depth:800,height:750,color:'#ba946d'},
  {type:'chair',name:'餐椅',category:'餐厨',width:450,depth:500,height:850,color:'#a5b09a'},
  {type:'counter',name:'厨房地柜',category:'餐厨',width:1800,depth:600,height:850,color:'#b6c3c3'},
  {type:'fridge',name:'冰箱',category:'餐厨',width:700,depth:700,height:1800,color:'#c8d2d4'},
  {type:'toilet',name:'坐便器',category:'卫浴',width:420,depth:700,height:750,color:'#e3e7e3'},
  {type:'sink',name:'洗手台',category:'卫浴',width:800,depth:500,height:850,color:'#c5d6d5'},
  {type:'shower',name:'淋浴区',category:'卫浴',width:900,depth:900,height:2000,color:'#a3c5cb'},
];
export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const normalizeAngle = value => ((Number(value)%360)+360)%360;
export function emptyDocument() {
  return {version:1,title:'未命名方案',mmPerPixel:10,calibrated:false,image:null,
    plan:{walls:[],bounds:{x:0,y:0,width:1000,height:800},image_size:{width:1000,height:800}},
    furniture:[],rooms:[],measurements:[],openings:[],models:[],autoRooms:false};
}
export function newFurniture(type,x,z) {
  const entry = CATALOG.find(item => item.type===type);
  if (!entry) throw new Error('未知家具类型');
  return {...entry,id:uid(),x,z,rotation:0,elevation:0,locked:false};
}
export function newOpening(type,wall,offset,mmPerPixel){
  if(!['door','window'].includes(type))throw new Error('未知门窗类型');
  const length=wallLength(wall)*mmPerPixel,wallHeight=wall.height??3000;
  if(length<100)throw new Error('墙体过短，至少需要 100 mm 才能放置门窗。');
  const width=Math.min(type==='door'?900:1200,length),sillHeight=type==='door'?0:Math.min(900,wallHeight-100);
  return {id:uid(),type,wallId:wall.id,offset:Math.max(width/2,Math.min(length-width/2,offset)),width,height:Math.min(type==='door'?2100:1200,wallHeight-sillHeight),sillHeight};
}
export function distance(a,b) { return Math.hypot(a.x-b.x,a.z-b.z); }
export function snapPoint(point,mmPerPixel,enabled=true) {
  const step = 50/mmPerPixel;
  return enabled ? {x:Math.round(point.x/step)*step,z:Math.round(point.z/step)*step} : point;
}
export function snapFurniture(item,doc,grid=true,wallSnap=true) {
  const point = snapPoint({x:item.x,z:item.z},doc.mmPerPixel,grid);
  if (!wallSnap) return point;
  const rad = item.rotation*Math.PI/180;
  const halfX = (Math.abs(Math.cos(rad))*item.width+Math.abs(Math.sin(rad))*item.depth)/(2*doc.mmPerPixel);
  const halfZ = (Math.abs(Math.sin(rad))*item.width+Math.abs(Math.cos(rad))*item.depth)/(2*doc.mmPerPixel);
  const threshold = 120/doc.mmPerPixel;
  let bestX=threshold,bestZ=threshold;
  for (const wall of doc.plan.walls) {
    const halfT = (wall.thickness||12)/2;
    if (Math.abs(wall.x2-wall.x1)<0.01 && point.z>=Math.min(wall.z1,wall.z2) && point.z<=Math.max(wall.z1,wall.z2)) {
      for (const side of [-1,1]) {
        const x=wall.x1+side*(halfX+halfT), delta=Math.abs(x-point.x);
        if(delta<bestX) { point.x=x; bestX=delta; }
      }
    }
    if (Math.abs(wall.z2-wall.z1)<0.01 && point.x>=Math.min(wall.x1,wall.x2) && point.x<=Math.max(wall.x1,wall.x2)) {
      for (const side of [-1,1]) {
        const z=wall.z1+side*(halfZ+halfT), delta=Math.abs(z-point.z);
        if(delta<bestZ) { point.z=z; bestZ=delta; }
      }
    }
  }
  return point;
}
export function calibration(a,b,millimeters) {
  const pixels=distance(a,b);
  if(pixels<2 || !Number.isFinite(millimeters) || millimeters<=0 || millimeters>1000000) throw new Error('请选择两个不同的点，并输入有效的实际长度。');
  const factor=millimeters/pixels;
  if(factor<0.1 || factor>1000) throw new Error('标定比例超出范围，请检查输入长度和所选单位是否匹配。');
  return factor;
}
export function createCalibration(a,b,length,unit='mm') {
  const multiplier={mm:1,cm:10,m:1000}[unit];
  if(!Number.isFinite(multiplier)||!Number.isFinite(length)||length<=0)throw new Error('请输入原图标注的实际长度，并检查单位。');
  if(![a,b].every(p=>p&&['x','z'].every(k=>number(p[k],-100000,100000))))throw new Error('请先在原图上选取两个参考端点。');
  const millimeters=length*multiplier;
  return {mmPerPixel:calibration(a,b,millimeters),reference:{start:{x:a.x,z:a.z},end:{x:b.x,z:b.z},millimeters}};
}
export class History {
  constructor(limit=60) { this.past=[]; this.future=[]; this.limit=limit; }
  push(before,after) {
    if(JSON.stringify(before)===JSON.stringify(after)) return false;
    this.past.push(clone(before)); if(this.past.length>this.limit) this.past.shift();
    this.future=[]; return true;
  }
  undo(current) { if(!this.past.length)return null; this.future.push(clone(current)); return this.past.pop(); }
  redo(current) { if(!this.future.length)return null; this.past.push(clone(current)); return this.future.pop(); }
}
function number(value,min,max) { return typeof value==='number' && Number.isFinite(value) && value>=min && value<=max; }
export function validateDocument(value) {
  if(!value || value.version!==1 || !value.plan || !Array.isArray(value.plan.walls) || !Array.isArray(value.furniture)) throw new Error('不是受支持的家装方案文件。');
  const d=clone(value), bounds=d.plan.bounds;
  if(!number(d.mmPerPixel,0.1,1000) || !bounds || !['x','y'].every(k=>number(bounds[k],-100000,100000)) || !['width','height'].every(k=>number(bounds[k],1,100000))) throw new Error('方案比例或范围不正确。');
  if(d.calibrationReference!==undefined){
    const r=d.calibrationReference;if(!r)throw new Error('标定参考线不正确。');
    const c=createCalibration(r.start,r.end,r.millimeters);
    if(!d.calibrated||Math.abs(c.mmPerPixel-d.mmPerPixel)>1e-6)throw new Error('标定参考线与方案比例不一致，请重新标定。');
  }
  if(!d.plan.image_size || !['width','height'].every(k=>number(d.plan.image_size[k],1,100000))) throw new Error('图片尺寸不正确。');
  if(d.plan.walls.length>3000 || d.furniture.length>500) throw new Error('方案包含过多对象。');
  d.rooms ??= []; d.measurements ??= []; d.openings ??= []; d.models ??= []; d.autoRooms=!!d.autoRooms;
  const modelIds=validateModels(d.models);
  if(!Array.isArray(d.rooms) || !Array.isArray(d.measurements) || d.rooms.length>200 || d.measurements.length>500) throw new Error('区域或测量数据不正确。');
  if(!Array.isArray(d.openings)||d.openings.length>500)throw new Error('门窗最多支持 500 个。');
  if(d.autoRooms&&d.plan.walls.length>600)throw new Error('自动房间模式最多支持 600 段墙。');
  const ids=new Set();
  for(const item of [...d.plan.walls,...d.furniture,...d.rooms,...d.measurements,...d.openings]) {
    if(!item||typeof item.id!=='string' || ids.has(item.id)) throw new Error('方案对象编号不正确。');
    ids.add(item.id);
  }
  for(const wall of d.plan.walls) if(!['x1','z1','x2','z2'].every(k=>number(wall[k],-100000,100000)) || !number(wall.thickness,0.1,10000) || Math.hypot(wall.x2-wall.x1,wall.z2-wall.z1)<0.1) throw new Error('墙体数据不正确。');
  for(const wall of d.plan.walls){
    if(wall.height!==undefined&&!number(wall.height,100,10000))throw new Error('墙高应为 100–10000 mm。');
    if(wall.bearing!==undefined&&typeof wall.bearing!=='boolean')throw new Error('墙体标记不正确。');
  }
  for(const opening of d.openings){const error=openingError(opening,d);if(error)throw new Error(error);}
  for(const o of d.openings){
    if(o.hinge!==undefined&&!['start','end'].includes(o.hinge))throw new Error('门窗铰链位置不正确。');
    if(o.swing!==undefined&&![1,-1].includes(o.swing))throw new Error('门窗开启侧不正确。');
    if(o.openAngle!==undefined&&!number(o.openAngle,0,90))throw new Error('门窗开启角度应为 0–90°。');
  }
  for(const item of d.furniture) {
    if(!(item.type==='model'?modelIds.has(item.modelId):CATALOG.some(entry=>entry.type===item.type)) || !['width','depth','height'].every(k=>number(item[k],10,10000)) || !['x','z'].every(k=>number(item[k],-100000,100000)) || !number(item.rotation,-36000,36000) || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error('家具尺寸、类型或模型引用不正确。');
    item.rotation=normalizeAngle(item.rotation); item.name=String(item.name||'家具').slice(0,40); item.locked=!!item.locked;
    if(item.elevation!==undefined&&!number(item.elevation,0,10000))throw new Error('家具离地高度应为 0–10000 mm。');
    if(item.groupId!==undefined&&(typeof item.groupId!=='string'||!item.groupId.length||item.groupId.length>80))throw new Error('家具组合编号不正确。');
  }
  for(const room of d.rooms) {
    if(room.polygon!==undefined){
      if(!Array.isArray(room.polygon)||room.polygon.length<3||room.polygon.length>1200||!room.polygon.every(p=>p&&number(p.x,-100000,100000)&&number(p.z,-100000,100000))||roomArea(room)<1||!isSimplePolygon(room.polygon))throw new Error('房间轮廓不正确，轮廓不能自交。');
      Object.assign(room,polygonBounds(roomPolygon(room)));
    }
    if(!['x','z'].every(k=>number(room[k],-100000,100000)) || !['width','depth'].every(k=>number(room[k],1,100000)) || !['wood','tile','plain'].includes(room.material)) throw new Error('房间区域数据不正确。');
    if(room.source==='walls'&&(!room.polygon||!Array.isArray(room.wallIds)||!room.wallIds.every(id=>d.plan.walls.some(w=>w.id===id))))throw new Error('房间关联墙体不正确。');
    room.name=String(room.name||'房间').slice(0,40);
  }
  for(const m of d.measurements) if(!['x1','z1','x2','z2'].every(k=>number(m[k],-100000,100000))) throw new Error('测量数据不正确。');
  if(d.image!==null && (typeof d.image!=='string' || d.image.length>12000000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.image))) throw new Error('方案底图格式不正确。');
  d.title=String(d.title||'家装方案').slice(0,80); d.calibrated=!!d.calibrated;
  validateFinishes(d);
  if(d.models.length&&new TextEncoder().encode(JSON.stringify(d)).length>15*1024*1024)throw new Error('方案总大小超过 15 MB，请减少底图或模型大小。');
  return d;
}
export function demoDocument() {
  const d=emptyDocument(); d.title='两室一厅 · 示例方案'; d.calibrated=true;
  const segments=[[100,100,1080,100],[1080,100,1080,820],[1080,820,100,820],[100,820,100,100],[680,100,680,820],[680,480,1080,480],[100,540,680,540],[410,540,410,820]];
  d.plan.walls=segments.map((s,i)=>({id:`wall-${i}`,...Object.fromEntries(['x1','z1','x2','z2'].map((k,n)=>[k,s[n]])),thickness:16}));
  d.plan.bounds={x:92,y:92,width:996,height:736}; d.plan.image_size={width:1180,height:920};
  d.rooms=[{id:'r1',name:'客厅',x:108,z:108,width:564,depth:424,material:'wood'},{id:'r2',name:'主卧',x:688,z:108,width:384,depth:364,material:'wood'},{id:'r3',name:'次卧',x:688,z:488,width:384,depth:324,material:'wood'},{id:'r4',name:'厨房',x:108,z:548,width:294,depth:264,material:'tile'},{id:'r5',name:'卫生间',x:418,z:548,width:254,depth:264,material:'tile'}];
  const opening=(type,wall,offset,width)=>{const item=newOpening(type,d.plan.walls[wall],offset,d.mmPerPixel);item.width=width;d.openings.push(item);};
  opening('door',3,4800,1000);opening('door',4,2200,900);opening('door',5,1650,900);opening('door',6,1300,900);opening('door',6,4200,850);
  opening('window',0,3100,1800);opening('window',0,7750,1600);opening('window',1,5500,1400);
  const put=(type,x,z,rotation=0,overrides={})=>{const f=newFurniture(type,x,z);Object.assign(f,{rotation},overrides);d.furniture.push(f);};
  put('rug',365,330,0,{width:2800,depth:1900,color:'#d6e6f8'});
  put('sofa',365,465,0,{color:'#b7d5f5'});put('coffee',365,320,0,{color:'#f5f6f7'});
  put('tv',310,155,0,{color:'#f4f2ed'});put('armchair',590,270,0,{color:'#f4f2ed'});put('plant',625,155);
  put('bed',875,260,0,{color:'#f2f3f5'});put('wardrobe',1030,345,90,{color:'#f4f2ed'});
  put('singlebed',970,670,0,{color:'#f2f3f5'});put('desk',745,685,90,{color:'#f4f2ed'});put('plant',760,570);
  put('counter',255,775,0,{width:2600,color:'#f3f5f5'});put('fridge',155,625,0,{color:'#f3f5f5'});
  put('toilet',470,745);put('sink',610,605);put('shower',605,750);
  return d;
}

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
    furniture:[],rooms:[],measurements:[]};
}
export function newFurniture(type,x,z) {
  const entry = CATALOG.find(item => item.type===type);
  if (!entry) throw new Error('未知家具类型');
  return {...entry,id:uid(),x,z,rotation:0,locked:false};
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
  if(factor<0.1 || factor>1000) throw new Error('标定比例超出范围，请检查长度单位是否为毫米。');
  return factor;
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
  if(!d.plan.image_size || !['width','height'].every(k=>number(d.plan.image_size[k],1,100000))) throw new Error('图片尺寸不正确。');
  if(d.plan.walls.length>3000 || d.furniture.length>500) throw new Error('方案包含过多对象。');
  d.rooms ||= []; d.measurements ||= [];
  if(!Array.isArray(d.rooms) || !Array.isArray(d.measurements) || d.rooms.length>200 || d.measurements.length>500) throw new Error('区域或测量数据不正确。');
  const ids=new Set();
  for(const item of [...d.plan.walls,...d.furniture,...d.rooms,...d.measurements]) {
    if(typeof item.id!=='string' || ids.has(item.id)) throw new Error('方案对象编号不正确。');
    ids.add(item.id);
  }
  for(const wall of d.plan.walls) if(!['x1','z1','x2','z2'].every(k=>number(wall[k],-100000,100000)) || !number(wall.thickness,0.1,10000) || Math.hypot(wall.x2-wall.x1,wall.z2-wall.z1)<0.1) throw new Error('墙体数据不正确。');
  for(const item of d.furniture) {
    if(!CATALOG.some(entry=>entry.type===item.type) || !['width','depth','height'].every(k=>number(item[k],10,10000)) || !['x','z'].every(k=>number(item[k],-100000,100000)) || !number(item.rotation,-36000,36000) || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error('家具尺寸或类型不正确。');
    item.rotation=normalizeAngle(item.rotation); item.name=String(item.name||'家具').slice(0,40); item.locked=!!item.locked;
  }
  for(const room of d.rooms) {
    if(!['x','z'].every(k=>number(room[k],-100000,100000)) || !['width','depth'].every(k=>number(room[k],1,100000)) || !['wood','tile','plain'].includes(room.material)) throw new Error('房间区域数据不正确。');
    room.name=String(room.name||'房间').slice(0,40);
  }
  for(const m of d.measurements) if(!['x1','z1','x2','z2'].every(k=>number(m[k],-100000,100000))) throw new Error('测量数据不正确。');
  if(d.image!==null && (typeof d.image!=='string' || d.image.length>12000000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.image))) throw new Error('方案底图格式不正确。');
  d.title=String(d.title||'家装方案').slice(0,80); d.calibrated=!!d.calibrated;
  return d;
}
export function demoDocument() {
  const d=emptyDocument(); d.title='三室家装 · 示例方案'; d.calibrated=true;
  const segments=[[80,80,820,80],[820,80,820,660],[820,660,80,660],[80,660,80,80],[330,80,330,320],[80,320,250,320],[300,320,560,320],[560,80,560,420],[620,320,820,320],[560,420,680,420],[740,420,820,420],[330,380,330,500],[80,500,250,500]];
  d.plan.walls=segments.map((s,i)=>({id:`wall-${i}`,...Object.fromEntries(['x1','z1','x2','z2'].map((k,n)=>[k,s[n]])),thickness:18}));
  d.plan.bounds={x:70,y:70,width:760,height:600}; d.plan.image_size={width:900,height:750};
  d.rooms=[{id:'r1',name:'主卧',x:90,z:90,width:230,depth:220,material:'wood'},{id:'r2',name:'次卧',x:340,z:90,width:210,depth:220,material:'wood'},{id:'r3',name:'儿童房',x:570,z:90,width:240,depth:220,material:'wood'},{id:'r4',name:'卫浴',x:570,z:330,width:240,depth:80,material:'tile'},{id:'r5',name:'厨房',x:90,z:330,width:230,depth:160,material:'tile'},{id:'r6',name:'客餐厅',x:340,z:430,width:470,depth:220,material:'wood'}];
  const put=(type,x,z,rotation=0)=>{const f=newFurniture(type,x,z);f.rotation=rotation;d.furniture.push(f);};
  put('bed',195,203); put('singlebed',432,208); put('singlebed',690,210); put('wardrobe',196,120);
  put('sofa',650,588); put('coffee',650,495); put('rug',650,530); put('tv',650,446); put('dining',398,557); put('chair',398,478); put('chair',398,631,180); put('counter',178,374); put('fridge',268,441); put('toilet',616,365); put('sink',746,367); put('plant',786,609);
  return d;
}

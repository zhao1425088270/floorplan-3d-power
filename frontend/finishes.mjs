export const FINISHES=[['plaster','涂料'],['wood','木饰面'],['tile','瓷砖']];
export const wallFinish=(wall,side)=>wall[side+'Finish']||{material:'plaster',color:'#f0ece3'};
export const skirting=wall=>({enabled:true,height:85,color:'#d4c8b5',...wall.skirting});
export const ceiling=room=>({enabled:true,drop:0,color:'#f7f4ef',...room.ceiling});
export function roomHeight(room,doc){const walls=doc.plan.walls.filter(w=>room.wallIds?.includes(w.id));return walls.length?Math.min(...walls.map(w=>w.height??3000)):3000;}
export function validateFinishes(doc){
  const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v),range=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  for(const w of doc.plan.walls){
    for(const side of ['left','right'])if(w[side+'Finish']!==undefined){const f=w[side+'Finish'];if(!f||!FINISHES.some(([k])=>k===f.material)||!color(f.color))throw new Error('墙面材质或颜色不正确。');}
    if(w.skirting!==undefined){const s=w.skirting;if(!s||typeof s.enabled!=='boolean'||!range(s.height,20,300)||!color(s.color))throw new Error('踢脚线高度应为 20–300 mm，并设置有效颜色。');}
  }
  for(const r of doc.rooms){
    if(r.floorAngle!==undefined&&!range(r.floorAngle,0,360))throw new Error('地面铺贴方向应为 0–360°。');
    if(r.ceiling!==undefined){const c=r.ceiling;if(!c||typeof c.enabled!=='boolean'||!range(c.drop,0,1000)||!color(c.color)||c.enabled&&c.drop>=roomHeight(r,doc))throw new Error('天花降高应为 0–1000 mm，且必须低于房间墙高。');}
  }
}

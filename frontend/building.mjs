import {wallSections,wallLength,roomPolygon} from './plan.mjs';

export function makeWall(T,wall,doc,surfaces,low=false,selectedId=null){
  const group=new T.Group(),length=wallLength(wall)*doc.mmPerPixel,depth=wall.thickness*doc.mmPerPixel/1000;
  const height=low?Math.min(650,wall.height??3000):wall.height??3000;
  group.userData={kind:'wall',id:wall.id};group.rotation.y=-Math.atan2(wall.z2-wall.z1,wall.x2-wall.x1);
  const box=(parent,w,h,d,x,y,z,kind,color)=>{
    if(w<=0||h<=0||d<=0)return;
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),surfaces.material(kind,color));
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  for(const piece of wallSections(wall,doc.openings,doc.mmPerPixel,height)){
    const left=piece.start===0?depth/2:0,right=piece.end===length?depth/2:0;
    box(group,(piece.end-piece.start)/1000+left+right,(piece.top-piece.bottom)/1000,depth,(piece.start+piece.end)/2000+(right-left)/2,(piece.top+piece.bottom)/2000,0,'plaster',selectedId===wall.id?'#dec19e':'#f0ece3');
  }
  for(const piece of wallSections(wall,doc.openings,doc.mmPerPixel,Math.min(height,85))){
    box(group,(piece.end-piece.start)/1000,(piece.top-piece.bottom)/1000,depth+.016,(piece.start+piece.end)/2000,(piece.top+piece.bottom)/2000,0,'wood','#d4c8b5');
  }
  for(const o of doc.openings.filter(o=>o.wallId===wall.id)){
    const bottom=o.sillHeight/1000,top=Math.min(height,o.sillHeight+o.height)/1000;if(top<=bottom)continue;
    const frame=new T.Group();frame.userData={kind:'opening',id:o.id};frame.position.x=o.offset/1000;group.add(frame);
    const width=o.width/1000,h=top-bottom,rail=Math.min(.05,width/4,h/4),color=selectedId===o.id?'#c9874c':o.type==='door'?'#b29a7d':'#edf0e9';
    for(const side of [-1,1])box(frame,rail,h,depth+.025,side*(width-rail)/2,bottom+h/2,0,'wood',color);
    if(o.sillHeight+o.height<=height)box(frame,width,rail,depth+.025,0,top-rail/2,0,'wood',color);
    if(o.type==='window'){
      box(frame,width,rail,depth+.025,0,bottom+rail/2,0,'wood',color);
      box(frame,rail,h,.035,0,bottom+h/2,0,'metal',color);
      const glass=new T.Mesh(new T.BoxGeometry(Math.max(.001,width-2*rail),Math.max(.001,h-2*rail),.008),new T.MeshPhysicalMaterial({color:0xadcfd8,transparent:true,opacity:.22,roughness:.08,depthWrite:false}));
      glass.position.y=bottom+h/2;frame.add(glass);
    }else{
      // Open leaf matches the swing symbol in plan view and leaves the passage visible.
      box(frame,.035,Math.max(.001,h-rail),Math.max(.001,width-2*rail),-width/2+rail,bottom+(h-rail)/2,(width-2*rail)/2,'wood',color);
    }
  }
  return group;
}

export function roomGeometry(T,room,scale,cx,cz){
  const shape=new T.Shape(),points=roomPolygon(room);
  points.forEach((p,i)=>{const x=(p.x-cx)*scale,y=-(p.z-cz)*scale;i?shape.lineTo(x,y):shape.moveTo(x,y);});shape.closePath();
  const geometry=new T.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);
  return geometry;
}

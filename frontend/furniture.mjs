import {softBox} from './surfaces.mjs';
// Original procedural symbols and models; no third-party furniture assets.
export function furnitureSymbol(type,color) {
  const rect=(x,y,w,h,fill=color,rx=3)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
  const line=(x1,y1,x2,y2)=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none"/>`;
  let art=rect(1,1,98,98);
  if(['bed','singlebed'].includes(type)) art=rect(1,1,98,98)+rect(5,6,90,90,'#f3f1e9')+rect(8,29,84,63,color)+rect(10,9,35,17,'#ffffff')+rect(54,9,35,17,'#ffffff')+line(8,40,92,40);
  if(['sofa','armchair'].includes(type)) art=rect(1,1,98,98)+rect(13,28,74,58,'#e0e7df')+rect(2,28,12,69)+rect(86,28,12,69)+line(38,28,38,86)+line(62,28,62,86);
  if(['coffee','dining','desk','counter','tv','wardrobe','fridge'].includes(type)) {
    art=rect(1,1,98,98)+rect(5,5,90,90,color,1);
    if(['wardrobe','counter','tv'].includes(type)) art+=line(33,5,33,95)+line(66,5,66,95);
    if(type==='fridge')art+=line(5,28,95,28);
    if(type==='desk')art+=rect(23,8,54,25,'#d7e4e7')+rect(32,39,36,9,'#e4e5de');
  }
  if(type==='rug') art=rect(1,1,98,98,color,1)+`<rect x="6" y="6" width="88" height="88" fill="none" stroke-dasharray="4 3"/>`;
  if(type==='chair') art=rect(10,12,80,76)+rect(10,4,80,18,'#e3e8da')+rect(17,27,66,55,color);
  if(type==='plant') art=`<circle cx="50" cy="50" r="38" fill="${color}"/>`+Array.from({length:7},(_,i)=>`<ellipse cx="50" cy="32" rx="13" ry="24" fill="${i%2?'#6e956a':'#91ac78'}" transform="rotate(${i*360/7} 50 50)"/>`).join('');
  if(type==='toilet')art=rect(17,2,66,26,'#eff3ef')+`<ellipse cx="50" cy="62" rx="33" ry="35" fill="${color}"/><ellipse cx="50" cy="59" rx="21" ry="24" fill="#f7faf8"/>`;
  if(type==='sink')art=rect(1,1,98,98)+rect(14,17,72,67,'#f8faf7',16)+`<circle cx="50" cy="50" r="4" fill="#697c7e"/>`+line(50,5,50,25);
  if(type==='shower')art=rect(1,1,98,98,'#d5e9ec',1)+line(5,5,95,95)+line(95,5,5,95)+`<circle cx="50" cy="50" r="6" fill="#7ba0a9"/>`;
  return `<g stroke="#53665f" stroke-width="1.3" stroke-linejoin="round">${art}</g>`;
}

export function makeFurniture(THREE,item,surfaces) {
  const group=new THREE.Group(), w=item.width/1000,d=item.depth/1000,h=item.height/1000;
  const material=color=>new THREE.MeshStandardMaterial({color:new THREE.Color(color).convertSRGBToLinear(),roughness:.8});
  const upholstered=['bed','singlebed','sofa','armchair','chair','rug'].includes(item.type);
  const body=surfaces.material(upholstered?'fabric':['fridge','shower'].includes(item.type)?'metal':['toilet','sink'].includes(item.type)?'ceramic':'wood',item.color),light=surfaces.material(upholstered?'fabric':'ceramic','#f5f1e9'),dark=surfaces.material('wood','#77614b');
  const box=(x,y,z,sx,sy,sz,mat=body)=>{
    const mesh=new THREE.Mesh(softBox(THREE,Math.max(.005,sx),Math.max(.005,sy),Math.max(.005,sz),upholstered?.045:.012),mat.clone());
    mesh.position.set(x,y,z); mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const legs=top=>{for(const x of [-w*.39,w*.39])for(const z of [-d*.37,d*.37])box(x,top/2,z,.04,top,.04,dark);};
  switch(item.type) {
    case 'bed': case 'singlebed':
      legs(h*.1);
      box(0,h*.28,0,w,h*.4,d,dark);box(0,h*.60,0,w*.96,h*.3,d*.96,light);
      box(0,h*.78,d*.1,w*.96,h*.08,d*.7);
      box(0,h*.65,-d*.48,w,h*.7,d*.06);
      for(const x of (item.type==='singlebed'?[0]:[-w*.23,w*.23]))box(x,h*.85,-d*.31,item.type==='singlebed'?w*.70:w*.39,h*.18,d*.22,light);
      box(0,h*.84,d*.30,w*.965,h*.025,d*.19,light);
      break;
    case 'sofa': case 'armchair':
      legs(h*.18);box(0,h*.38,0,w,h*.35,d);
      box(0,h*.75,-d*.42,w,h*.5,d*.17);
      for(const x of [-w*.45,w*.45])box(x,h*.58,0,w*.10,h*.45,d);
      for(let i=0;i<(item.type==='sofa'?3:1);i++) {
        const n=item.type==='sofa'?3:1;
        box((i-(n-1)/2)*w*.78/n,h*.6,d*.05,w*.75/n,h*.16,d*.67,body);
        const cushion=box((i-(n-1)/2)*w*.78/n,h*.78,-d*.24,w*.73/n,h*.32,d*.16,light);cushion.rotation.x=-.12;
      }
      break;
    case 'coffee': case 'dining': case 'desk':
      legs(h*.9);box(0,h*.95,0,w,h*.1,d);
      if(item.type==='desk')box(0,h*1.17,-d*.27,w*.40,h*.30,.04,dark);
      break;
    case 'chair':
      legs(h*.48);box(0,h*.50,0,w,h*.1,d);box(0,h*.77,-d*.44,w,h*.46,d*.09);break;
    case 'wardrobe': case 'counter': case 'tv': case 'fridge':
      box(0,h/2,0,w,h,d);
      for(let i=0;i<3;i++) {box((i-1)*w*.326,h*.50,d*.505,w*.312,h*.94,.015,body);box((i-1)*w*.326+w*.12,h*.57,d*.525,.013,h*.12,.022,dark);}
      if(item.type==='counter')box(0,h+.02,0,w+.03,.04,d+.02,light);
      if(item.type==='tv'){const screen=surfaces.material('metal','#26353a');screen.roughness=.12;box(0,h+.40,-d*.24,w*.65,.68,.035,screen);box(0,h+.055,-d*.24,w*.28,.025,d*.38,dark);screen.dispose();}
      break;
    case 'rug':box(0,h/2,0,w,h,d);break;
    case 'plant': {
      const pot=new THREE.Mesh(new THREE.CylinderGeometry(w*.32,w*.24,h*.3,18),material('#d1b69a'));pot.position.y=h*.15;group.add(pot);
      for(let i=0;i<7;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(w*.27,12,8),body.clone());leaf.scale.set(1,1.3,1);leaf.position.set(Math.cos(i)*w*.19,h*.65+Math.sin(i*2)*h*.13,Math.sin(i)*d*.19);leaf.castShadow=true;group.add(leaf);}break;
    }
    case 'toilet':
      box(0,h*.72,-d*.32,w*.88,h*.55,d*.28,light);box(0,h*.25,d*.08,w*.65,h*.48,d*.61,light);
      {const seat=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.07,24),light.clone());seat.scale.set(w*.5,1,d*.36);seat.position.set(0,h*.5,d*.1);group.add(seat);}break;
    case 'sink':
      box(0,h*.46,0,w,h*.92,d);box(0,h*.97,0,w,.05,d,light);box(0,h*1.07,-d*.32,.04,h*.16,.04,dark);break;
    case 'shower': {
      box(0,.025,0,w,.05,d,light);
      const glass=new THREE.MeshStandardMaterial({color:0xafd3da,transparent:true,opacity:.25,roughness:.15,side:THREE.DoubleSide});
      box(-w/2,h/2,0,.015,h,d,glass);box(0,h/2,-d/2,w,h,.015,glass);
      for(const x of [-w/2,w/2])box(x,h/2,-d/2,.02,h,.02,dark);glass.dispose();break;
    }
    default:box(0,h/2,0,w,h,d);
  }
  body.dispose();light.dispose();dark.dispose();
  group.rotation.y=-item.rotation*Math.PI/180;
  group.userData={id:item.id,kind:'furniture'};
  return group;
}

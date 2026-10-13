// Deterministic procedural surfaces; no external image or model assets.
export class Surfaces {
  constructor(T,renderer){this.T=T;this.renderer=renderer;this.maps={};this.owned=new Set();}
  texture(kind){
    if(this.maps[kind])return this.maps[kind];
    const T=this.T,canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const c=canvas.getContext('2d');let seed=187;
    const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    if(kind==='wood'){
      c.fillStyle='#e5d1b2';c.fillRect(0,0,512,512);
      for(let row=0;row<8;row++){
        const y=row*64,shade=Math.floor(rand()*15);c.fillStyle=`rgb(${218+shade},${195+shade},${159+shade})`;c.fillRect(0,y,512,64);
        for(let i=0;i<70;i++){c.strokeStyle=`rgba(107,73,39,${.025+rand()*.075})`;c.lineWidth=.5+rand();c.beginPath();const yy=y+rand()*64;for(let x=0;x<=512;x+=8){const v=yy+Math.sin(x/57+i)*1.6+Math.sin(x/19+i)*.5;x?c.lineTo(x,v):c.moveTo(x,v);}c.stroke();}
        c.fillStyle='rgba(76,58,34,.22)';c.fillRect(0,y,512,1);c.fillRect((row%3)*171,y,1,64);
      }
    }else if(kind==='tile'){
      c.fillStyle='#e6e4df';c.fillRect(0,0,512,512);
      for(let i=0;i<7000;i++){const g=140+Math.floor(rand()*90);c.fillStyle=`rgba(${g},${g},${g},.08)`;c.fillRect(rand()*512,rand()*512,rand()*6,1);}
      for(let i=0;i<7;i++){c.strokeStyle='rgba(128,133,130,.09)';c.lineWidth=rand()*2+1;c.beginPath();c.moveTo(rand()*512,0);c.bezierCurveTo(rand()*512,170,rand()*512,320,rand()*512,512);c.stroke();}
      c.strokeStyle='#c1c1ba';c.lineWidth=2;c.strokeRect(0,0,512,512);
    }else{
      c.fillStyle=kind==='fabric'?'#e4e3de':'#f1efea';c.fillRect(0,0,512,512);
      for(let y=0;y<512;y+=2)for(let x=0;x<512;x+=2){const n=rand()*40+190;c.fillStyle=`rgba(${n},${n},${n},.25)`;c.fillRect(x,y,1,kind==='fabric'?3:1);}
    }
    const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.encoding=T.sRGBEncoding;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    this.maps[kind]=texture;this.owned.add(texture);return texture;
  }
  material(kind,color='#ffffff'){
    const T=this.T,options={color:new T.Color(color).convertSRGBToLinear(),roughness:.65,envMapIntensity:.65};
    if(['wood','tile','fabric','plaster'].includes(kind)){options.map=this.texture(kind);options.bumpMap=options.map;options.bumpScale=kind==='fabric'?.008:kind==='wood'?.007:.0006;}
    if(kind==='fabric')options.roughness=.95;
    if(kind==='wood')options.roughness=.48;
    if(kind==='tile'){options.roughness=.3;options.clearcoat=.25;options.clearcoatRoughness=.25;}
    if(kind==='metal'){options.metalness=.8;options.roughness=.28;}
    if(kind==='ceramic'){options.roughness=.18;options.clearcoat=.4;}
    return new T.MeshPhysicalMaterial(options);
  }
  environment(){
    const T=this.T,c=document.createElement('canvas');c.width=1024;c.height=512;const ctx=c.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,0,512);gradient.addColorStop(0,'#dfe9f4');gradient.addColorStop(.48,'#fcf9f0');gradient.addColorStop(.55,'#d5cec0');gradient.addColorStop(1,'#777e7d');ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,512);
    ctx.fillStyle='#ffffff';ctx.fillRect(95,80,130,160);ctx.fillRect(650,100,170,130);
    const texture=new T.CanvasTexture(c);texture.mapping=T.EquirectangularReflectionMapping;texture.encoding=T.sRGBEncoding;
    const generator=new T.PMREMGenerator(this.renderer),target=generator.fromEquirectangular(texture);generator.dispose();texture.dispose();this.envTarget=target;return target.texture;
  }
}

export function softBox(T,w,h,d,r=.02){
  r=Math.min(r,w*.18,h*.18,d*.18);
  const shape=new T.Shape(),x=w/2-r,y=h/2-r;
  shape.moveTo(-x,-y);shape.lineTo(x,-y);shape.lineTo(x,y);shape.lineTo(-x,y);shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:Math.max(.001,d-2*r),bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:3,steps:1,curveSegments:1});
  geometry.translate(0,0,-d/2+r);geometry.computeVertexNormals();return geometry;
}

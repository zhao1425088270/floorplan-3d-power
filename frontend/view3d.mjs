import {WalkControls} from './walk.mjs';
import {makeFurniture} from './furniture.mjs';
import {Surfaces} from './surfaces.mjs';
const T=window.THREE;
export class View3D {
  constructor(element,onSelect){
    this.element=element;this.low=false;this.doc=null;this.mode='iso';this.quality=true;this.dirty=true;this.lighting='day';
    this.scene=new T.Scene();this.scene.background=new T.Color('#e8e7e2');
    this.renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputEncoding=T.sRGBEncoding;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;element.append(this.renderer.domElement);
    this.surfaces=new Surfaces(T,this.renderer);this.scene.environment=this.surfaces.environment();
    this.hemi=new T.HemisphereLight(0xe9f1ff,0xb1a18e,.45);this.scene.add(this.hemi);
    this.sun=new T.DirectionalLight(0xfff0d9,1.2);this.sun.position.set(-6,12,5);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.normalBias=.025;this.sun.shadow.bias=-.00015;this.sun.shadow.radius=3;this.scene.add(this.sun);
    this.fill=new T.DirectionalLight(0xcde1f3,.22);this.fill.position.set(8,6,-6);this.scene.add(this.fill);
    this.root=new T.Group();this.scene.add(this.root);this.ceilings=new T.Group();this.scene.add(this.ceilings);this.roomLights=new T.Group();this.scene.add(this.roomLights);
    this.ground=new T.Mesh(new T.PlaneGeometry(200,200),this.surfaces.material('plaster','#d4d6d2'));this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.13;this.ground.receiveShadow=true;this.scene.add(this.ground);
    this.setCamera(new T.OrthographicCamera(-10,10,10,-10,.05,200));
    this.composer=new T.EffectComposer(this.renderer);this.ao=new T.SSAOPass(this.scene,this.camera,512,512);this.ao.kernelRadius=.18;this.ao.minDistance=.0001;this.ao.maxDistance=.006;
    this.composer.addPass(this.ao);this.composer.addPass(new T.ShaderPass(T.GammaCorrectionShader));
    new ResizeObserver(()=>this.resize()).observe(element);
    this.ray=new T.Raycaster();let down;
    element.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
    element.addEventListener('pointerup',e=>{
      if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
      const b=element.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),this.camera);
      for(const hit of this.ray.intersectObjects(this.root.children,true)){let o=hit.object;while(o&&!o.userData.id)o=o.parent;if(o?.userData.id){onSelect(o.userData.kind,o.userData.id);break;}}
    });
    this.walk=new WalkControls(element,()=>this.camera,()=>this.controls.target,()=>this.mode==='interior'&&!!element.clientWidth&&!!element.clientHeight,()=>{this.dirty=true;},T);
    let last=performance.now();
    this.renderer.setAnimationLoop(now=>{const dt=(now-last)/1000;last=now;this.walk.update(dt);if(this.mode!=='interior')this.controls.update();if(this.dirty&&this.element.clientWidth&&this.element.clientHeight){this.draw();this.dirty=false;}});
  }
  setCamera(camera){
    this.walk?.stop();this.controls?.dispose();this.camera=camera;
    this.controls=new T.OrbitControls(camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI/2-.02;this.controls.minDistance=.2;this.controls.maxDistance=150;
    this.controls.addEventListener('change',()=>{this.dirty=true;});this.dirty=true;
  }
  draw(){
    if(this.quality){
      this.ao.camera=this.camera;
      for(const mat of [this.ao.ssaoMaterial,this.ao.depthRenderMaterial]){const perspective=this.camera.isPerspectiveCamera?1:0;if(mat.defines.PERSPECTIVE_CAMERA!==perspective){mat.defines.PERSPECTIVE_CAMERA=perspective;mat.needsUpdate=true;}mat.uniforms.cameraNear.value=this.camera.near;mat.uniforms.cameraFar.value=this.camera.far;}
      this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
      this.composer.render();
    }else this.renderer.render(this.scene,this.camera);
  }
  clear(){
    this.root.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const map of new Set([m.map,m.bumpMap]))if(map&&!this.surfaces.owned.has(map))map.dispose();m.dispose();}});
    this.root.clear();this.roomLights.clear();this.ceilings.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.ceilings.clear();
  }
  update(doc,selection,refit=false){
    this.doc=doc;this.clear();const b=doc.plan.bounds,s=doc.mmPerPixel/1000,cx=b.x+b.width/2,cz=b.y+b.height/2;
    const material=(kind,color)=>this.surfaces.material(kind,color);
    const box=(w,h,d,x,y,z,mat)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.receiveShadow=true;m.castShadow=true;this.root.add(m);return m;};
    box(b.width*s+.3,.10,b.height*s+.3,0,-.075,0,material('plaster','#e5e1d8')).castShadow=false;
    for(const r of doc.rooms){
      const mat=material(r.material==='plain'?'plaster':r.material,'#ffffff');
      if(mat.map){mat.map=mat.map.clone();mat.map.needsUpdate=true;mat.map.repeat.set(r.width*s/(r.material==='tile'?.65:2.4),r.depth*s/(r.material==='tile'?.65:2.4));mat.bumpMap=mat.map;}
      const mesh=box(r.width*s,.035,r.depth*s,(r.x+r.width/2-cx)*s,-.012,(r.z+r.depth/2-cz)*s,mat);mesh.userData={kind:'room',id:r.id};
      const ceiling=new T.Mesh(new T.BoxGeometry(r.width*s,.035,r.depth*s),material('plaster','#f7f4ef'));ceiling.position.set((r.x+r.width/2-cx)*s,3.02,(r.z+r.depth/2-cz)*s);this.ceilings.add(ceiling);
      if(this.roomLights.children.length<8){const lamp=new T.PointLight(0xffe4c0,this.lighting==='warm'?.65:.12,Math.max(r.width,r.depth)*s*1.8,2);lamp.position.set((r.x+r.width/2-cx)*s,2.65,(r.z+r.depth/2-cz)*s);this.roomLights.add(lamp);}
    }
    for(const w of doc.plan.walls){
      const dx=(w.x2-w.x1)*s,dz=(w.z2-w.z1)*s,t=Math.max(.03,w.thickness*s),h=this.low?.65:3,length=Math.hypot(dx,dz)+t;
      const x=((w.x1+w.x2)/2-cx)*s,z=((w.z1+w.z2)/2-cz)*s;
      const mesh=box(length,h,t,x,h/2,z,material('plaster',selection?.id===w.id?'#dec19e':'#f0ece3'));mesh.rotation.y=-Math.atan2(dz,dx);mesh.userData={kind:'wall',id:w.id};
      const skirt=box(length,.085,t+.016,x,.045,z,material('wood','#d4c8b5'));skirt.rotation.y=mesh.rotation.y;skirt.userData={kind:'wall',id:w.id};
    }
    for(const f of [...doc.furniture].sort((a,b)=>(a.type==='rug'?-1:0)-(b.type==='rug'?-1:0))){
      const object=makeFurniture(T,f,this.surfaces);
      if(this.low){const height=new T.Box3().setFromObject(object).max.y;if(height>1.05)object.scale.y=1.05/height;}
      object.position.set((f.x-cx)*s,.008,(f.z-cz)*s);this.root.add(object);
      if(selection?.id===f.id)this.root.add(new T.BoxHelper(object,0xc9874c));
    }
    const extent=Math.max(b.width,b.height)*s*.75+2;
    Object.assign(this.sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.5,far:80});this.sun.shadow.camera.updateProjectionMatrix();
    this.ceilings.visible=this.mode==='interior'&&!this.low;
    if(refit){if(this.mode==='interior')this.interior();else this.fit(this.mode);}this.dirty=true;
  }
  setLighting(value){
    this.lighting=value;const warm=value==='warm';this.sun.color.set(warm?0xffcb8b:0xfff0d9);this.sun.intensity=warm?.65:1.2;this.hemi.intensity=warm?.3:.45;
    this.roomLights.children.forEach(l=>l.intensity=warm?.65:.12);this.renderer.toneMappingExposure=warm?1.15:1.05;this.dirty=true;
  }
  resize(){
    const b=this.element.getBoundingClientRect();if(b.width<1||b.height<1)return;
    this.renderer.setSize(b.width,b.height);this.composer.setSize(b.width,b.height);this.camera.aspect=b.width/b.height;
    if(this.mode==='interior')this.camera.updateProjectionMatrix();else if(this.doc)this.fit(this.mode);this.dirty=true;
  }
  fit(mode='iso'){
    if(!this.doc)return;this.mode=mode;this.ceilings.visible=false;
    if(!this.camera.isOrthographicCamera)this.setCamera(new T.OrthographicCamera(-10,10,10,-10,.05,200));
    const b=this.doc.plan.bounds,s=this.doc.mmPerPixel/1000,aspect=this.element.clientWidth/Math.max(1,this.element.clientHeight);
    this.controls.target.set(0,.5,0);const distance=Math.max(b.width*s,b.height*s)*3+10;
    this.camera.position.copy(mode==='top'?new T.Vector3(0,distance,.001):new T.Vector3(.8,1.65,1.15).normalize().multiplyScalar(distance));this.camera.lookAt(this.controls.target);this.camera.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(this.root),projected=new T.Box3();
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse));
    const half=Math.max(projected.max.y,-projected.min.y,projected.max.x/aspect,-projected.min.x/aspect)*1.09;
    Object.assign(this.camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half,near:.05,far:distance*2,zoom:1});this.camera.updateProjectionMatrix();this.controls.update();this.dirty=true;
  }
  interior(room=null){
    if(!this.doc)return;
    const b=this.doc.plan.bounds,s=this.doc.mmPerPixel/1000,cx=b.x+b.width/2,cz=b.y+b.height/2;
    room=room||this.doc.rooms.find(r=>/客/.test(r.name))||this.doc.rooms.reduce((a,r)=>!a||r.width*r.depth>a.width*a.depth?r:a,null)||{x:b.x,z:b.y,width:b.width,depth:b.height};
    this.mode='interior';this.ceilings.visible=!this.low;this.setCamera(new T.PerspectiveCamera(65,this.element.clientWidth/Math.max(1,this.element.clientHeight),.03,200));
    this.camera.position.set((room.x+room.width*.88-cx)*s,1.5,(room.z+room.depth*.88-cz)*s);
    this.controls.target.set((room.x+room.width*.30-cx)*s,1.0,(room.z+room.depth*.30-cz)*s);this.controls.maxPolarAngle=Math.PI*.85;this.controls.update();this.controls.enabled=false;this.walk?.canvas.focus({preventScroll:true});this.dirty=true;
  }
  screenshot(){this.draw();return this.renderer.domElement.toDataURL('image/png');}
}

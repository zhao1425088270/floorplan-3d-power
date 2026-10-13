export const WALK_KEYS={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};

// Horizontal, camera-relative displacement; diagonals keep the same walking speed.
export function walkDelta(direction,forward,right,seconds,speed=1.4){
  const length=Math.hypot(direction.x,direction.z)||1;
  const fx=direction.x/length,fz=direction.z/length,n=Math.hypot(forward,right)||1;
  const step=Math.min(.05,Math.max(0,seconds))*speed;
  return {x:(fx*forward-fz*right)/n*step,z:(fz*forward+fx*right)/n*step};
}

export class WalkControls {
  constructor(element,getCamera,getTarget,enabled,onChange,T){
    this.element=element;this.camera=getCamera;this.target=getTarget;this.enabled=enabled;this.changed=onChange;this.T=T;this.keys=new Set();this.pressed=null;this.shift=false;this.drag=null;
    const canvas=element.querySelector('canvas');this.canvas=canvas;canvas.tabIndex=0;canvas.setAttribute('aria-label','三维场景，室内模式用 WASD 或方向键行走');
    this.nav=document.createElement('div');this.nav.className='walk-controls';this.nav.hidden=true;
    this.nav.innerHTML='<div class="walk-hint">WASD / 方向键行走 · 拖动环视 · Shift 加速</div><div class="walk-pad"><button data-walk="forward" aria-label="向前行走">↑</button><button data-walk="left" aria-label="向左行走">←</button><button data-walk="back" aria-label="向后行走">↓</button><button data-walk="right" aria-label="向右行走">→</button></div>';
    element.append(this.nav);
    const editable=e=>e.target.closest?.('input,textarea,select,[contenteditable="true"]');
    window.addEventListener('keydown',e=>{
      if(!this.enabled()||editable(e)||!element.contains(document.activeElement))return;
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      this.shift=e.shiftKey;
      if(WALK_KEYS[e.code]){e.preventDefault();e.stopImmediatePropagation();if(!this.keys.has(e.code))this.move(WALK_KEYS[e.code],1/60,this.shift?2.8:1.4);this.keys.add(e.code);}
      if(e.code==='Escape')this.stop();
    },true);
    window.addEventListener('keyup',e=>{this.keys.delete(e.code);this.shift=e.shiftKey;},true);
    window.addEventListener('blur',()=>this.stop());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
    element.addEventListener('focusout',e=>{if(!element.contains(e.relatedTarget))this.stop();});
    this.nav.addEventListener('pointerdown',e=>{
      const button=e.target.closest('[data-walk]');if(!button||!this.enabled())return;
      e.preventDefault();e.stopPropagation();canvas.focus({preventScroll:true});this.pressed=button.dataset.walk;button.classList.add('held');button.setPointerCapture(e.pointerId);
    });
    const release=e=>{e.stopPropagation();this.pressed=null;this.nav.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.nav.addEventListener(event,release);
    this.nav.addEventListener('click',e=>{const b=e.target.closest('[data-walk]');if(b&&e.detail===0){e.preventDefault();this.move(b.dataset.walk,.05,4);}});
    canvas.addEventListener('pointerdown',e=>{
      if(!this.enabled()||e.button!==0)return;e.preventDefault();e.stopPropagation();canvas.focus({preventScroll:true});this.drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!this.drag||!this.enabled())return;
      const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;
      const camera=this.camera(),v=camera.getWorldDirection(new T.Vector3());
      const yaw=Math.atan2(v.x,-v.z)-dx*.003,pitch=Math.max(-1.45,Math.min(1.45,Math.asin(v.y)-dy*.003));
      v.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
      this.target().copy(camera.position).add(v);camera.lookAt(this.target());this.changed();
    });
    const endLook=e=>{if(!this.drag)return;e.stopPropagation();this.drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
    canvas.addEventListener('pointerup',endLook);canvas.addEventListener('pointercancel',endLook);
    canvas.addEventListener('wheel',e=>{if(!this.enabled())return;e.preventDefault();e.stopPropagation();this.move(e.deltaY<0?'forward':'back',.05,4);},{passive:false});
  }
  stop(){this.keys.clear();this.pressed=null;this.shift=false;this.drag=null;this.nav.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));}
  move(action,dt,speed){this.translate(action==='forward'?1:action==='back'?-1:0,action==='right'?1:action==='left'?-1:0,dt,speed);}
  translate(forward,right,dt,speed=1.4){
    if(!this.enabled())return;
    const camera=this.camera(),d=walkDelta(camera.getWorldDirection(new this.T.Vector3()),forward,right,dt,speed),v=new this.T.Vector3(d.x,0,d.z);
    camera.position.add(v);this.target().add(v);this.changed();
  }
  update(dt){
    const active=this.enabled();this.nav.hidden=!active;if(!active){this.stop();return;}
    const held=new Set([...this.keys].map(k=>WALK_KEYS[k]));if(this.pressed)held.add(this.pressed);
    const forward=Number(held.has('forward'))-Number(held.has('back')),right=Number(held.has('right'))-Number(held.has('left'));
    if(forward||right)this.translate(forward,right,dt,this.shift?2.8:1.4);
  }
}

"use strict";

/*
  Dog sprites are the organised strips from the supplied 960x1024 main sheet.
  Verified mapping against the supplied reference images:
  bite rows 0-3 cols 0-14; death rows 4-7 cols 0-11;
  howl rows 8-11 cols 0-8; run rows 12-15 cols 0-7;
  idle rows 12-15 cols 11-14.
  Direction rows: 0 NE, 1 NW, 2 SW, 3 SE.
  Dig intentionally uses only death frames 0 and 1.
*/
(() => {
  const SIZE=32, SPEED=2.7, WANDER_MARGIN=3, STICK_DIG=10000, CROP_DIG_INTERVAL=10000, CROP_DIG_TIME=1200;
  // These exact files are byte-for-byte matches for the user's supplied reference
  // strips and are direct crops of the supplied wolf-all sprite sheet.
  const SPRITES={run:"./wolf/wolf-run.png",idle:"./wolf/wolf-idle.png",dig:"./wolf/wolf-death.png"};
  const WOOD=["./tile_048.png","./tile_049.png","./tile_050.png","./tile_051.png","./tile_052.png"];
  const dogs=new Map();
  let map=document.getElementById("town-map"), last=performance.now(), woodKey="", woodSources=[];

  const area=()=>typeof currentArea==="function"?currentArea():({minX:0,minY:0,maxX:12,maxY:12,width:12,height:12});
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
  const inside=(x,y,a=area())=>x>=a.minX&&y>=a.minY&&x<a.maxX&&y<a.maxY;
  const gateXs=(a=area())=>{const x=a.minX+Math.floor((a.maxX-a.minX)/2)-1;return [x,x+1]};

  function offset(){
    const tile=map?.querySelector('.terrain-floor-tile[data-world-x][data-world-y]');
    if(!tile||!window.RescuePupTerrain)return{x:0,y:0};
    const x=+tile.dataset.worldX,y=+tile.dataset.worldY,p=window.RescuePupTerrain.point(x+.5,y+.5);
    return{x:parseFloat(tile.style.left)-p.x,y:parseFloat(tile.style.top)-p.y};
  }
  function screen(x,y){const o=offset(),p=window.RescuePupTerrain?window.RescuePupTerrain.point(x,y):{x:(x-y)*16,y:(x+y)*8};return{x:p.x+o.x,y:p.y+o.y}}
  function dir(dx,dy){const sx=(dx-dy)*16,sy=(dx+dy)*8;if(sx>=0&&sy<0)return 0;if(sx<0&&sy<0)return 1;if(sx<0&&sy>=0)return 2;return 3}

  function setAnim(r,name,now){
    const frames=name==="run"?8:name==="dig"?2:4, cols=name==="dig"?12:frames, ms=name==="run"?95:name==="dig"?420:280;
    const frame=Math.floor(now/ms)%frames;
    if(r.anim===name&&r.frame===frame&&r.lastDir===r.direction)return;
    r.anim=name;r.frame=frame;r.lastDir=r.direction;
    r.el.style.backgroundImage=`url("${SPRITES[name]}")`;
    r.el.style.backgroundSize=`${cols*SIZE}px ${4*SIZE}px`;
    r.el.style.backgroundPosition=`${-frame*SIZE}px ${-r.direction*SIZE}px`;
  }

  function sources(){
    const a=area(),sig=[a.minX,a.minY,a.maxX,a.maxY].join(":");
    if(sig===woodKey&&woodSources.length)return woodSources;
    const list=[];
    outer:for(let y=a.minY-7;y<a.maxY+7;y++)for(let x=a.minX-7;x<a.maxX+7;x++){
      const d=Math.max(a.minX-x,x-(a.maxX-1),a.minY-y,y-(a.maxY-1),0);
      if(d<3||d>7)continue;
      const score=hash(`${x}:${y}:${sig}`);if(score%7)continue;
      if(list.some(v=>Math.max(Math.abs(v.x-x),Math.abs(v.y-y))<2))continue;
      list.push({id:`wood-${x}-${y}`,x,y,asset:WOOD[score%WOOD.length]});
      if(list.length>=16)break outer;
    }
    woodKey=sig;woodSources=list;return list;
  }

  function layers(){
    map=document.getElementById("town-map");const world=map?.querySelector(".terrain-floor-world");if(!world)return null;
    let wl=world.querySelector(".dog-worker-wood-layer");if(!wl){wl=document.createElement("div");wl.className="dog-worker-wood-layer";world.appendChild(wl)}
    let dl=world.querySelector(".dog-worker-dog-layer");if(!dl){dl=document.createElement("div");dl.className="dog-worker-dog-layer";world.appendChild(dl)}
    const list=sources(),sig=woodKey+":"+list.map(s=>s.id).join("|");
    if(wl.dataset.sig!==sig){wl.dataset.sig=sig;wl.innerHTML=list.map(s=>{const p=screen(s.x+.5,s.y+.5);return`<img class="dog-worker-wood-source" src="${s.asset}" alt="" draggable="false" style="left:${p.x}px;top:${p.y}px;z-index:${4800+Math.round(p.y*10)}">`}).join("")}
    return{world,dl};
  }

  function compatibleBuilding(r,type){
    const list=(state?.buildings||[]).filter(b=>b.type===type);if(!list.length)return null;
    let b=list.find(x=>x.id===r.dog.assignedBuildingId);
    if(!b){b=list.sort((a,b)=>(Math.abs(a.worldX-r.x)+Math.abs(a.worldY-r.y))-(Math.abs(b.worldX-r.x)+Math.abs(b.worldY-r.y)))[0];r.dog.assignedBuildingId=b.id;typeof saveState==="function"&&saveState()}
    return b;
  }
  function buildingEdge(b){
    const c=typeof getCatalog==="function"?getCatalog(b.type):null;if(!c)return[];
    const out=[];for(let x=b.worldX-1;x<=b.worldX+c.footprintWidth;x++){out.push({x:x+.5,y:b.worldY-.5});out.push({x:x+.5,y:b.worldY+c.footprintHeight+.5})}
    for(let y=b.worldY;y<b.worldY+c.footprintHeight;y++){out.push({x:b.worldX-.5,y:y+.5});out.push({x:b.worldX+c.footprintWidth+.5,y:y+.5})}return out;
  }
  function cropLoop(b){
    const c=typeof getCatalog==="function"?getCatalog(b.type):null;if(!c)return[];
    const L=b.worldX-.5,R=b.worldX+c.footprintWidth+.5,T=b.worldY-.5,B=b.worldY+c.footprintHeight+.5,o=[];
    for(let x=L;x<=R;x++)o.push({x,y:T});for(let y=T+1;y<=B;y++)o.push({x:R,y});for(let x=R-1;x>=L;x--)o.push({x,y:B});for(let y=B-1;y>T;y--)o.push({x:L,y});return o;
  }
  function nearest(points,r){return [...points].sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y))[0]||null}

  function routeTo(r,target){
    const a=area(),fromIn=inside(Math.floor(r.x),Math.floor(r.y),a),toIn=inside(Math.floor(target.x),Math.floor(target.y),a);
    r.route=[];
    if(fromIn!==toIn){
      const gx=nearest(gateXs(a).map(x=>({x:x+.5,y:a.maxY-.5})),r).x;
      if(fromIn){r.route.push({x:gx,y:a.maxY-.5},{x:gx,y:a.maxY+.5})}
      else{r.route.push({x:gx,y:a.maxY+.5},{x:gx,y:a.maxY-.5})}
    }
    r.route.push(target);r.routeIndex=0;r.phase="move";
  }
  function move(r,dt,now){
    const t=r.route?.[r.routeIndex];if(!t){r.phase=r.after||"idleWait";r.phaseStarted=now;return}
    const dx=t.x-r.x,dy=t.y-r.y,d=Math.hypot(dx,dy);r.direction=dir(dx,dy);setAnim(r,"run",now);
    const step=SPEED*dt;if(d<=step){r.x=t.x;r.y=t.y;r.routeIndex++;if(r.routeIndex>=r.route.length){r.phase=r.after||"idleWait";r.phaseStarted=now}}else{r.x+=dx/d*step;r.y+=dy/d*step}
  }

  function idleTarget(r){
    const a=area(),seed=hash(`${r.dog.id}:${r.seq++}`),w=a.maxX-a.minX+WANDER_MARGIN*2,h=a.maxY-a.minY+WANDER_MARGIN*2;
    return{x:a.minX-WANDER_MARGIN+.5+(seed%w),y:a.minY-WANDER_MARGIN+.5+((seed>>>8)%h)};
  }
  function startIdle(r,now){r.after="idleWait";routeTo(r,idleTarget(r));r.waitUntil=now+700+(hash(`${r.dog.id}:${r.seq}`)%1600)}
  function startWood(r){const s=nearest(sources().map(s=>({...s,x:s.x+.5,y:s.y+.5})),r);if(!s){startIdle(r,performance.now());return}r.wood=s;const around=[{x:s.x+1,y:s.y},{x:s.x-1,y:s.y},{x:s.x,y:s.y+1},{x:s.x,y:s.y-1}];r.after="digWood";routeTo(r,nearest(around,r));r.digUntil=0}
  function returnStorage(r){const b=compatibleBuilding(r,"storage");if(!b){startIdle(r,performance.now());return}const t=nearest(buildingEdge(b),r);r.storage=b;r.after="deliver";routeTo(r,t)}
  function startCrop(r,now){const b=compatibleBuilding(r,"crop_farm");if(!b){startIdle(r,now);return}r.crop=b;const loop=cropLoop(b);if(!loop.length){startIdle(r,now);return}r.cropIndex=(r.cropIndex||0)%loop.length;r.after="cropEdge";routeTo(r,loop[r.cropIndex]);if(!r.nextCropDig)r.nextCropDig=now+CROP_DIG_INTERVAL}

  function jobChanged(r,now){const job=r.dog.job||"idle";if(r.job===job)return false;r.job=job;r.route=[];r.nextCropDig=0;r.digUntil=0;if(job==="sticks")startWood(r);else if(job==="crop_farm")startCrop(r,now);else startIdle(r,now);return true}
  function update(r,dt,now){
    jobChanged(r,now);if(r.phase==="move"){move(r,dt,now);return}
    if(r.job==="sticks"){
      if(r.phase==="digWood"){if(!r.digUntil)r.digUntil=now+STICK_DIG;setAnim(r,"dig",now);if(now>=r.digUntil){r.digUntil=0;returnStorage(r)}return}
      if(r.phase==="deliver"){setAnim(r,"idle",now);if(!r.waitUntil)r.waitUntil=now+500;if(now>=r.waitUntil){r.waitUntil=0;startWood(r)}return}
      startWood(r);return;
    }
    if(r.job==="crop_farm"){
      if(r.phase==="cropDig"){setAnim(r,"dig",now);if(now>=r.digUntil){const loop=cropLoop(r.crop);r.cropIndex=(r.cropIndex+1)%Math.max(1,loop.length);r.nextCropDig=now+CROP_DIG_INTERVAL;startCrop(r,now)}return}
      if(r.phase==="cropEdge"){if(now>=r.nextCropDig){r.phase="cropDig";r.digUntil=now+CROP_DIG_TIME;setAnim(r,"dig",now)}else{const loop=cropLoop(r.crop);r.cropIndex=(r.cropIndex+1)%Math.max(1,loop.length);startCrop(r,now)}return}
      startCrop(r,now);return;
    }
    if(r.phase==="idleWait"){setAnim(r,"idle",now);if(!r.waitUntil)r.waitUntil=now+1000;if(now>=r.waitUntil){r.waitUntil=0;startIdle(r,now)}return}startIdle(r,now);
  }

  function ensureDogs(dl){
    const list=state?.dogs||[],active=new Set(list.map(d=>d.id));for(const [id,r] of dogs)if(!active.has(id)){r.el.remove();dogs.delete(id)}
    const a=area();list.forEach((dog,i)=>{let r=dogs.get(dog.id);if(!r){const el=document.createElement("div");el.className="dog-worker-sprite";el.dataset.dogId=dog.id;dl.appendChild(el);r={dog,el,x:a.minX+2.5+(i%3)*2,y:a.maxY-2.5-(i%2),direction:3,phase:"idleWait",job:null,route:[],routeIndex:0,seq:i+1,waitUntil:performance.now()+i*300,cropIndex:i};dogs.set(dog.id,r)}else{r.dog=dog;if(r.el.parentNode!==dl)dl.appendChild(r.el)}})
  }
  function position(r){const p=screen(r.x,r.y);r.el.style.left=`${p.x}px`;r.el.style.top=`${p.y}px`;r.el.style.zIndex=String(5000+Math.round(p.y*10)+3)}
  function tick(now){const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;const l=layers();if(l){ensureDogs(l.dl);for(const r of dogs.values()){update(r,dt,now);position(r)}}requestAnimationFrame(tick)}

  document.addEventListener("change",e=>{const s=e.target.closest?.("[data-dog-job]");if(!s)return;queueMicrotask(()=>{const dog=(state?.dogs||[]).find(d=>d.id===s.dataset.dogJob);if(!dog)return;const type=dog.job==="sticks"?"storage":dog.job==="crop_farm"?"crop_farm":null;if(type){const b=(state.buildings||[]).find(x=>x.type===type);dog.assignedBuildingId=b?.id||null}else delete dog.assignedBuildingId;typeof saveState==="function"&&saveState();const r=dogs.get(dog.id);if(r)r.job=null})});

  if(map)new MutationObserver(()=>requestAnimationFrame(()=>{const l=layers();if(l)ensureDogs(l.dl)})).observe(map,{childList:true});
  window.RescuePupDogWorkers=Object.freeze({spriteMapping:{bite:{rows:[0,3],cols:[0,14]},death:{rows:[4,7],cols:[0,11]},howl:{rows:[8,11],cols:[0,8]},run:{rows:[12,15],cols:[0,7]},idle:{rows:[12,15],cols:[11,14]},dig:{source:"death",frames:[0,1]}},get woodSources(){return sources().map(x=>({...x}))},get dogs(){return[...dogs.values()].map(r=>({id:r.dog.id,job:r.dog.job,assignedBuildingId:r.dog.assignedBuildingId||null,phase:r.phase,x:r.x,y:r.y}))}});
  layers();requestAnimationFrame(tick);
})();

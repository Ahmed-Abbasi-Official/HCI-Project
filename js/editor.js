(() => {
  "use strict";

  // â”€â”€ CONSTANTS â”€â”€
  const COLORS = ["#6c8fff","#a78bfa","#6bcb77","#ffd93d","#ff6b6b","#fb923c","#38bdf8","#f472b6","#ffffff","#94a3b8"];
  const SHAPE_COLORS = { rectangle:"#6c8fff", diamond:"#a78bfa", ellipse:"#6bcb77", circle:"#ffd93d", arrow:"#ff6b6b", freehand:"#fb923c" };
  const MODES = { IDLE:"IDLE", ADDING:"ADDING", MOVE:"MOVE", DELETE:"DELETE" };
  const SK = "polyline_editor_v3";
  const THEME_KEY = "polyline_editor_theme";
  const MAX = 100, MAXSTACK = 60;

  // â”€â”€ STATE â”€â”€
  let mode = MODES.IDLE;
  let polys = [];
  let undoSt = [], redoSt = [];
  let selPoly = -1, selPt = null;
  let hovPt = null, hovPoly = -1;
  let drawIdx = -1, activeTool = "polyline";
  let curColor = COLORS[0], curSize = 100, curLW = 2;
  let zoom = 1, panX = 0, panY = 0;
  let isDrag = false, dragChg = false, mdown = false;
  let lastDW = {x:0,y:0};
  let freeActive = false;
  let autoSave = true, isComp = false, beforeSnap = null;
  let holdPreview = null;
  let clipboard = null, notifyTmr = null;
  let mw = {x:0,y:0};
  let dragShape = null;
  let theme = "dark";

  // â”€â”€ DOM â”€â”€
  const canvas = document.getElementById("editorCanvas");
  const ctx    = canvas.getContext("2d");
  const wrap   = document.getElementById("canvasWrap");
  const ghost  = document.getElementById("dragGhost");
  const badge  = document.getElementById("modeBadge");
  const ntfy   = document.getElementById("notify");
  const selBar = document.getElementById("selBar");
  const selTxt = document.getElementById("selText");
  const topSt  = document.getElementById("topStatus");
  const sizeSl = document.getElementById("sizeSlider");
  const lineSl = document.getElementById("lineSlider");
  const sizeVl = document.getElementById("sizeVal");
  const lineVl = document.getElementById("lineVal");
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const themeToggleIcon = document.getElementById("themeToggleIcon");

  // â”€â”€ ICONS â”€â”€
  function drawIcons() {
    const map = {
      "ic-rect":    (_,x)=>{ x.strokeStyle="#6c8fff";x.lineWidth=2;x.strokeRect(2,4,16,12); },
      "ic-diamond": (_,x)=>{ x.strokeStyle="#a78bfa";x.lineWidth=2;x.beginPath();x.moveTo(10,2);x.lineTo(18,10);x.lineTo(10,18);x.lineTo(2,10);x.closePath();x.stroke(); },
      "ic-ellipse": (_,x)=>{ x.strokeStyle="#6bcb77";x.lineWidth=2;x.beginPath();x.ellipse(10,10,9,6,0,0,Math.PI*2);x.stroke(); },
      "ic-circle":  (_,x)=>{ x.strokeStyle="#ffd93d";x.lineWidth=2;x.beginPath();x.arc(10,10,8,0,Math.PI*2);x.stroke(); },
      "ic-arrow":   (_,x)=>{ x.strokeStyle="#ff6b6b";x.lineWidth=2;x.beginPath();x.moveTo(1,10);x.lineTo(15,10);x.lineTo(11,6);x.moveTo(15,10);x.lineTo(11,14);x.stroke(); },
      "ic-free":    (_,x)=>{ x.strokeStyle="#fb923c";x.lineWidth=2;x.beginPath();x.moveTo(2,16);x.bezierCurveTo(5,8,12,14,16,5);x.stroke(); }
    };
    Object.entries(map).forEach(([id,fn])=>{
      const el=document.getElementById(id); if(!el) return;
      el.width=20; el.height=20; fn(el,el.getContext("2d"));
    });
  }

  // â”€â”€ COLOR ROW â”€â”€
  function buildColors() {
    const row = document.getElementById("colorRow");
    COLORS.forEach(c => {
      const sw = document.createElement("div");
      sw.className="color-swatch"+(c===curColor?" selected":"");
      sw.style.background=c; sw.title=c;
      sw.addEventListener("click",()=>{
        curColor=c;
        document.querySelectorAll(".color-swatch").forEach(s=>s.classList.remove("selected"));
        sw.classList.add("selected");
        if(selPoly>=0&&polys[selPoly]){ saveU(); polys[selPoly].color=c; ac(); }
        toast("Color "+c);
      });
      row.appendChild(sw);
    });
  }

  function loadTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      theme = saved === "light" ? "light" : "dark";
    } catch (_) {
      theme = "dark";
    }
    applyTheme(false);
  }

  function applyTheme(showToast = true) {
    document.body.dataset.theme = theme;
    if (themeToggleBtn) {
      const nextTheme = theme === "dark" ? "light" : "dark";
      themeToggleBtn.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
      themeToggleBtn.setAttribute("title", `Switch to ${nextTheme} theme`);
    }
    if (themeToggleIcon) {
      themeToggleIcon.textContent = theme === "dark" ? "☀" : "☾";
    }
    if (showToast) toast(`Theme: ${theme}`);
  }

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    applyTheme(true);
    rdyn();
    render();
  }

  // â”€â”€ SLIDERS â”€â”€
  function setupSliders() {
    const upBg = sl => {
      const p=((+sl.value - +sl.min)/(+sl.max - +sl.min)*100).toFixed(1)+"%";
      sl.style.setProperty("--pct",p);
    };

    sizeSl.addEventListener("input",()=>{
      curSize=+sizeSl.value; sizeVl.textContent=curSize;
      upBg(sizeSl);
      document.getElementById("stSize").innerHTML=`Size: <span>${curSize}</span>`;
      // live-resize selected
      if(selPoly>=0&&polys[selPoly]){
        const ln=polys[selPoly];
        if(ln._bp&&ln._bc){
          const sc=curSize/(ln._bs||100);
          const [bx,by]=ln._bc;
          ln.points=ln._bp.map(([px,py])=>[bx+(px-bx)*sc, by+(py-by)*sc]);
          ac();
        }
      }
    });

    lineSl.addEventListener("input",()=>{
      curLW=+lineSl.value; lineVl.textContent=curLW+"px";
      upBg(lineSl);
      if(selPoly>=0&&polys[selPoly]){ polys[selPoly].lw=curLW; ac(); }
    });

    upBg(sizeSl); upBg(lineSl);
  }

  // â”€â”€ RENDER â”€â”€
  function render() {
    resz();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(isComp&&beforeSnap){ renderComp(); return; }
    ctx.save(); ctx.setTransform(zoom,0,0,zoom,panX,panY);
    drawAll(); ctx.restore();
    updUI();
  }

  function drawAll() {
    polys.forEach((ln,i)=>{
      const src=holdPreview&&holdPreview.index===i?holdPreview.shape:ln;
      drawPoly(src,i===drawIdx,i===selPoly);
    });
    polys.forEach((ln,i)=>{
      const src=holdPreview&&holdPreview.index===i?holdPreview.shape:ln;
      src.points.forEach(([x,y],p)=>{
      const iS=selPt&&selPt.pi===i&&selPt.pt===p;
      const iH=hovPt&&hovPt.pi===i&&hovPt.pt===p;
      drawDot(x,y,iS,iH,ln.color||"#fff");
      });
    });
    if(mode===MODES.ADDING&&activeTool==="polyline"&&drawIdx>=0&&polys[drawIdx]&&polys[drawIdx].points.length>0){
      drawPreviewLine();
    }
  }

  function drawPoly(ln,isAct,isSel) {
    const pts=ln.points; if(!pts.length) return;
    const col=ln.color||"#fff", lw=ln.lw||2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    if(ln.closed&&pts.length>2) ctx.closePath();

    if(isSel){
      ctx.shadowColor=col; ctx.shadowBlur=16/zoom;
      ctx.lineWidth=(lw+3)/zoom; ctx.strokeStyle=col; ctx.globalAlpha=0.3;
      ctx.stroke(); ctx.globalAlpha=1; ctx.shadowBlur=0;
    }
    ctx.lineWidth=(isAct?lw+0.5:lw)/zoom;
    ctx.strokeStyle=isSel?col:(isAct?col:col+"dd");
    ctx.stroke();
    if(isSel){
      ctx.setLineDash([6/zoom,4/zoom]); ctx.lineWidth=1.5/zoom;
      ctx.strokeStyle="#ffffff33"; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    
    ctx.save();
    ctx.font=(11/zoom)+"px 'JetBrains Mono'";
    ctx.fillStyle=col+"dd";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    for(let i=0;i<pts.length-1;i++){
      const dx=pts[i+1][0]-pts[i][0], dy=pts[i+1][1]-pts[i][1];
      const len=d(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]);
      const mx=(pts[i][0]+pts[i+1][0])/2, my=(pts[i][1]+pts[i+1][1])/2;
      const angle=Math.atan2(dy,dx);
      ctx.save();
      ctx.translate(mx,my);
      ctx.rotate(angle);
      ctx.fillStyle=col+"cc";
      ctx.fillText(formatDist(len),0,-5/zoom);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawDot(x,y,isSel,isHov,col) {
    const r=4/zoom;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=isSel?"#ff6b6b":(isHov?"#ffd93d":(col||"#d0d0e0")); ctx.fill();
    if(isSel){ ctx.beginPath(); ctx.arc(x,y,9/zoom,0,Math.PI*2); ctx.strokeStyle="#ff6b6b88"; ctx.lineWidth=1.5/zoom; ctx.stroke(); }
  }

  function drawPreviewLine() {
    const ln=polys[drawIdx];
    if(!ln||!ln.points.length) return;
    const last=ln.points[ln.points.length-1];
    const col=ln.color||"#fff";
    ctx.save();
    ctx.setLineDash([4/zoom,4/zoom]);
    ctx.lineWidth=2/zoom;
    ctx.strokeStyle=col+"88";
    ctx.beginPath();
    ctx.moveTo(last[0],last[1]);
    ctx.lineTo(mw.x,mw.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function renderComp() {
    const h=canvas.width/2;
    ctx.save(); ctx.beginPath(); ctx.rect(0,0,h,canvas.height); ctx.clip();
    ctx.setTransform(zoom,0,0,zoom,panX,panY);
    (beforeSnap||[]).forEach(ln=>drawPoly(ln,false,false));
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(h,0,h,canvas.height); ctx.clip();
    ctx.setTransform(zoom,0,0,zoom,panX,panY);
    polys.forEach(ln=>drawPoly(ln,false,false));
    ctx.restore();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.strokeStyle="#6c8fff"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(h,0); ctx.lineTo(h,canvas.height); ctx.stroke();
    ctx.fillStyle="#c8d8ff"; ctx.font="bold 12px JetBrains Mono";
    ctx.fillText("BEFORE",10,22); ctx.fillText("AFTER",h+10,22);
  }

  // â”€â”€ MOUSE â”€â”€
  function setupMouse() {
    canvas.addEventListener("mousemove",e=>{
      const w=toW(e); mw=w;
      hovPt=nearPt(w.x,w.y,10/zoom);
      hovPoly=hovPt?hovPt.pi:nearLine(w.x,w.y,7/zoom);

      if(mode===MODES.MOVE&&isDrag&&selPt){
        if(!dragChg){ saveU(); redoSt=[]; stopHoldPreview(false); }
        polys[selPt.pi].points[selPt.pt]=[w.x,w.y]; dragChg=true;
      }
      if(mode===MODES.MOVE&&isDrag&&selPoly>=0&&!selPt&&mdown){
        if(!dragChg){ saveU(); redoSt=[]; stopHoldPreview(false); }
        const dx=w.x-lastDW.x, dy=w.y-lastDW.y;
        polys[selPoly].points=polys[selPoly].points.map(([px,py])=>[px+dx,py+dy]);
        const ln=polys[selPoly];
        if(ln._bc){ ln._bc=[ln._bc[0]+dx,ln._bc[1]+dy]; ln._bp=ln._bp.map(([px,py])=>[px+dx,py+dy]); }
        lastDW=w; dragChg=true;
      }
      if(mode===MODES.ADDING&&activeTool==="polyline"&&drawIdx>=0&&polys[drawIdx]&&polys[drawIdx].points.length>0){
        const ln=polys[drawIdx];
        const last=ln.points[ln.points.length-1];
        const dist=d(last[0],last[1],w.x,w.y);
        topSt.textContent="Distance: "+formatDist(dist)+" • Click to add point • B=new • ESC=finish";
      }
      if(mode===MODES.ADDING&&activeTool==="freehand"&&freeActive&&drawIdx>=0){
        const ln=polys[drawIdx]; const last=ln.points[ln.points.length-1];
        if(!last||d(last[0],last[1],w.x,w.y)>5) ln.points.push([w.x,w.y]);
      }
      updCursor(); render();
    });

    canvas.addEventListener("mousedown",e=>{
      const w=toW(e); mdown=true; lastDW=w;
      if(mode===MODES.ADDING){
        if(activeTool==="freehand"){
          if(polys.length>=MAX){toast("Max 100");return;}
          saveU(); redoSt=[];
          polys.push({points:[[w.x,w.y]],closed:false,color:curColor,lw:curLW});
          drawIdx=polys.length-1; freeActive=true; return;
        }
        if(drawIdx<0||!polys[drawIdx]){
          if(polys.length>=MAX){toast("Max 100");return;}
          saveU(); redoSt=[];
          polys.push({points:[],closed:false,color:curColor,lw:curLW});
          drawIdx=polys.length-1;
        } else {saveU();redoSt=[];}
        polys[drawIdx].points.push([w.x,w.y]); ac(); return;
      }
      if(mode===MODES.MOVE){
        const pH=nearPt(w.x,w.y,10/zoom);
        if(pH){selPt=pH;selPoly=pH.pi;isDrag=true;dragChg=false;startHoldPreview(pH.pi);updSel();render();return;}
        const lH=nearLine(w.x,w.y,7/zoom);
        if(lH>=0){selPoly=lH;selPt=null;isDrag=true;dragChg=false;lastDW=w;startHoldPreview(lH);updSel();syncSl();render();return;}
        stopHoldPreview(false);
        selPoly=-1;selPt=null;hideSel();render();return;
      }
      if(mode===MODES.DELETE){
        stopHoldPreview(false);
        const pH=nearPt(w.x,w.y,10/zoom);
        if(pH){saveU();redoSt=[];delPt(pH.pi,pH.pt);ac();return;}
        const lH=nearLine(w.x,w.y,7/zoom);
        if(lH>=0){saveU();redoSt=[];polys.splice(lH,1);fixIdx(lH);ac();return;}
      }
      if(mode===MODES.IDLE){
        const pH=nearPt(w.x,w.y,10/zoom);
        const lH=nearLine(w.x,w.y,7/zoom);
        const hitIdx=pH?pH.pi:lH;
        if(hitIdx>=0){selPoly=hitIdx;selPt=null;startHoldPreview(hitIdx);updSel();syncSl();render();return;}
        stopHoldPreview(false);
        selPoly=-1;selPt=null;hideSel();render();
      }
    });

    window.addEventListener("mouseup",()=>{
      if(mode===MODES.ADDING&&activeTool==="freehand"&&freeActive){
        freeActive=false;
        const ln=polys[drawIdx];
        if(ln&&ln.points.length<2){polys.pop();drawIdx=-1;}
        ac();
      }
      if(mode===MODES.MOVE&&isDrag){isDrag=false;if(dragChg)ac();else render();}
      stopHoldPreview(false);
      mdown=false;
      render();
    });

    canvas.addEventListener("mouseleave",()=>{hovPt=null;stopHoldPreview(false);render();});

    canvas.addEventListener("wheel",e=>{
      e.preventDefault();
      const f=e.deltaY<0?1.1:0.9;
      const rect=canvas.getBoundingClientRect();
      const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
      const old=zoom; zoom=Math.max(0.1,Math.min(10,zoom*f));
      panX=cx-(cx-panX)*(zoom/old); panY=cy-(cy-panY)*(zoom/old);
      render();
    },{passive:false});
  }

  function updCursor(){
    if(mode===MODES.MOVE){ canvas.style.cursor=hovPt?"grab":(hovPoly>=0?"move":"default"); }
    else if(mode===MODES.ADDING){ canvas.style.cursor="crosshair"; }
    else if(mode===MODES.DELETE){ canvas.style.cursor=(hovPt||hovPoly>=0)?"not-allowed":"crosshair"; }
    else { canvas.style.cursor=hovPoly>=0?"pointer":"default"; }
  }

  // â”€â”€ SIDEBAR DRAG & DROP â”€â”€
  function setupDragDrop() {
    document.querySelectorAll(".shape-btn[draggable='true']").forEach(btn=>{
      btn.addEventListener("dragstart",e=>{
        dragShape=btn.dataset.shape;
        btn.classList.add("dragging-source");
        ghost.textContent="â¬¡ "+btn.dataset.shape.charAt(0).toUpperCase()+btn.dataset.shape.slice(1)+" (size "+curSize+")";
        ghost.style.display="block";
        ghost.style.left="-9999px"; ghost.style.top="-9999px";
        try{e.dataTransfer.setDragImage(ghost,70,20);}catch(_){}
        e.dataTransfer.effectAllowed="copy";
      });
      btn.addEventListener("dragend",()=>{
        btn.classList.remove("dragging-source");
        ghost.style.display="none";
        wrap.classList.remove("drop-active");
        dragShape=null;
      });
    });

    wrap.addEventListener("dragover",e=>{
      e.preventDefault(); e.dataTransfer.dropEffect="copy";
      wrap.classList.add("drop-active");
    });
    wrap.addEventListener("dragleave",()=>wrap.classList.remove("drop-active"));
    wrap.addEventListener("drop",e=>{
      e.preventDefault(); wrap.classList.remove("drop-active");
      if(!dragShape) return;
      const rect=canvas.getBoundingClientRect();
      const wx=(e.clientX-rect.left-panX)/zoom, wy=(e.clientY-rect.top-panY)/zoom;
      addShapeAt(dragShape,wx,wy);
      dragShape=null;
    });
  }

  // â”€â”€ KEYBOARD â”€â”€
  function setupKeys() {
    document.addEventListener("keydown",e=>{
      if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
      const k=e.key.toLowerCase();
      const ctrl=e.ctrlKey||e.metaKey;

      if(ctrl&&k==="z"){e.preventDefault();undo();return;}
      if(ctrl&&k==="y"){e.preventDefault();redo();return;}
      if(ctrl&&k==="c"){e.preventDefault();doCopy();return;}
      if(ctrl&&k==="x"){e.preventDefault();doCut();return;}
      if(ctrl&&k==="v"){e.preventDefault();doPaste();return;}
      if(ctrl&&k==="d"){e.preventDefault();doDupe();return;}

      if(e.key==="Delete"||e.key==="Backspace"){
        if(document.activeElement===document.body||document.activeElement===canvas){
          e.preventDefault();
          if(selPoly>=0){delSelPoly();return;}
          if(selPt){saveU();redoSt=[];delPt(selPt.pi,selPt.pt);selPt=null;ac();return;}
        }
      }

      if(k==="b"){e.preventDefault();activeTool="polyline";if(mode!==MODES.ADDING)setMode(MODES.ADDING);startNew();return;}
      if(k==="m"){e.preventDefault();setMode(MODES.MOVE);return;}
      if(k==="d"&&!ctrl){e.preventDefault();setMode(MODES.DELETE);return;}
      if(k==="r"){e.preventDefault();doRefresh();return;}
      if(k==="escape"||k==="q"){
        e.preventDefault();selPt=null;isDrag=false;
        if(mode===MODES.ADDING)finalizePoly();
        setMode(MODES.IDLE);
      }

      // Nudge with arrow keys
      if(selPoly>=0&&["arrowup","arrowdown","arrowleft","arrowright"].includes(k)){
        e.preventDefault();
        const step=e.shiftKey?10:1;
        const dx=k==="arrowright"?step:k==="arrowleft"?-step:0;
        const dy=k==="arrowdown"?step:k==="arrowup"?-step:0;
        saveU(); redoSt=[];
        polys[selPoly].points=polys[selPoly].points.map(([px,py])=>[px+dx,py+dy]);
        const ln=polys[selPoly];
        if(ln._bc){ln._bc=[ln._bc[0]+dx,ln._bc[1]+dy];ln._bp=ln._bp.map(([px,py])=>[px+dx,py+dy]);}
        ac();
      }
    });
  }

  // â”€â”€ CLIPBOARD â”€â”€
  function doCopy(){
    if(selPoly<0){toast("Nothing selected");return;}
    clipboard=clone(polys[selPoly]); toast("Copied âŽ˜");
  }
  function doCut(){
    if(selPoly<0){toast("Nothing selected");return;}
    saveU();redoSt=[];
    clipboard=clone(polys[selPoly]);
    polys.splice(selPoly,1);fixIdx(selPoly);
    selPoly=-1;selPt=null;hideSel();ac();toast("Cut âœ‚");
  }
  function doPaste(){
    if(!clipboard){toast("Clipboard empty");return;}
    if(polys.length>=MAX){toast("Max 100");return;}
    saveU();redoSt=[];
    const s=clone(clipboard);
    s.points=s.points.map(([px,py])=>[px+24,py+24]);
    if(s._bc){s._bc=[s._bc[0]+24,s._bc[1]+24];}
    if(s._bp){s._bp=s._bp.map(([px,py])=>[px+24,py+24]);}
    polys.push(s); selPoly=polys.length-1; selPt=null;
    updSel(); ac(); toast("Pasted â¬¡");
  }
  function doDupe(){
    if(selPoly<0){toast("Nothing selected");return;}
    clipboard=clone(polys[selPoly]); doPaste();
  }

  // â”€â”€ MODES â”€â”€
  function setMode(m){
    stopHoldPreview(false);
    mode=m;
    const msgs={
      [MODES.IDLE]:   "Idle â€” click shape to select Â· drag sidebar shape to canvas",
      [MODES.ADDING]: "Drawing â€” click to add points Â· B=new Â· ESC=finish",
      [MODES.MOVE]:   "Move â€” drag point or shape Â· arrow keys to nudge Â· ESC=back",
      [MODES.DELETE]: "Delete â€” click point or shape Â· ESC=back"
    };
    topSt.textContent=msgs[m]||"";
    updBadge(); toast("â†’ "+m,1200); updSidebarBtns(); updCursor(); render();
  }

  function updBadge(){
    const c={
      [MODES.IDLE]:  {l:"IDLE",   bg:"#303040",c:"#8888aa",b:"#404055"},
      [MODES.ADDING]:{l:"DRAWING",bg:"#1a3326",c:"#6bcb77",b:"#6bcb7788"},
      [MODES.MOVE]:  {l:"MOVE",   bg:"#1a2540",c:"#6c8fff",b:"#6c8fff88"},
      [MODES.DELETE]:{l:"DELETE", bg:"#3a1a1a",c:"#ff6b6b",b:"#ff6b6b88"}
    }[mode]||{l:"IDLE",bg:"#303040",c:"#8888aa",b:"#404055"};
    if(!badge) return;
    badge.textContent=c.l; badge.style.background=c.bg; badge.style.color=c.c; badge.style.borderColor=c.b;
  }

  function updSidebarBtns(){
    document.querySelectorAll(".mode-key-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  }

  function toast(txt,dur=1500){
    ntfy.textContent=txt; ntfy.classList.add("show");
    if(notifyTmr)clearTimeout(notifyTmr);
    notifyTmr=setTimeout(()=>ntfy.classList.remove("show"),dur);
  }

  // â”€â”€ SELECTION BAR â”€â”€
  function updSel(){
    if(selPoly<0){hideSel();return;}
    const ln=polys[selPoly]; if(!ln){hideSel();return;}
    selTxt.textContent=`Poly ${selPoly+1} Â· ${ln.points.length} pts`;
    selBar.classList.add("show");
  }
  function hideSel(){selBar.classList.remove("show");}
  function syncSl(){
    if(selPoly<0) return;
    const ln=polys[selPoly]; if(!ln) return;
    if(ln.lw){lineSl.value=ln.lw;curLW=ln.lw;lineVl.textContent=ln.lw+"px";}
    if(ln._bs){sizeSl.value=ln._bs;curSize=ln._bs;sizeVl.textContent=ln._bs;}
  }

  document.getElementById("selDelBtn").addEventListener("click",delSelPoly);
  document.getElementById("selCopyBtn").addEventListener("click",doCopy);
  document.getElementById("selDupBtn").addEventListener("click",doDupe);

  function delSelPoly(){
    if(selPoly<0) return;
    saveU();redoSt=[];polys.splice(selPoly,1);fixIdx(selPoly);
    selPoly=-1;selPt=null;hideSel();ac();toast("Deleted ðŸ—‘");
  }

  // â”€â”€ SHAPES â”€â”€
  function canCenter(){ return {x:(canvas.width/2-panX)/zoom, y:(canvas.height/2-panY)/zoom}; }

  function addShapeAt(type,wx,wy){
    if(type==="freehand"){activeTool="freehand";setMode(MODES.ADDING);toast("Hold mouse to draw freehand",2000);return;}
    if(polys.length>=MAX){toast("Max 100");return;}
    saveU();redoSt=[];
    const col=SHAPE_COLORS[type]||curColor;
    const s=curSize;
    const c={x:wx,y:wy};
    let pts=[],closed=true;

    if(type==="rectangle"){ const w=s*1.3,h=s*0.9; pts=[[c.x-w/2,c.y-h/2],[c.x+w/2,c.y-h/2],[c.x+w/2,c.y+h/2],[c.x-w/2,c.y+h/2]]; }
    else if(type==="diamond"){ pts=[[c.x,c.y-s],[c.x+s,c.y],[c.x,c.y+s],[c.x-s,c.y]]; }
    else if(type==="ellipse"){ pts=ellipsePts(c.x,c.y,s*0.85,s*0.55); }
    else if(type==="circle"){ pts=ellipsePts(c.x,c.y,s*0.6,s*0.6); }
    else if(type==="arrow"){
      const hs=s*0.7;
      pts=[[c.x-hs,c.y],[c.x+hs*0.5,c.y],[c.x+hs*0.2,c.y-s*0.2],[c.x+hs,c.y],[c.x+hs*0.2,c.y+s*0.2],[c.x+hs*0.5,c.y]];
      closed=false;
    }

    polys.push({points:pts,closed,color:col,lw:curLW,_bp:clone(pts),_bc:[c.x,c.y],_bs:s});
    drawIdx=polys.length-1; selPoly=drawIdx; selPt=null;
    updSel(); ac(); toast(`Added ${type} @ size ${s}`);
  }

  function ellipsePts(x,y,rx,ry){
    const n=28,p=[];
    for(let i=0;i<n;i++){const t=Math.PI*2*i/n;p.push([x+rx*Math.cos(t),y+ry*Math.sin(t)]);}
    return p;
  }

  // â”€â”€ UNDO / REDO â”€â”€
  function saveU(){
    undoSt.push(clone(polys));
    if(undoSt.length>MAXSTACK) undoSt.shift();
  }
  function undo(){
    if(!undoSt.length){toast("Nothing to undo");return;}
    redoSt.push(clone(polys)); polys=undoSt.pop();
    if(redoSt.length>MAXSTACK) redoSt.shift();
    selPt=null;selPoly=-1;hideSel();ac(false);toast("Undo â†©");
  }
  function redo(){
    if(!redoSt.length){toast("Nothing to redo");return;}
    undoSt.push(clone(polys)); polys=redoSt.pop();
    if(undoSt.length>MAXSTACK) undoSt.shift();
    selPt=null;selPoly=-1;hideSel();ac(false);toast("Redo â†ª");
  }

  // â”€â”€ PERSIST â”€â”€
  function save(dl,nm){
    const data={polys:clone(polys),savedAt:new Date().toISOString(),v:"3"};
    localStorage.setItem(SK,JSON.stringify(data));
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    if(dl){
      const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=(nm||"polyline-data")+".json";a.click();
    }
    return data;
  }
  function load(){
    try{
      const r=localStorage.getItem(SK); if(!r) return false;
      const d=JSON.parse(r); if(!d||!Array.isArray(d.polys)) return false;
      polys=d.polys.map(l=>({
        points:(l.points||[]).map(p=>[+p[0],+p[1]]),
        closed:!!l.closed,color:l.color||"#fff",lw:l.lw||2,
        _bp:l._bp||null,_bc:l._bc||null,_bs:l._bs||null
      })).slice(0,MAX);
      return true;
    }catch(e){return false;}
  }
  function doRefresh(){
    const ok=load(); toast(ok?"Refreshed!":"No saved data",2000);
    selPt=null;selPoly=-1;hideSel();ac();
  }

  // â”€â”€ HELPERS â”€â”€
  function startNew(){
    if(polys.length>=MAX){toast("Max 100");return;}
    saveU();redoSt=[];
    polys.push({points:[],closed:false,color:curColor,lw:curLW});
    drawIdx=polys.length-1;selPt=null;render();
  }
  function finalizePoly(){
    if(drawIdx<0) return;
    const l=polys[drawIdx];
    if(l&&l.points.length<2) polys.splice(drawIdx,1);
    drawIdx=-1; ac();
  }
  function delPt(pi,ptIdx){
    const l=polys[pi]; if(!l) return;
    l.points.splice(ptIdx,1);
    if(!l.points.length){polys.splice(pi,1);fixIdx(pi);return;}
    l.closed=l.points.length>=3; selPt=null;
  }
  function fixIdx(rm){
    if(drawIdx===rm) drawIdx=-1; else if(drawIdx>rm) drawIdx--;
    if(selPoly===rm){selPoly=-1;hideSel();} else if(selPoly>rm) selPoly--;
    if(selPt&&selPt.pi===rm) selPt=null; else if(selPt&&selPt.pi>rm) selPt.pi--;
  }
  function ac(r=true){
    if(autoSave)save(false);
    if(r)render();
  }
  function updUI(){
    const ln=polys[drawIdx];
    if(ln) topSt.textContent=`Drawing Poly ${drawIdx+1} Â· ${ln.points.length} pts`;
    document.getElementById("stMode").innerHTML=`Mode: <span>${mode}</span>`;
    document.getElementById("stShapes").innerHTML=`Shapes: <span>${polys.length}</span>`;
    document.getElementById("stPoints").innerHTML=`Points: <span>${polys.reduce((s,l)=>s+l.points.length,0)}</span>`;
    document.getElementById("stZoom").innerHTML=`Zoom: <span>${Math.round(zoom*100)}%</span>`;
    document.getElementById("stSize").innerHTML=`Size: <span>${curSize}</span>`;
    document.getElementById("stCoords").innerHTML=`X: <span>${Math.round(mw.x)}</span> Y: <span>${Math.round(mw.y)}</span>`;
  }
  function resz(){
    const r=wrap.getBoundingClientRect();
    const w=Math.max(1,Math.floor(r.width)),h=Math.max(1,Math.floor(r.height));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  }
  function toW(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left-panX)/zoom,y:(e.clientY-r.top-panY)/zoom};}
  function d(x1,y1,x2,y2){return Math.hypot(x2-x1,y2-y1);}
  function getPrevShape(idx){
    if(idx<0) return null;
    for(let i=undoSt.length-1;i>=0;i--){
      const snap=undoSt[i];
      if(snap&&snap[idx]) return clone(snap[idx]);
    }
    return null;
  }
  function startHoldPreview(idx){
    const prev=getPrevShape(idx);
    holdPreview=prev?{index:idx,shape:prev}:null;
  }
  function stopHoldPreview(shouldRender=true){
    if(!holdPreview) return;
    holdPreview=null;
    if(shouldRender) render();
  }
  function calcPolyLength(pts){
    let len=0;
    for(let i=0;i<pts.length-1;i++) len+=d(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]);
    return len;
  }
  function formatDist(dist){return dist<1000?(dist.toFixed(0)+'px'):(dist/1000).toFixed(2)+'km';}
  function nearPt(x,y,t){
    for(let i=polys.length-1;i>=0;i--){
      const p=polys[i].points;
      for(let j=p.length-1;j>=0;j--) if(d(x,y,p[j][0],p[j][1])<=t) return{pi:i,pt:j};
    }
    return null;
  }
  function nearLine(x,y,t){
    for(let i=polys.length-1;i>=0;i--){
      const p=polys[i].points;
      for(let j=0;j<p.length-1;j++) if(segD(x,y,p[j][0],p[j][1],p[j+1][0],p[j+1][1])<=t) return i;
      if(polys[i].closed&&p.length>2) if(segD(x,y,p[0][0],p[0][1],p[p.length-1][0],p[p.length-1][1])<=t) return i;
    }
    return -1;
  }
  function segD(px,py,x1,y1,x2,y2){
    const dx=x2-x1,dy=y2-y1;
    if(!dx&&!dy)return d(px,py,x1,y1);
    const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy)));
    return d(px,py,x1+t*dx,y1+t*dy);
  }
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function zBy(f){zoom=Math.max(0.1,Math.min(10,zoom*f));render();toast(`Zoom ${Math.round(zoom*100)}%`);}

  // â”€â”€ MENU â”€â”€
  function buildMenu(){
    const defs=[
      {label:"File",items:[
        {label:"New",action:()=>{saveU();redoSt=[];polys=[];drawIdx=-1;selPoly=-1;hideSel();ac();toast("Cleared");}},
        {label:"Save",action:()=>{save(true);toast("Saved!");}},
        {label:"Save As",action:()=>{const n=prompt("File name","polyline-data");if(n!==null)save(true,n);}},
        {label:"Copy JSON",action:()=>{navigator.clipboard?.writeText(JSON.stringify(save(false),null,2)).then(()=>toast("JSON copied!"));}}
      ]},
      {label:"Edit",items:[
        {label:"Undo",hint:"Ctrl+Z",action:undo},{label:"Redo",hint:"Ctrl+Y",action:redo},
        {label:"Cut",hint:"Ctrl+X",action:doCut},{label:"Copy",hint:"Ctrl+C",action:doCopy},
        {label:"Paste",hint:"Ctrl+V",action:doPaste},{label:"Duplicate",hint:"Ctrl+D",action:doDupe},
        {label:"Delete",hint:"Del",action:delSelPoly}
      ]},
      {label:"View",items:[
        {label:"Zoom In",hint:"+",action:()=>zBy(1.2)},{label:"Zoom Out",hint:"-",action:()=>zBy(0.8)},
        {label:"Reset View",action:()=>{zoom=1;panX=0;panY=0;render();toast("View reset");}},
        {label:()=>`Theme: ${theme === "dark" ? "Dark" : "Light"}`,action:()=>toggleTheme()},
        {label:()=>`Auto Save: ${autoSave?"ON":"OFF"}`,action:()=>{autoSave=!autoSave;toast("Auto Save "+(autoSave?"ON":"OFF"));rdyn();}}
      ]},
      {label:"Mode",items:[
        {label:()=>isComp?"Exit Comparison":"Before/After",action:()=>{
          if(isComp){isComp=false;beforeSnap=null;toast("Normal view");}
          else{beforeSnap=clone(polys);isComp=true;toast("Comparison ON");}
          rdyn();render();
        }}
      ]}
    ];

    const host=document.getElementById("menuButtons");
    host.innerHTML="";
    const frag=document.createDocumentFragment();
    const all=[];

    defs.forEach(def=>{
      const btn=document.createElement("button");
      btn.className="menu-btn";btn.type="button";btn.textContent=def.label;
      const dd=document.createElement("div");dd.className="dropdown";
      def.items.forEach(item=>{
        const row=document.createElement("div");row.className="dd-item";
        const ls=document.createElement("span");
        ls.textContent=typeof item.label==="function"?item.label():item.label;
        row.appendChild(ls);
        if(item.hint){const h=document.createElement("span");h.className="dd-hint";h.textContent=item.hint;row.appendChild(h);}
        row.addEventListener("click",()=>{item.action();closeM();rdyn();});
        dd.appendChild(row);
      });
      btn.addEventListener("click",e=>{e.stopPropagation();const op=dd.classList.contains("open");closeM();if(!op)openM(btn,dd);});
      frag.appendChild(btn);document.body.appendChild(dd);all.push({def,dd});
    });

    host.appendChild(frag);window._M=all;
    document.addEventListener("click",closeM);
    window.addEventListener("resize",()=>{closeM();render();});

    function rdyn(){
      if(!window._M)return;
      window._M.forEach(({def,dd})=>{
        const rows=dd.querySelectorAll(".dd-item");
        def.items.forEach((item,i)=>{
          const r=rows[i];if(!r)return;
          const s=r.querySelector("span");
          if(s)s.textContent=typeof item.label==="function"?item.label():item.label;
        });
      });
    }
    window._rdyn=rdyn;
  }

  function rdyn(){window._rdyn&&window._rdyn();}
  function openM(btn,dd){
    dd.classList.add("open");
    const br=btn.getBoundingClientRect();
    dd.style.left="0";dd.style.top="0";
    requestAnimationFrame(()=>{
      const dr=dd.getBoundingClientRect();
      let l=br.left+br.width/2-dr.width/2, t=br.bottom+6;
      if(t+dr.height>window.innerHeight-8) t=br.top-dr.height-6;
      l=Math.max(8,Math.min(l,window.innerWidth-dr.width-8));
      dd.style.left=l+"px";dd.style.top=t+"px";
    });
    document.querySelectorAll(".menu-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  }
  function closeM(){
    document.querySelectorAll(".dropdown").forEach(d=>d.classList.remove("open"));
    document.querySelectorAll(".menu-btn").forEach(b=>b.classList.remove("active"));
  }

  // â”€â”€ SIDEBAR â”€â”€
  function setupSidebar(){
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", toggleTheme);
    }
    const guideBtn = document.getElementById("guideBtn");
    const guideModal = document.getElementById("guideModal");
    const guideCloseBtn = document.getElementById("guideCloseBtn");
    if (guideBtn && guideModal) {
      guideBtn.addEventListener("click", () => {
        guideModal.classList.add("show");
      });
      guideCloseBtn.addEventListener("click", () => {
        guideModal.classList.remove("show");
      });
      guideModal.addEventListener("click", (e) => {
        if (e.target === guideModal) {
          guideModal.classList.remove("show");
        }
      });
    }
    document.querySelectorAll(".mode-key-btn").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const m=btn.dataset.mode;
        if(m==="IDLE")setMode(MODES.IDLE);
        else if(m==="ADDING"){activeTool="polyline";setMode(MODES.ADDING);startNew();}
        else if(m==="MOVE")setMode(MODES.MOVE);
        else if(m==="DELETE")setMode(MODES.DELETE);
      });
    });
    document.querySelectorAll(".shape-btn").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const c=canCenter();
        addShapeAt(btn.dataset.shape,c.x,c.y);
      });
    });
  }

  // â”€â”€ INIT â”€â”€
  window.onload=()=>{
    loadTheme();
    load(); drawIcons(); buildColors(); setupSliders();
    buildMenu(); setupSidebar(); setupDragDrop();
    setupMouse(); setupKeys();
    setMode(MODES.IDLE); render();
  };

})();

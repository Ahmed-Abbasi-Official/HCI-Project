(() => {
  "use strict";

  // ═══════════════════════════════════════
  //  CONSTANTS
  // ═══════════════════════════════════════
  const COLORS = ["#5b8aff","#9d6fff","#3dd9a4","#ffd93d","#ff5252","#fb923c","#38bdf8","#f472b6","#ffffff","#94a3b8"];
  const SHAPE_COLORS = { rectangle:"#5b8aff", diamond:"#9d6fff", ellipse:"#3dd9a4", circle:"#ffd93d", arrow:"#ff5252", freehand:"#fb923c" };
  const MODES = { IDLE:"IDLE", ADDING:"ADDING", MOVE:"MOVE", DELETE:"DELETE" };
  const SK = "polyline_editor_v4";
  const THEME_KEY = "polyline_editor_theme";
  const ACCENT_KEY = "polyline_editor_accent";
  const MAX = 100, MAXSTACK = 60;
  const GRID = 20;

  // ═══════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════
  let mode = MODES.IDLE;
  let polys = [];
  let undoSt = [], redoSt = [];
  let selPoly = -1, selPt = null;
  let hovPt = null, hovPoly = -1;
  let drawIdx = -1, activeTool = "polyline";
  let curColor = COLORS[0], curSize = 100, curLW = 2;
  let zoom = 1, panX = 0, panY = 0;
  let isDrag = false, dragChg = false, mdown = false;
  let isPanning = false;
  let panLast = { x: 0, y: 0 };
  let lastDW = { x: 0, y: 0 };
  let freeActive = false;
  let autoSave = true, isComp = false, beforeSnap = null;
  let holdPreview = null;
  let clipboard = null, notifyTmr = null;
  let mw = { x: 0, y: 0 };
  let dragShape = null;
  let theme = "light";
  let accent = "green";
  let snapGrid = true, snapPt = false;
  let alignGuides = { h: null, v: null };

  // Replay state
  let replayActive = false;
  let replayPolyIdx = -1;
  let replayFrame = 0;
  let replayTimer = null;
  let replayPlaying = false;
  let replayHistory = [];

  // ═══════════════════════════════════════
  //  DOM
  // ═══════════════════════════════════════
  const canvas    = document.getElementById("editorCanvas");
  const ctx       = canvas.getContext("2d");
  const wrap      = document.getElementById("canvasWrap");
  const ghost     = document.getElementById("dragGhost");
  const badge     = document.getElementById("modeBadge");
  const ntfy      = document.getElementById("notify");
  const selBar    = document.getElementById("selBar");
  const selTxt    = document.getElementById("selText");
  const topSt     = document.getElementById("topStatus");
  const sizeSl    = document.getElementById("sizeSlider");
  const lineSl    = document.getElementById("lineSlider");
  const sizeVl    = document.getElementById("sizeVal");
  const lineVl    = document.getElementById("lineVal");
  const measurePanel = document.getElementById("measurePanel");
  const measureTxt   = document.getElementById("measureText");
  const replayOverlay  = document.getElementById("replayOverlay");
  const replayTitle    = document.getElementById("replayTitle");
  const replayBarFill  = document.getElementById("replayBarFill");
  const replayCounter  = document.getElementById("replayCounter");
  const rpPlayPause    = document.getElementById("rpPlayPause");
  const rpPrev         = document.getElementById("rpPrev");
  const rpNext         = document.getElementById("rpNext");
  const rpClose        = document.getElementById("rpClose");
  const rpSpeed        = document.getElementById("rpSpeed");

  // ═══════════════════════════════════════
  //  SIDEBAR ICONS
  // ═══════════════════════════════════════
  function drawIcons() {
    const map = {
      "ic-rect":    (_, x) => { x.strokeStyle = "#5b8aff"; x.lineWidth = 2; x.strokeRect(2, 5, 16, 10); },
      "ic-diamond": (_, x) => { x.strokeStyle = "#9d6fff"; x.lineWidth = 2; x.beginPath(); x.moveTo(10, 2); x.lineTo(18, 10); x.lineTo(10, 18); x.lineTo(2, 10); x.closePath(); x.stroke(); },
      "ic-ellipse": (_, x) => { x.strokeStyle = "#3dd9a4"; x.lineWidth = 2; x.beginPath(); x.ellipse(10, 10, 9, 6, 0, 0, Math.PI * 2); x.stroke(); },
      "ic-circle":  (_, x) => { x.strokeStyle = "#ffd93d"; x.lineWidth = 2; x.beginPath(); x.arc(10, 10, 8, 0, Math.PI * 2); x.stroke(); },
      "ic-arrow":   (_, x) => { x.strokeStyle = "#ff5252"; x.lineWidth = 2; x.beginPath(); x.moveTo(1, 10); x.lineTo(15, 10); x.lineTo(11, 6); x.moveTo(15, 10); x.lineTo(11, 14); x.stroke(); },
      "ic-free":    (_, x) => { x.strokeStyle = "#fb923c"; x.lineWidth = 2; x.beginPath(); x.moveTo(2, 16); x.bezierCurveTo(5, 8, 12, 14, 16, 5); x.stroke(); }
    };
    Object.entries(map).forEach(([id, fn]) => {
      const el = document.getElementById(id); if (!el) return;
      el.width = 20; el.height = 20; fn(el, el.getContext("2d"));
    });
  }

  // ═══════════════════════════════════════
  //  COLOR ROW
  // ═══════════════════════════════════════
  function buildColors() {
    const row = document.getElementById("colorRow");
    COLORS.forEach(c => {
      const sw = document.createElement("div");
      sw.className = "color-swatch" + (c === curColor ? " selected" : "");
      sw.style.background = c; sw.title = c;
      sw.addEventListener("click", () => {
        curColor = c;
        document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
        sw.classList.add("selected");
        if (selPoly >= 0 && polys[selPoly]) { saveU(); polys[selPoly].color = c; ac(); }
        toast("Color " + c);
      });
      row.appendChild(sw);
    });
  }

  // ═══════════════════════════════════════
  //  THEME
  // ═══════════════════════════════════════
  function loadTheme() {
    try { theme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch (_) { theme = "light"; }
    applyTheme(false);
  }

  function applyTheme(showToast = true) {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    const icon = document.getElementById("themeIcon");
    if (icon) icon.textContent = theme === "dark" ? "☀" : "☾";
    if (showToast) toast("Theme: " + theme);
    render();
  }

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    applyTheme(true);
  }

  function loadAccent() {
    accent = "green";
    applyAccent(false);
  }

  function applyAccent(showToast = true) {
    accent = "green";
    document.documentElement.dataset.accent = accent;
    document.body.dataset.accent = accent;
    const accentSelect = document.getElementById("accentSelect");
    if (accentSelect) accentSelect.value = accent;
    if (showToast) toast("Accent: " + accent);
    render();
  }

  // ═══════════════════════════════════════
  //  SLIDERS
  // ═══════════════════════════════════════
  function setupSliders() {
    const upBg = sl => {
      const p = ((+sl.value - +sl.min) / (+sl.max - +sl.min) * 100).toFixed(1) + "%";
      sl.style.setProperty("--pct", p);
    };
    sizeSl.addEventListener("input", () => {
      curSize = +sizeSl.value; sizeVl.textContent = curSize; upBg(sizeSl);
      if (selPoly >= 0 && polys[selPoly]) {
        const ln = polys[selPoly];
        if (ln._bp && ln._bc) {
          const sc = curSize / (ln._bs || 100);
          const [bx, by] = ln._bc;
          ln.points = ln._bp.map(([px, py]) => [bx + (px - bx) * sc, by + (py - by) * sc]);
          ac();
        }
      }
    });
    lineSl.addEventListener("input", () => {
      curLW = +lineSl.value; lineVl.textContent = curLW + "px"; upBg(lineSl);
      if (selPoly >= 0 && polys[selPoly]) { polys[selPoly].lw = curLW; ac(); }
    });
    upBg(sizeSl); upBg(lineSl);
  }

  // ═══════════════════════════════════════
  //  SNAP LOGIC
  // ═══════════════════════════════════════
  function snapPoint(x, y) {
    let rx = x, ry = y;
    if (snapGrid) {
      rx = Math.round(x / GRID) * GRID;
      ry = Math.round(y / GRID) * GRID;
    }
    if (snapPt) {
      // Point-to-point snap
      let best = 12 / zoom, bx = rx, by = ry;
      polys.forEach((ln, pi) => {
        ln.points.forEach(([px, py], ptIdx) => {
          if (pi === drawIdx) return;
          const dd = d(x, y, px, py);
          if (dd < best) { best = dd; bx = px; by = py; }
        });
      });
      rx = bx; ry = by;
    }
    return [rx, ry];
  }

  function calcAlignGuides(x, y) {
    alignGuides = { h: null, v: null };
    const thresh = 8 / zoom;
    polys.forEach((ln, pi) => {
      if (pi === selPoly) return;
      ln.points.forEach(([px, py]) => {
        if (Math.abs(py - y) < thresh) alignGuides.h = py;
        if (Math.abs(px - x) < thresh) alignGuides.v = px;
      });
    });
  }

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════
  function render() {
    resz();
    syncGridOverlay();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isComp && beforeSnap) { renderComp(); return; }

    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);

    // Draw alignment guides
    drawAlignGuides();

    if (replayActive) {
      renderReplayFrame();
    } else {
      drawAll();
    }

    ctx.restore();
    updUI();
  }

  function syncGridOverlay() {
    const spacing = Math.max(2, GRID * zoom);
    const mod = (v, n) => ((v % n) + n) % n;
    wrap.style.setProperty("--grid-size", `${spacing}px`);
    wrap.style.setProperty("--grid-offset-x", `${mod(panX, spacing)}px`);
    wrap.style.setProperty("--grid-offset-y", `${mod(panY, spacing)}px`);
  }

  function drawAll() {
    polys.forEach((ln, i) => {
      if (holdPreview && holdPreview.index === i) {
        // Draw ghost of previous state
        ctx.save(); ctx.globalAlpha = 0.35;
        drawPoly(holdPreview.shape, false, false);
        ctx.restore();
        drawPoly(ln, i === drawIdx, i === selPoly);
      } else {
        drawPoly(ln, i === drawIdx, i === selPoly);
      }
    });
    polys.forEach((ln, i) => {
      ln.points.forEach(([x, y], p) => {
        const iS = selPt && selPt.pi === i && selPt.pt === p;
        const iH = hovPt && hovPt.pi === i && hovPt.pt === p;
        drawDot(x, y, iS, iH, ln.color || "#fff");
      });
    });
    // Live preview line while drawing
    if (mode === MODES.ADDING && activeTool === "polyline" && drawIdx >= 0 && polys[drawIdx] && polys[drawIdx].points.length > 0) {
      drawPreviewLine();
    }
    // Snapped cursor indicator
    if (snapGrid && mode === MODES.ADDING) {
      const [sx, sy] = snapPoint(mw.x, mw.y);
      ctx.beginPath(); ctx.arc(sx, sy, 4 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = curColor + "88"; ctx.fill();
    }
  }

  function drawPoly(ln, isAct, isSel) {
    const pts = ln.points; if (!pts.length) return;
    const col = ln.color || "#fff", lw = ln.lw || 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (ln.closed && pts.length > 2) ctx.closePath();

    if (isSel) {
      ctx.shadowColor = col; ctx.shadowBlur = 18 / zoom;
      ctx.lineWidth = (lw + 4) / zoom; ctx.strokeStyle = col; ctx.globalAlpha = 0.25;
      ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    ctx.lineWidth = (isAct ? lw + 0.5 : lw) / zoom;
    ctx.strokeStyle = isSel ? col : (isAct ? col : col + "dd");
    ctx.stroke();

    if (isSel) {
      ctx.setLineDash([6 / zoom, 4 / zoom]); ctx.lineWidth = 1.5 / zoom;
      ctx.strokeStyle = "#ffffff22"; ctx.stroke(); ctx.setLineDash([]);
    }

    // Segment distance labels
    ctx.font = (10 / zoom) + "px JetBrains Mono";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < pts.length - 1; i++) {
      const len = d(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      const angle = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      ctx.save();
      ctx.translate(mx, my); ctx.rotate(angle);
      ctx.fillStyle = col + "bb";
      ctx.fillText(fmtDist(len), 0, -7 / zoom);
      ctx.restore();
    }

    // Label annotation
    if (ln.label) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      ctx.font = `bold ${12 / zoom}px Syne`;
      ctx.fillStyle = col;
      ctx.textAlign = "center";
      ctx.fillText(ln.label, cx, cy);
    }

    ctx.restore();
  }

  function drawDot(x, y, isSel, isHov, col) {
    const r = 4 / zoom;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? "#ff5252" : (isHov ? "#ffd93d" : (col || "#d0d0e0")); ctx.fill();
    if (isSel) {
      ctx.beginPath(); ctx.arc(x, y, 9 / zoom, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff525288"; ctx.lineWidth = 1.5 / zoom; ctx.stroke();
    }
  }

  function drawPreviewLine() {
    const ln = polys[drawIdx]; if (!ln || !ln.points.length) return;
    const last = ln.points[ln.points.length - 1];
    const [sx, sy] = snapPoint(mw.x, mw.y);
    const dist = d(last[0], last[1], sx, sy);
    const col = ln.color || "#fff";
    ctx.save();
    ctx.setLineDash([5 / zoom, 5 / zoom]);
    ctx.lineWidth = 1.5 / zoom; ctx.strokeStyle = col + "66";
    ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.setLineDash([]);
    // Live distance
    const mx = (last[0] + sx) / 2, my = (last[1] + sy) / 2;
    ctx.font = (10 / zoom) + "px JetBrains Mono";
    ctx.fillStyle = col + "cc"; ctx.textAlign = "center";
    ctx.fillText(fmtDist(dist), mx, my - 8 / zoom);
    ctx.restore();
    // Update status
    topSt.textContent = `Drawing — Distance: ${fmtDist(dist)} · Click to add · B=new · ESC=finish`;
  }

  function drawAlignGuides() {
    if (alignGuides.h !== null) {
      ctx.save(); ctx.strokeStyle = "var(--guide-line, #5b8aff88)";
      ctx.setLineDash([4 / zoom, 4 / zoom]); ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo((0 - panX) / zoom, alignGuides.h);
      ctx.lineTo((canvas.width - panX) / zoom, alignGuides.h);
      ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
    if (alignGuides.v !== null) {
      ctx.save(); ctx.strokeStyle = "var(--guide-line, #5b8aff88)";
      ctx.setLineDash([4 / zoom, 4 / zoom]); ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(alignGuides.v, (0 - panY) / zoom);
      ctx.lineTo(alignGuides.v, (canvas.height - panY) / zoom);
      ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
  }

  function renderComp() {
    const h = canvas.width / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, h, canvas.height); ctx.clip();
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
    (beforeSnap || []).forEach(ln => drawPoly(ln, false, false));
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(h, 0, h, canvas.height); ctx.clip();
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
    polys.forEach(ln => drawPoly(ln, false, false));
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = "#5b8aff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(h, 0); ctx.lineTo(h, canvas.height); ctx.stroke();
    ctx.fillStyle = "#b8c8ff"; ctx.font = "bold 11px JetBrains Mono";
    ctx.fillText("BEFORE", 10, 20); ctx.fillText("AFTER", h + 10, 20);
  }

  // ═══════════════════════════════════════
  //  MOUSE
  // ═══════════════════════════════════════
  function setupMouse() {
    canvas.addEventListener("mousemove", e => {
      if (isPanning) {
        const dx = e.clientX - panLast.x;
        const dy = e.clientY - panLast.y;
        panX += dx;
        panY += dy;
        panLast = { x: e.clientX, y: e.clientY };
        render();
        return;
      }

      const w = toW(e); mw = w;
      hovPt = nearPt(w.x, w.y, 10 / zoom);
      hovPoly = hovPt ? hovPt.pi : nearLine(w.x, w.y, 7 / zoom);

      if (mode === MODES.MOVE && isDrag && selPt) {
        if (!dragChg) { saveU(); redoSt = []; stopHold(false); }
        const [sx, sy] = snapPoint(w.x, w.y);
        calcAlignGuides(sx, sy);
        polys[selPt.pi].points[selPt.pt] = [sx, sy];
        dragChg = true;
      }
      if (mode === MODES.MOVE && isDrag && selPoly >= 0 && !selPt && mdown) {
        if (!dragChg) { saveU(); redoSt = []; stopHold(false); }
        const dx = w.x - lastDW.x, dy = w.y - lastDW.y;
        polys[selPoly].points = polys[selPoly].points.map(([px, py]) => [px + dx, py + dy]);
        const ln = polys[selPoly];
        if (ln._bc) { ln._bc = [ln._bc[0] + dx, ln._bc[1] + dy]; ln._bp = ln._bp.map(([px, py]) => [px + dx, py + dy]); }
        lastDW = w; dragChg = true;
      }
      if (mode === MODES.ADDING && activeTool === "freehand" && freeActive && drawIdx >= 0) {
        const ln = polys[drawIdx]; const last = ln.points[ln.points.length - 1];
        if (!last || d(last[0], last[1], w.x, w.y) > 5) ln.points.push([w.x, w.y]);
      }
      updCursor(); render();
    });

    canvas.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      const w = toW(e); mdown = true; lastDW = w;

      // Drag empty background to pan grid/view.
      if (mode !== MODES.ADDING && mode !== MODES.DELETE) {
        const pH = nearPt(w.x, w.y, 10 / zoom);
        const lH = nearLine(w.x, w.y, 7 / zoom);
        if (!pH && lH < 0) {
          isPanning = true;
          panLast = { x: e.clientX, y: e.clientY };
          canvas.style.cursor = "grabbing";
          return;
        }
      }

      if (mode === MODES.ADDING) {
        if (activeTool === "freehand") {
          if (polys.length >= MAX) { toast("Max 100"); return; }
          saveU(); redoSt = [];
          polys.push({ points: [[w.x, w.y]], closed: false, color: curColor, lw: curLW, _history: [[[w.x, w.y]]] });
          drawIdx = polys.length - 1; freeActive = true; return;
        }
        if (drawIdx < 0 || !polys[drawIdx]) {
          if (polys.length >= MAX) { toast("Max 100"); return; }
          saveU(); redoSt = [];
          polys.push({ points: [], closed: false, color: curColor, lw: curLW, _history: [] });
          drawIdx = polys.length - 1;
        } else { saveU(); redoSt = []; }
        const [sx, sy] = snapPoint(w.x, w.y);
        polys[drawIdx].points.push([sx, sy]);
        // Record history snapshot
        if (!polys[drawIdx]._history) polys[drawIdx]._history = [];
        polys[drawIdx]._history.push(polys[drawIdx].points.map(p => [...p]));
        ac(); return;
      }

      if (mode === MODES.MOVE) {
        const pH = nearPt(w.x, w.y, 10 / zoom);
        if (pH) { selPt = pH; selPoly = pH.pi; isDrag = true; dragChg = false; startHold(pH.pi); updSel(); render(); return; }
        const lH = nearLine(w.x, w.y, 7 / zoom);
        if (lH >= 0) { selPoly = lH; selPt = null; isDrag = true; dragChg = false; lastDW = w; startHold(lH); updSel(); syncSl(); render(); return; }
        stopHold(false); selPoly = -1; selPt = null; hideSel(); render(); return;
      }

      if (mode === MODES.DELETE) {
        stopHold(false);
        const pH = nearPt(w.x, w.y, 10 / zoom);
        if (pH) { saveU(); redoSt = []; delPt(pH.pi, pH.pt); ac(); return; }
        const lH = nearLine(w.x, w.y, 7 / zoom);
        if (lH >= 0) { saveU(); redoSt = []; polys.splice(lH, 1); fixIdx(lH); ac(); return; }
      }

      if (mode === MODES.IDLE) {
        const lH = nearLine(w.x, w.y, 7 / zoom);
        const pH = nearPt(w.x, w.y, 10 / zoom);
        const hit = pH ? pH.pi : lH;
        if (hit >= 0) { selPoly = hit; selPt = null; startHold(hit); updSel(); syncSl(); showMeasure(); render(); return; }
        stopHold(false); selPoly = -1; selPt = null; hideSel(); hideMeasure(); render();
      }
    });

    window.addEventListener("mouseup", () => {
      if (isPanning) {
        isPanning = false;
        mdown = false;
        updCursor();
        render();
        return;
      }

      if (mode === MODES.ADDING && activeTool === "freehand" && freeActive) {
        freeActive = false;
        const ln = polys[drawIdx];
        if (ln && ln.points.length < 2) { polys.pop(); drawIdx = -1; }
        else if (ln) {
          if (!ln._history) ln._history = [];
          ln._history.push(ln.points.map(p => [...p]));
        }
        ac();
      }
      if (mode === MODES.MOVE && isDrag) {
        isDrag = false; alignGuides = { h: null, v: null };
        if (dragChg) {
          // Record move in history
          if (selPoly >= 0 && polys[selPoly]) {
            const ln = polys[selPoly];
            if (!ln._history) ln._history = [];
            ln._history.push(ln.points.map(p => [...p]));
          }
          ac();
        } else render();
      }
      stopHold(false);
      mdown = false;
      render();
    });

    canvas.addEventListener("mouseleave", () => {
      if (isPanning) {
        isPanning = false;
        mdown = false;
      }
      hovPt = null;
      stopHold(false);
      alignGuides = { h: null, v: null };
      updCursor();
      render();
    });

    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 0.9;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const old = zoom; zoom = Math.max(0.1, Math.min(10, zoom * f));
      panX = cx - (cx - panX) * (zoom / old); panY = cy - (cy - panY) * (zoom / old);
      render();
    }, { passive: false });

    // Double-click to add label annotation
    canvas.addEventListener("dblclick", e => {
      const w = toW(e);
      const lH = nearLine(w.x, w.y, 10 / zoom);
      if (lH >= 0) {
        const current = polys[lH].label || "";
        const label = prompt("Shape label (leave blank to remove):", current);
        if (label !== null) { polys[lH].label = label.trim(); ac(); }
      }
    });
  }

  function updCursor() {
    if (mode === MODES.MOVE) { canvas.style.cursor = hovPt ? "grab" : (hovPoly >= 0 ? "move" : "default"); }
    else if (mode === MODES.ADDING) { canvas.style.cursor = "crosshair"; }
    else if (mode === MODES.DELETE) { canvas.style.cursor = (hovPt || hovPoly >= 0) ? "not-allowed" : "crosshair"; }
    else { canvas.style.cursor = hovPoly >= 0 ? "pointer" : "default"; }
  }

  // ═══════════════════════════════════════
  //  HOLD PREVIEW
  // ═══════════════════════════════════════
  function startHold(idx) {
    const ln = polys[idx]; if (!ln) return;
    const hist = ln._history;
    if (hist && hist.length > 1) {
      const prev = hist[hist.length - 2];
      holdPreview = { index: idx, shape: { points: prev.map(p => [...p]), closed: ln.closed, color: ln.color, lw: ln.lw } };
    } else { holdPreview = null; }
  }
  function stopHold(r = true) { if (!holdPreview) return; holdPreview = null; if (r) render(); }

  // ═══════════════════════════════════════
  //  DRAG & DROP FROM SIDEBAR
  // ═══════════════════════════════════════
  function setupDragDrop() {
    document.querySelectorAll(".shape-btn[draggable='true']").forEach(btn => {
      btn.addEventListener("dragstart", e => {
        dragShape = btn.dataset.shape;
        btn.classList.add("dragging-source");
        ghost.textContent = "⬡ " + btn.dataset.shape;
        ghost.style.display = "block";
        ghost.style.left = "-9999px"; ghost.style.top = "-9999px";
        try { e.dataTransfer.setDragImage(ghost, 50, 20); } catch (_) {}
        e.dataTransfer.effectAllowed = "copy";
      });
      btn.addEventListener("dragend", () => {
        btn.classList.remove("dragging-source");
        ghost.style.display = "none";
        wrap.classList.remove("drop-active");
        dragShape = null;
      });
    });

    wrap.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; wrap.classList.add("drop-active"); });
    wrap.addEventListener("dragleave", () => wrap.classList.remove("drop-active"));
    wrap.addEventListener("drop", e => {
      e.preventDefault(); wrap.classList.remove("drop-active");
      if (!dragShape) return;
      const rect = canvas.getBoundingClientRect();
      const wx = (e.clientX - rect.left - panX) / zoom, wy = (e.clientY - rect.top - panY) / zoom;
      addShapeAt(dragShape, wx, wy);
      dragShape = null;
    });
  }

  // ═══════════════════════════════════════
  //  KEYBOARD
  // ═══════════════════════════════════════
  function setupKeys() {
    document.addEventListener("keydown", e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && k === "z") { e.preventDefault(); undo(); return; }
      if (ctrl && k === "y") { e.preventDefault(); redo(); return; }
      if (ctrl && k === "c") { e.preventDefault(); doCopy(); return; }
      if (ctrl && k === "x") { e.preventDefault(); doCut(); return; }
      if (ctrl && k === "v") { e.preventDefault(); doPaste(); return; }
      if (ctrl && k === "d") { e.preventDefault(); doDupe(); return; }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement === document.body || document.activeElement === canvas) {
          e.preventDefault();
          if (selPoly >= 0) { delSelPoly(); return; }
          if (selPt) { saveU(); redoSt = []; delPt(selPt.pi, selPt.pt); selPt = null; ac(); return; }
        }
      }

      if (k === "b") { e.preventDefault(); activeTool = "polyline"; if (mode !== MODES.ADDING) setMode(MODES.ADDING); startNew(); return; }
      if (k === "m") { e.preventDefault(); setMode(MODES.MOVE); return; }
      if (k === "d" && !ctrl) { e.preventDefault(); setMode(MODES.DELETE); return; }
      if (k === "r") { e.preventDefault(); doRefresh(); return; }
      if (k === "g") { e.preventDefault(); toggleSnapGrid(); return; }
      if (k === "s" && !ctrl) { e.preventDefault(); toggleSnapPt(); return; }
      if (k === "escape" || k === "q") {
        e.preventDefault(); selPt = null; isDrag = false;
        if (mode === MODES.ADDING) finalizePoly();
        setMode(MODES.IDLE);
      }

      // Arrow nudge selected shape
      if (selPoly >= 0 && ["arrowup","arrowdown","arrowleft","arrowright"].includes(k)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "arrowright" ? step : k === "arrowleft" ? -step : 0;
        const dy = k === "arrowdown" ? step : k === "arrowup" ? -step : 0;
        saveU(); redoSt = [];
        polys[selPoly].points = polys[selPoly].points.map(([px, py]) => [px + dx, py + dy]);
        const ln = polys[selPoly];
        if (ln._bc) { ln._bc = [ln._bc[0] + dx, ln._bc[1] + dy]; ln._bp = ln._bp.map(([px, py]) => [px + dx, py + dy]); }
        if (!ln._history) ln._history = [];
        ln._history.push(ln.points.map(p => [...p]));
        ac();
        return;
      }

      // Arrow pan view/grid when nothing is selected
      if (selPoly < 0 && ["arrowup","arrowdown","arrowleft","arrowright"].includes(k)) {
        e.preventDefault();
        const step = e.shiftKey ? GRID * 2 : GRID;
        const dx = k === "arrowright" ? step : k === "arrowleft" ? -step : 0;
        const dy = k === "arrowdown" ? step : k === "arrowup" ? -step : 0;
        panX += dx;
        panY += dy;
        render();
        return;
      }
    });
  }

  // ═══════════════════════════════════════
  //  SNAP TOGGLES
  // ═══════════════════════════════════════
  function toggleSnapGrid() {
    snapGrid = !snapGrid;
    document.getElementById("snapGridBtn").classList.toggle("active", snapGrid);
    wrap.classList.toggle("snap-active", snapGrid);
    document.getElementById("stSnap").innerHTML = `Snap: <span>${snapGrid ? "Grid" : (snapPt ? "Pt" : "Off")}</span>`;
    toast("Grid Snap: " + (snapGrid ? "ON" : "OFF"));
  }
  function toggleSnapPt() {
    snapPt = !snapPt;
    document.getElementById("snapPtBtn").classList.toggle("active", snapPt);
    document.getElementById("stSnap").innerHTML = `Snap: <span>${snapGrid ? "Grid" : (snapPt ? "Pt" : "Off")}</span>`;
    toast("Point Snap: " + (snapPt ? "ON" : "OFF"));
  }

  // ═══════════════════════════════════════
  //  CLIPBOARD
  // ═══════════════════════════════════════
  function doCopy() { if (selPoly < 0) { toast("Nothing selected"); return; } clipboard = clone(polys[selPoly]); toast("Copied ⎘"); }
  function doCut() {
    if (selPoly < 0) { toast("Nothing selected"); return; }
    saveU(); redoSt = [];
    clipboard = clone(polys[selPoly]);
    polys.splice(selPoly, 1); fixIdx(selPoly);
    selPoly = -1; selPt = null; hideSel(); ac(); toast("Cut ✂");
  }
  function doPaste() {
    if (!clipboard) { toast("Clipboard empty"); return; }
    if (polys.length >= MAX) { toast("Max 100"); return; }
    saveU(); redoSt = [];
    const s = clone(clipboard);
    s.points = s.points.map(([px, py]) => [px + 24, py + 24]);
    if (s._bc) s._bc = [s._bc[0] + 24, s._bc[1] + 24];
    if (s._bp) s._bp = s._bp.map(([px, py]) => [px + 24, py + 24]);
    if (s._history) s._history = s._history.map(snap => snap.map(p => [p[0] + 24, p[1] + 24]));
    polys.push(s); selPoly = polys.length - 1; selPt = null;
    updSel(); ac(); toast("Pasted ⬡");
  }
  function doDupe() { if (selPoly < 0) { toast("Nothing selected"); return; } clipboard = clone(polys[selPoly]); doPaste(); }

  // ═══════════════════════════════════════
  //  SHAPE RECOGNITION
  // ═══════════════════════════════════════
  function recognizeShape() {
    if (selPoly < 0) { toast("Select a shape first"); return; }
    const ln = polys[selPoly];
    if (!ln || ln.points.length < 3) { toast("Need 3+ points"); return; }
    const pts = ln.points;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const w = maxX - minX, h = maxY - minY;

    // Compute average distance from centroid
    const avgR = pts.reduce((s, [px, py]) => s + d(cx, cy, px, py), 0) / pts.length;
    // Variance
    const variance = pts.reduce((s, [px, py]) => s + Math.pow(d(cx, cy, px, py) - avgR, 2), 0) / pts.length;
    const circularity = variance / (avgR * avgR + 0.001);

    saveU(); redoSt = [];
    let recognized = "unknown";

    if (circularity < 0.04) {
      // Circle
      const newPts = ellipsePts(cx, cy, avgR, avgR);
      ln.points = newPts; ln.closed = true;
      if (!ln._history) ln._history = [];
      ln._history.push(newPts.map(p => [...p]));
      recognized = "circle";
    } else if (Math.abs(w - h) / Math.max(w, h) < 0.2 && circularity < 0.2) {
      // Ellipse
      const rx = w / 2, ry = h / 2;
      const newPts = ellipsePts(cx, cy, rx, ry);
      ln.points = newPts; ln.closed = true;
      if (!ln._history) ln._history = [];
      ln._history.push(newPts.map(p => [...p]));
      recognized = "ellipse";
    } else if (pts.length >= 3 && pts.length <= 6) {
      // Try rectangle
      const newPts = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
      ln.points = newPts; ln.closed = true;
      if (!ln._history) ln._history = [];
      ln._history.push(newPts.map(p => [...p]));
      recognized = "rectangle";
    } else {
      // Triangle / polygon — keep, just close it
      ln.closed = true;
      toast("Shape closed (polygon)"); ac(); return;
    }

    ac(); toast("Recognized as " + recognized + " ✓");
  }

  // ═══════════════════════════════════════
  //  MEASUREMENT
  // ═══════════════════════════════════════
  function showMeasure() {
    if (selPoly < 0) { hideMeasure(); return; }
    const ln = polys[selPoly]; if (!ln) { hideMeasure(); return; }
    const pts = ln.points;

    // Perimeter
    let perim = 0;
    for (let i = 0; i < pts.length - 1; i++) perim += d(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (ln.closed && pts.length > 2) perim += d(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);

    // Area (Shoelace formula)
    let area = 0;
    if (ln.closed && pts.length > 2) {
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        area += pts[i][0] * pts[j][1];
        area -= pts[j][0] * pts[i][1];
      }
      area = Math.abs(area) / 2;
    }

    let txt = `Perimeter: ${fmtDist(perim)}`;
    if (area > 0) txt += ` · Area: ${Math.round(area).toLocaleString()} px²`;
    measureTxt.textContent = txt;
    measurePanel.classList.add("show");
  }

  function hideMeasure() { measurePanel.classList.remove("show"); }

  // ═══════════════════════════════════════
  //  TIMELINE REPLAY
  // ═══════════════════════════════════════
  function startReplay(polyIdx) {
    if (polyIdx < 0) { toast("Select a shape first"); return; }
    const ln = polys[polyIdx];
    if (!ln || !ln._history || ln._history.length < 2) {
      toast("No drawing history for this shape"); return;
    }

    replayPolyIdx = polyIdx;
    replayHistory = ln._history.map(snap => snap.map(p => [...p]));
    replayFrame = 0;
    replayActive = true;
    replayPlaying = true;

    replayTitle.textContent = `▶ Replaying Shape ${polyIdx + 1} — ${ln.label || ""}`;
    replayOverlay.classList.add("show");
    rpPlayPause.textContent = "⏸";

    updReplayUI();
    startReplayTimer();
    render();
  }

  function stopReplay() {
    replayActive = false;
    replayPlaying = false;
    clearInterval(replayTimer);
    replayOverlay.classList.remove("show");
    render();
  }

  function startReplayTimer() {
    clearInterval(replayTimer);
    const speed = +rpSpeed.value;
    replayTimer = setInterval(() => {
      if (!replayPlaying) return;
      replayFrame++;
      if (replayFrame >= replayHistory.length) {
        replayFrame = replayHistory.length - 1;
        replayPlaying = false;
        rpPlayPause.textContent = "▶";
        clearInterval(replayTimer);
      }
      updReplayUI();
      render();
    }, speed);
  }

  function updReplayUI() {
    const pct = replayHistory.length > 1
      ? (replayFrame / (replayHistory.length - 1) * 100).toFixed(1)
      : 100;
    replayBarFill.style.width = pct + "%";
    replayCounter.textContent = `${replayFrame + 1} / ${replayHistory.length}`;
  }

  function renderReplayFrame() {
    // Draw all other polys normally
    polys.forEach((ln, i) => {
      if (i !== replayPolyIdx) drawPoly(ln, false, false);
    });
    // Draw replay shape up to current frame
    if (replayPolyIdx >= 0 && replayHistory[replayFrame]) {
      const ln = polys[replayPolyIdx];
      const framePts = replayHistory[replayFrame];
      const fakeLn = { points: framePts, closed: false, color: ln.color, lw: ln.lw, label: ln.label };
      drawPoly(fakeLn, true, false);
      // Draw dots
      framePts.forEach(([x, y]) => drawDot(x, y, false, false, ln.color));
    }
  }

  // Replay controls
  rpPlayPause.addEventListener("click", () => {
    if (!replayActive) return;
    replayPlaying = !replayPlaying;
    rpPlayPause.textContent = replayPlaying ? "⏸" : "▶";
    if (replayPlaying) {
      if (replayFrame >= replayHistory.length - 1) replayFrame = 0;
      startReplayTimer();
    } else { clearInterval(replayTimer); }
  });

  rpPrev.addEventListener("click", () => {
    if (!replayActive) return;
    clearInterval(replayTimer); replayPlaying = false; rpPlayPause.textContent = "▶";
    replayFrame = Math.max(0, replayFrame - 1);
    updReplayUI(); render();
  });

  rpNext.addEventListener("click", () => {
    if (!replayActive) return;
    clearInterval(replayTimer); replayPlaying = false; rpPlayPause.textContent = "▶";
    replayFrame = Math.min(replayHistory.length - 1, replayFrame + 1);
    updReplayUI(); render();
  });

  rpClose.addEventListener("click", stopReplay);

  rpSpeed.addEventListener("change", () => {
    if (replayPlaying) startReplayTimer();
  });

  // ═══════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════
  function exportPNG() {
    const link = document.createElement("a");
    link.download = "polyline-editor-" + Date.now() + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast("PNG exported ✓");
  }

  // ═══════════════════════════════════════
  //  MODES
  // ═══════════════════════════════════════
  function setMode(m) {
    stopHold(false);
    mode = m;
    const msgs = {
      [MODES.IDLE]: "Idle — click shape to select · double-click to label · drag sidebar shapes",
      [MODES.ADDING]: "Drawing — click to add points · B=new polyline · ESC=finish",
      [MODES.MOVE]: "Move — drag point/shape · drag empty grid to pan · arrows=nudge/pan",
      [MODES.DELETE]: "Delete — click point to remove · click line to delete shape"
    };
    if (mode !== MODES.ADDING) topSt.textContent = msgs[m] || "";
    updBadge(); toast("→ " + m, 1200); updSidebarBtns(); updCursor(); render();
  }

  function updBadge() {
    const cfg = {
      [MODES.IDLE]:   { l: "IDLE",    bg: "#1a1a2a", c: "#6060a0", b: "#2e2e50" },
      [MODES.ADDING]: { l: "DRAWING", bg: "#0f2820", c: "#3dd9a4", b: "#3dd9a466" },
      [MODES.MOVE]:   { l: "MOVE",    bg: "#0f1e3a", c: "#5b8aff", b: "#5b8aff66" },
      [MODES.DELETE]: { l: "DELETE",  bg: "#2a0f0f", c: "#ff5252", b: "#ff525266" }
    }[mode] || { l: "IDLE", bg: "#1a1a2a", c: "#6060a0", b: "#2e2e50" };
    badge.textContent = cfg.l;
    badge.style.background = cfg.bg;
    badge.style.color = cfg.c;
    badge.style.borderColor = cfg.b;
  }

  function updSidebarBtns() {
    document.querySelectorAll(".mode-key-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  }

  function toast(txt, dur = 1500) {
    ntfy.textContent = txt; ntfy.classList.add("show");
    if (notifyTmr) clearTimeout(notifyTmr);
    notifyTmr = setTimeout(() => ntfy.classList.remove("show"), dur);
  }

  // ═══════════════════════════════════════
  //  SELECTION BAR
  // ═══════════════════════════════════════
  function updSel() {
    if (selPoly < 0) { hideSel(); return; }
    const ln = polys[selPoly]; if (!ln) { hideSel(); return; }
    selTxt.textContent = `Shape ${selPoly + 1}${ln.label ? " · " + ln.label : ""} · ${ln.points.length} pts`;
    selBar.classList.add("show");
    showMeasure();
  }
  function hideSel() { selBar.classList.remove("show"); hideMeasure(); }
  function syncSl() {
    if (selPoly < 0) return;
    const ln = polys[selPoly]; if (!ln) return;
    if (ln.lw) { lineSl.value = ln.lw; curLW = ln.lw; lineVl.textContent = ln.lw + "px"; }
    if (ln._bs) { sizeSl.value = ln._bs; curSize = ln._bs; sizeVl.textContent = ln._bs; }
  }

  document.getElementById("selDelBtn").addEventListener("click", delSelPoly);
  document.getElementById("selCopyBtn").addEventListener("click", doCopy);
  document.getElementById("selDupBtn").addEventListener("click", doDupe);
  document.getElementById("selRecogBtn").addEventListener("click", recognizeShape);
  document.getElementById("selReplayBtn").addEventListener("click", () => startReplay(selPoly));

  function delSelPoly() {
    if (selPoly < 0) return;
    saveU(); redoSt = [];
    polys.splice(selPoly, 1); fixIdx(selPoly);
    selPoly = -1; selPt = null; hideSel(); ac(); toast("Deleted");
  }

  // ═══════════════════════════════════════
  //  SHAPES
  // ═══════════════════════════════════════
  function canCenter() { return { x: (canvas.width / 2 - panX) / zoom, y: (canvas.height / 2 - panY) / zoom }; }

  function addShapeAt(type, wx, wy) {
    if (type === "freehand") { activeTool = "freehand"; setMode(MODES.ADDING); toast("Hold mouse to draw freehand", 2000); return; }
    if (polys.length >= MAX) { toast("Max 100"); return; }
    saveU(); redoSt = [];
    const col = SHAPE_COLORS[type] || curColor;
    const s = curSize, c = { x: wx, y: wy };
    let pts = [], closed = true;

    if (type === "rectangle") { const w = s * 1.3, h = s * 0.9; pts = [[c.x - w / 2, c.y - h / 2],[c.x + w / 2, c.y - h / 2],[c.x + w / 2, c.y + h / 2],[c.x - w / 2, c.y + h / 2]]; }
    else if (type === "diamond") { pts = [[c.x, c.y - s],[c.x + s, c.y],[c.x, c.y + s],[c.x - s, c.y]]; }
    else if (type === "ellipse") { pts = ellipsePts(c.x, c.y, s * 0.85, s * 0.55); }
    else if (type === "circle") { pts = ellipsePts(c.x, c.y, s * 0.6, s * 0.6); }
    else if (type === "arrow") {
      const hs = s * 0.7;
      pts = [[c.x - hs, c.y],[c.x + hs * 0.5, c.y],[c.x + hs * 0.2, c.y - s * 0.2],[c.x + hs, c.y],[c.x + hs * 0.2, c.y + s * 0.2],[c.x + hs * 0.5, c.y]];
      closed = false;
    }

    // Initial history snapshot
    const initHistory = [pts.map(p => [...p])];
    polys.push({ points: pts, closed, color: col, lw: curLW, _bp: clone(pts), _bc: [c.x, c.y], _bs: s, _history: initHistory });
    drawIdx = polys.length - 1; selPoly = drawIdx; selPt = null;
    updSel(); ac(); toast(`Added ${type} (size ${s})`);
  }

  function ellipsePts(x, y, rx, ry) {
    const n = 28, p = [];
    for (let i = 0; i < n; i++) { const t = Math.PI * 2 * i / n; p.push([x + rx * Math.cos(t), y + ry * Math.sin(t)]); }
    return p;
  }

  // ═══════════════════════════════════════
  //  UNDO / REDO
  // ═══════════════════════════════════════
  function saveU() { undoSt.push(clone(polys)); if (undoSt.length > MAXSTACK) undoSt.shift(); }
  function undo() {
    if (!undoSt.length) { toast("Nothing to undo"); return; }
    redoSt.push(clone(polys)); polys = undoSt.pop();
    if (redoSt.length > MAXSTACK) redoSt.shift();
    selPt = null; selPoly = -1; hideSel(); ac(false); toast("Undo ↩");
  }
  function redo() {
    if (!redoSt.length) { toast("Nothing to redo"); return; }
    undoSt.push(clone(polys)); polys = redoSt.pop();
    if (undoSt.length > MAXSTACK) undoSt.shift();
    selPt = null; selPoly = -1; hideSel(); ac(false); toast("Redo ↪");
  }

  // ═══════════════════════════════════════
  //  PERSIST
  // ═══════════════════════════════════════
  function save(dl, nm) {
    const data = { polys: clone(polys), savedAt: new Date().toISOString(), v: "4" };
    localStorage.setItem(SK, JSON.stringify(data));
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    try { localStorage.setItem(ACCENT_KEY, accent); } catch (_) {}
    if (dl) {
      const b = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(b);
      a.download = (nm || "polyline-data") + ".json"; a.click();
    }
    return data;
  }

  function load() {
    try {
      const r = localStorage.getItem(SK); if (!r) return false;
      const data = JSON.parse(r); if (!data || !Array.isArray(data.polys)) return false;
      polys = data.polys.map(l => ({
        points: (l.points || []).map(p => [+p[0], +p[1]]),
        closed: !!l.closed, color: l.color || "#fff", lw: l.lw || 2,
        _bp: l._bp || null, _bc: l._bc || null, _bs: l._bs || null,
        _history: l._history || null, label: l.label || ""
      })).slice(0, MAX);
      return true;
    } catch (e) { return false; }
  }

  function doRefresh() { const ok = load(); toast(ok ? "Refreshed!" : "No saved data", 2000); selPt = null; selPoly = -1; hideSel(); ac(); }

  // ═══════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════
  function startNew() {
    if (polys.length >= MAX) { toast("Max 100"); return; }
    saveU(); redoSt = [];
    polys.push({ points: [], closed: false, color: curColor, lw: curLW, _history: [] });
    drawIdx = polys.length - 1; selPt = null; render();
  }

  function finalizePoly() {
    if (drawIdx < 0) return;
    const l = polys[drawIdx];
    if (l && l.points.length < 2) polys.splice(drawIdx, 1);
    drawIdx = -1; ac();
  }

  function delPt(pi, ptIdx) {
    const l = polys[pi]; if (!l) return;
    l.points.splice(ptIdx, 1);
    if (!l.points.length) { polys.splice(pi, 1); fixIdx(pi); return; }
    l.closed = l.points.length >= 3; selPt = null;
  }

  function fixIdx(rm) {
    if (drawIdx === rm) drawIdx = -1; else if (drawIdx > rm) drawIdx--;
    if (selPoly === rm) { selPoly = -1; hideSel(); } else if (selPoly > rm) selPoly--;
    if (selPt && selPt.pi === rm) selPt = null; else if (selPt && selPt.pi > rm) selPt.pi--;
  }

  function ac(r = true) { if (autoSave) save(false); if (r) render(); }

  function updUI() {
    const ln = polys[drawIdx];
    if (ln && mode === MODES.ADDING) topSt.textContent = `Drawing Poly ${drawIdx + 1} · ${ln.points.length} pts`;
    document.getElementById("stMode").innerHTML  = `Mode: <span>${mode}</span>`;
    document.getElementById("stShapes").innerHTML= `Shapes: <span>${polys.length}</span>`;
    document.getElementById("stPoints").innerHTML= `Points: <span>${polys.reduce((s, l) => s + l.points.length, 0)}</span>`;
    document.getElementById("stZoom").innerHTML  = `Zoom: <span>${Math.round(zoom * 100)}%</span>`;
    document.getElementById("stCoords").innerHTML= `X: <span>${Math.round(mw.x)}</span> Y: <span>${Math.round(mw.y)}</span>`;
    if (selPoly >= 0) showMeasure();
  }

  function resz() {
    const r = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function toW(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - panX) / zoom, y: (e.clientY - r.top - panY) / zoom }; }
  function d(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
  function fmtDist(dist) { return dist < 10000 ? dist.toFixed(0) + "px" : (dist / 1000).toFixed(2) + "k"; }

  function nearPt(x, y, t) {
    for (let i = polys.length - 1; i >= 0; i--) {
      const p = polys[i].points;
      for (let j = p.length - 1; j >= 0; j--) if (d(x, y, p[j][0], p[j][1]) <= t) return { pi: i, pt: j };
    }
    return null;
  }

  function nearLine(x, y, t) {
    for (let i = polys.length - 1; i >= 0; i--) {
      const p = polys[i].points;
      for (let j = 0; j < p.length - 1; j++) if (segD(x, y, p[j][0], p[j][1], p[j + 1][0], p[j + 1][1]) <= t) return i;
      if (polys[i].closed && p.length > 2) if (segD(x, y, p[0][0], p[0][1], p[p.length - 1][0], p[p.length - 1][1]) <= t) return i;
    }
    return -1;
  }

  function segD(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (!dx && !dy) return d(px, py, x1, y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return d(px, py, x1 + t * dx, y1 + t * dy);
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function zBy(f) { zoom = Math.max(0.1, Math.min(10, zoom * f)); render(); toast(`Zoom ${Math.round(zoom * 100)}%`); }

  // ═══════════════════════════════════════
  //  MENU BAR
  // ═══════════════════════════════════════
  function buildMenu() {
    const defs = [
      { label: "File", items: [
        { label: "New / Clear All", action: () => { saveU(); redoSt = []; polys = []; drawIdx = -1; selPoly = -1; hideSel(); ac(); toast("Canvas cleared"); } },
        { label: "Save JSON", action: () => { save(true); toast("Saved!"); } },
        { label: "Save As", action: () => { const n = prompt("File name", "polyline-data"); if (n !== null) save(true, n); } },
        { label: "Export PNG", action: exportPNG },
        { label: "Copy JSON", action: () => { navigator.clipboard?.writeText(JSON.stringify(save(false), null, 2)).then(() => toast("JSON copied!")); } }
      ] },
      { label: "Edit", items: [
        { label: "Undo", hint: "Ctrl+Z", action: undo },
        { label: "Redo", hint: "Ctrl+Y", action: redo },
        { label: "Cut", hint: "Ctrl+X", action: doCut },
        { label: "Copy", hint: "Ctrl+C", action: doCopy },
        { label: "Paste", hint: "Ctrl+V", action: doPaste },
        { label: "Duplicate", hint: "Ctrl+D", action: doDupe },
        { label: "Delete Selected", hint: "Del", action: delSelPoly }
      ] },
      { label: "View", items: [
        { label: "Zoom In", hint: "+", action: () => zBy(1.2) },
        { label: "Zoom Out", hint: "-", action: () => zBy(0.8) },
        { label: "Reset View", action: () => { zoom = 1; panX = 0; panY = 0; render(); toast("View reset"); } },
        { label: () => `Grid Snap: ${snapGrid ? "ON" : "OFF"}`, hint: "G", action: toggleSnapGrid },
        { label: () => `Point Snap: ${snapPt ? "ON" : "OFF"}`, hint: "S", action: toggleSnapPt },
        { label: () => `Theme: ${theme}`, action: toggleTheme },
        { label: () => `Auto Save: ${autoSave ? "ON" : "OFF"}`, action: () => { autoSave = !autoSave; toast("Auto Save " + (autoSave ? "ON" : "OFF")); rdyn(); } }
      ] },
      { label: "Mode", items: [
        { label: () => isComp ? "Exit Comparison" : "Before/After", action: () => {
          if (isComp) { isComp = false; beforeSnap = null; toast("Normal view"); }
          else { beforeSnap = clone(polys); isComp = true; toast("Comparison ON"); }
          rdyn(); render();
        } }
      ] }
    ];

    const host = document.getElementById("menuButtons");
    host.innerHTML = "";
    const frag = document.createDocumentFragment();
    const all = [];

    defs.forEach(def => {
      const btn = document.createElement("button");
      btn.className = "menu-btn"; btn.type = "button"; btn.textContent = def.label;
      const dd = document.createElement("div"); dd.className = "dropdown";
      def.items.forEach(item => {
        const row = document.createElement("div"); row.className = "dd-item";
        const ls = document.createElement("span");
        ls.textContent = typeof item.label === "function" ? item.label() : item.label;
        row.appendChild(ls);
        if (item.hint) { const h = document.createElement("span"); h.className = "dd-hint"; h.textContent = item.hint; row.appendChild(h); }
        row.addEventListener("click", () => { item.action(); closeM(); rdyn(); });
        dd.appendChild(row);
      });
      btn.addEventListener("click", e => { e.stopPropagation(); const op = dd.classList.contains("open"); closeM(); if (!op) openM(btn, dd); });
      frag.appendChild(btn); document.body.appendChild(dd); all.push({ def, dd });
    });

    host.appendChild(frag); window._M = all;
    document.addEventListener("click", closeM);
    window.addEventListener("resize", () => { closeM(); render(); });

    function rdyn() {
      if (!window._M) return;
      window._M.forEach(({ def, dd }) => {
        const rows = dd.querySelectorAll(".dd-item");
        def.items.forEach((item, i) => {
          const r = rows[i]; if (!r) return;
          const s = r.querySelector("span");
          if (s) s.textContent = typeof item.label === "function" ? item.label() : item.label;
        });
      });
    }
    window._rdyn = rdyn;
  }

  function rdyn() { window._rdyn && window._rdyn(); }

  function openM(btn, dd) {
    dd.classList.add("open");
    const br = btn.getBoundingClientRect();
    dd.style.left = "0"; dd.style.top = "0";
    requestAnimationFrame(() => {
      const dr = dd.getBoundingClientRect();
      let l = br.left + br.width / 2 - dr.width / 2, t = br.bottom + 6;
      if (t + dr.height > window.innerHeight - 8) t = br.top - dr.height - 6;
      l = Math.max(8, Math.min(l, window.innerWidth - dr.width - 8));
      dd.style.left = l + "px"; dd.style.top = t + "px";
    });
    document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }

  function closeM() {
    document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
    document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
  }

  // ═══════════════════════════════════════
  //  SIDEBAR SETUP
  // ═══════════════════════════════════════
  function setupSidebar() {
    // Theme toggle
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

    const accentSelect = document.getElementById("accentSelect");
    if (accentSelect) {
      accentSelect.addEventListener("change", () => {
        accent = accentSelect.value;
        try { localStorage.setItem(ACCENT_KEY, accent); } catch (_) {}
        applyAccent(true);
      });
    }

    // Clear canvas
    const clearBtn = document.getElementById("clearCanvasBtn");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (!polys.length || confirm("Clear all shapes?")) {
        saveU(); redoSt = []; polys = []; drawIdx = -1; selPoly = -1; hideSel(); ac(); toast("Canvas cleared");
      }
    });

    // Export PNG
    const expBtn = document.getElementById("exportPngBtn");
    if (expBtn) expBtn.addEventListener("click", exportPNG);

    // Guide modal
    const guideBtn = document.getElementById("guideBtn");
    const guideModal = document.getElementById("guideModal");
    const guideClose = document.getElementById("guideCloseBtn");
    if (guideBtn && guideModal) {
      guideBtn.addEventListener("click", () => guideModal.classList.add("show"));
      guideClose.addEventListener("click", () => guideModal.classList.remove("show"));
      guideModal.addEventListener("click", e => { if (e.target === guideModal) guideModal.classList.remove("show"); });
    }

    // Snap buttons
    document.getElementById("snapGridBtn").addEventListener("click", toggleSnapGrid);
    document.getElementById("snapPtBtn").addEventListener("click", toggleSnapPt);

    // Mode buttons
    document.querySelectorAll(".mode-key-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode;
        if (m === "IDLE") setMode(MODES.IDLE);
        else if (m === "ADDING") { activeTool = "polyline"; setMode(MODES.ADDING); startNew(); }
        else if (m === "MOVE") setMode(MODES.MOVE);
        else if (m === "DELETE") setMode(MODES.DELETE);
      });
    });

    // Shape buttons (click = add at center)
    document.querySelectorAll(".shape-btn").forEach(btn => {
      btn.addEventListener("click", () => { const c = canCenter(); addShapeAt(btn.dataset.shape, c.x, c.y); });
    });
  }

  // ═══════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════
  window.onload = () => {
    loadTheme();
    loadAccent();
    load();
    drawIcons();
    buildColors();
    setupSliders();
    buildMenu();
    setupSidebar();
    setupDragDrop();
    setupMouse();
    setupKeys();
    // Init snap state
    wrap.classList.toggle("snap-active", snapGrid);
    setMode(MODES.IDLE);
    render();
  };

})();
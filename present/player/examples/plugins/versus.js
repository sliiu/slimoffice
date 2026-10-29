// 放映彩蛋：两人用当前页的文字和够大的图片对打。
//
// 导入：登录后打开 放映 → 插件 → 导入…，选这个文件。调用的是
// definePlaybackPlugin，不会进官方列表。舞台按窗口缩放，所以遮罩用百分比
// 贴在文本框上，画布用幻灯片坐标再拉满舞台。

definePlaybackPlugin({
  id: "deck.versus",
  name: "对打",
  description: "两个人用这一页的文字和图片对打。先在左右文本框里写上名字。",
  version: "1.0.0",
  activate(ctx) {
    const root = ctx.ui.rootElement();
    const stage = ctx.ui.stageElement();
    const doc = root.ownerDocument;
    const view = doc.defaultView || globalThis;
    const zh = String(ctx.locale || "").toLowerCase().startsWith("zh");
    const copy = zh
      ? {
          fight: "开打",
          tip: "从这一页开始对打",
          need: "这一页需要左右各一个文本框",
          left: "左边的名字",
          right: "右边的名字",
        }
      : {
          fight: "Fight",
          tip: "Start the match on this slide",
          need: "This slide needs a text box on the left and one on the right",
          left: "Left name",
          right: "Right name",
        };

    const W = ctx.presentation.size.width;
    const H = ctx.presentation.size.height;
    const areaCut = 0.04 * W * H;
    const GROUND = H * 0.86;
    const REACH = Math.min(W, H) * 0.2;

    let mode = "idle";
    let phase = "idle";
    let layer = null;
    let canvas = null;
    let gfx = null;
    let raf = 0;
    let locked = false;
    let advancing = false;
    let noticeTimer = 0;
    let lastT = 0;
    let hitstop = 0;
    let shake = 0;
    let announceAt = 0;
    let koAt = 0;
    let koSent = false;
    let entrySlideId = "";
    let nameLeft = "";
    let nameRight = "";
    const nameplateIds = new Set();
    const hiddenIds = [];
    const flown = [];
    const held = new Set();
    let leftF = null;
    let rightF = null;
    let drawList = [];
    let superFx = null;

    const button = ctx.ui.addToolbarButton({
      label: copy.fight,
      tooltip: copy.tip,
      onClick: () => {
        if (mode === "idle") openMatch();
        else closeMatch();
      },
    });

    const onSlide = ctx.events.on("slidechange", () => {
      if (!advancing) return;
      advancing = false;
      if (mode === "fight") setupRound();
    });

    const onKey = (e) => {
      if (mode !== "fight" || phase !== "live") return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.type === "keyup") {
        held.delete(key);
        return;
      }
      if (e.repeat) return;
      held.add(key);
      if (key === "f" || key === "g") strike(leftF, rightF, key === "g");
      if (key === "k" || key === "l" || key === "ArrowLeft" || key === "ArrowRight") {
        if (key === "k" || key === "l") strike(rightF, leftF, key === "l");
      }
      if ("adfgkl".includes(key) || key.startsWith("Arrow")) {
        e.preventDefault();
      }
    };
    view.addEventListener("keydown", onKey, true);
    view.addEventListener("keyup", onKey, true);

    function openMatch() {
      const plates = namePlates();
      if (!plates) {
        showNotice(copy.need);
        return;
      }
      if (layer) {
        layer.remove();
        layer = null;
      }
      clearNotice();
      nameLeft = "";
      nameRight = "";
      flown.length = 0;
      entrySlideId = currentSlide()?.id || "";
      nameplateIds.clear();
      nameplateIds.add(plates.left.id);
      nameplateIds.add(plates.right.id);
      lock(true);
      mode = "naming";
      mountLayer();
      const leftInput = nameField(plates.left.bbox, copy.left);
      const rightInput = nameField(plates.right.bbox, copy.right);
      const commit = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeMatch();
          return;
        }
        if (e.key !== "Enter") return;
        e.preventDefault();
        const l = leftInput.value.trim();
        const r = rightInput.value.trim();
        if (e.target === leftInput) {
          if (!l) return;
          rightInput.focus();
          return;
        }
        if (!r) {
          rightInput.focus();
          return;
        }
        nameLeft = l.slice(0, 24);
        nameRight = r.slice(0, 24);
        leftInput.remove();
        rightInput.remove();
        mode = "fight";
        setupRound();
        ensureLoop();
      };
      leftInput.addEventListener("keydown", commit);
      rightInput.addEventListener("keydown", commit);
      leftInput.focus();
    }

    function closeMatch() {
      stopLoop();
      restore();
      lock(false);
      clearNotice();
      layer?.remove();
      layer = null;
      canvas = null;
      gfx = null;
      mode = "idle";
      phase = "idle";
      leftF = null;
      rightF = null;
      drawList = [];
      superFx = null;
      held.clear();
      nameplateIds.clear();
    }

    function setupRound() {
      restore();
      const packs = collectPieces();
      if (packs.left.length === 0 && packs.right.length === 0) {
        if (isLast()) enterEnding();
        else goNext();
        return;
      }
      hidePieces(packs);
      leftF = makeFighter(W * 0.2, 1, "#67e8f9", packs.left);
      rightF = makeFighter(W * 0.8, -1, "#fb7185", packs.right);
      drawList = packs.left.concat(packs.right);
      superFx = null;
      shake = 0;
      hitstop = 0;
      koSent = false;
      if (packs.left.length === 0 || packs.right.length === 0) {
        phase = "ko";
        koAt = now();
        ensureLoop();
        return;
      }
      phase = "announce";
      announceAt = now();
      ensureLoop();
    }

    function enterEnding() {
      restore();
      mode = "ending";
      phase = "ending";
      stopLoop();
      mountLayer();
      paintEnding();
    }

    function goNext() {
      if (isLast()) {
        enterEnding();
        return;
      }
      restore();
      const prev = ctx.player.current();
      advancing = true;
      ctx.player.goto(prev + 1);
      if (!advancing) return;
      advancing = false;
      if (ctx.player.current() === prev) enterEnding();
    }

    function frame(t) {
      const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
      lastT = t;
      if (mode !== "fight" || !gfx || !leftF || !rightF) return;
      if (hitstop > 0) hitstop -= dt;
      else if (phase === "live") stepFighters(dt);
      if (shake > 0) shake = Math.max(0, shake - dt * 40);
      if (phase === "announce" && t - announceAt > 1100) phase = "live";
      if (phase === "ko" && !koSent && t - koAt > 800) {
        koSent = true;
        goNext();
        return;
      }
      if (superFx) {
        superFx.life -= dt;
        if (superFx.life <= 0) superFx = null;
      }
      paint(t);
    }

    function stepFighters(dt) {
      nudge(leftF, (held.has("d") ? 1 : 0) - (held.has("a") ? 1 : 0), dt);
      nudge(rightF, (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0), dt);
      const gap = rightF.x - leftF.x;
      if (Math.abs(gap) < 72) {
        const push = (72 - Math.abs(gap)) / 2;
        const sign = gap >= 0 ? 1 : -1;
        leftF.x -= sign * push;
        rightF.x += sign * push;
      }
      leftF.face = leftF.x <= rightF.x ? 1 : -1;
      rightF.face = -leftF.face;
      for (const f of [leftF, rightF]) {
        if (f.poseT > 0) {
          f.poseT -= dt;
          if (f.poseT <= 0) f.pose = "idle";
        }
      }
      for (const p of drawList) {
        if (!p.flying) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 1400 * dt;
        p.rot += p.vr * dt;
        if (p.y > H + 80) p.gone = true;
      }
    }

    function nudge(f, v, dt) {
      if (!v) {
        if (f.pose === "walk") f.pose = "idle";
        return;
      }
      f.x = Math.max(70, Math.min(W - 70, f.x + v * 520 * dt));
      if (f.pose === "idle") f.pose = "walk";
    }

    function strike(attacker, defender, superMove) {
      if (!attacker || !defender || phase !== "live" || hitstop > 0) return;
      if (attacker.pose === "punch" || attacker.pose === "super") return;
      if (superMove) {
        if (attacker.meter < 3) return;
        const victim = largestText(defender.pieces) || largestArea(defender.pieces);
        if (!victim) return;
        attacker.meter = 0;
        attacker.pose = "super";
        attacker.poseT = 0.45;
        take(defender, victim, 1);
        superFx = { text: labelOf(victim), life: 0.55 };
        hitstop = 0.28;
        shake = 22;
        beep(90, 0.28, "sawtooth");
      } else {
        attacker.pose = "punch";
        attacker.poseT = 0.16;
        if (Math.abs(attacker.x - defender.x) > REACH) {
          beep(180, 0.05, "square");
          return;
        }
        const victim = nearest(defender.pieces, (attacker.x + defender.x) / 2);
        if (!victim) return;
        attacker.meter = Math.min(3, attacker.meter + 1);
        take(defender, victim, 0);
        hitstop = 0.08;
        shake = 10;
        beep(320, 0.06, "square");
      }
      if (defender.pieces.length === 0) {
        phase = "ko";
        koAt = now();
        koSent = false;
      }
    }

    function take(owner, piece, power) {
      const i = owner.pieces.indexOf(piece);
      if (i >= 0) owner.pieces.splice(i, 1);
      const dir = piece.x + piece.w / 2 < W / 2 ? -1 : 1;
      piece.flying = true;
      piece.vx = dir * (720 + power * 500);
      piece.vy = -520 - power * 180;
      piece.vr = dir * 6;
      if (piece.text) flown.push(piece.text.split("\n")[0].slice(0, 32));
    }

    function paint(t) {
      const g = gfx;
      g.clearRect(0, 0, W, H);
      g.save();
      if (shake > 0) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      g.fillStyle = "rgba(2,6,23,0.08)";
      for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
      for (const p of drawList) {
        if (p.gone) continue;
        drawPiece(g, p);
      }
      if (currentSlide()?.id === entrySlideId) drawNamePlates(g);
      drawFighter(g, leftF, t);
      drawFighter(g, rightF, t);
      drawHud(g);
      if (superFx) drawSuper(g, superFx);
      if (phase === "announce") drawCall(g, t - announceAt);
      if (phase === "ko") drawStamp(g, "K.O.");
      g.restore();
    }

    function paintEnding() {
      mountCanvas();
      const g = gfx;
      if (!g) return;
      g.fillStyle = "#020617";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#e2e8f0";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 ${Math.round(H * 0.06)}px Impact, "Arial Black", sans-serif`;
      g.fillText(nameLeft + "  /  " + nameRight, W / 2, H * 0.16);
      const words = flown.length ? flown : [nameLeft, nameRight];
      const size = Math.max(18, Math.min(48, Math.round(H / (words.length + 4))));
      g.font = `700 ${size}px Impact, "Arial Black", sans-serif`;
      words.forEach((word, i) => {
        g.fillStyle = i % 2 ? "#67e8f9" : "#fb7185";
        g.fillText(word, W / 2, H * 0.3 + i * (size + 10));
      });
    }

    function drawPiece(g, p) {
      g.save();
      g.translate(p.x + p.w / 2, p.y + p.h / 2);
      g.rotate(p.rot || 0);
      g.translate(-p.w / 2, -p.h / 2);
      g.fillStyle = p.text ? "rgba(15,23,42,0.92)" : "rgba(30,41,59,0.88)";
      g.strokeStyle = p.text ? "#e2e8f0" : "#38bdf8";
      g.lineWidth = 3;
      g.fillRect(0, 0, p.w, p.h);
      g.strokeRect(0, 0, p.w, p.h);
      g.beginPath();
      g.rect(0, 0, p.w, p.h);
      g.clip();
      g.fillStyle = "#f8fafc";
      g.textAlign = "left";
      g.textBaseline = "top";
      const size = Math.max(12, Math.min(p.h * 0.42, 36));
      g.font = `700 ${size}px "Arial Black", sans-serif`;
      const lines = labelOf(p).split("\n").slice(0, 4);
      lines.forEach((line, i) => g.fillText(line, 8, 6 + i * (size + 2), Math.max(8, p.w - 16)));
      g.restore();
    }

    function drawNamePlates(g) {
      const plates = [...nameplateIds]
        .map((id) => ctx.scene.byId(id))
        .filter(Boolean);
      const names = [nameLeft, nameRight];
      plates.forEach((shape, i) => {
        const b = shape.bbox;
        g.fillStyle = i === 0 ? "#0e7490" : "#be123c";
        g.fillRect(b.x, b.y, b.w, b.h);
        g.fillStyle = "#f8fafc";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `700 ${Math.max(16, Math.min(b.h * 0.45, 42))}px "Arial Black", sans-serif`;
        g.fillText(names[i] || "", b.x + b.w / 2, b.y + b.h / 2, Math.max(8, b.w - 12));
      });
    }

    function drawFighter(g, f, t) {
      if (!f) return;
      const bob = f.pose === "walk" ? Math.sin(t / 80) * 5 : 0;
      const reach = f.pose === "punch" ? 78 : f.pose === "super" ? 110 : 18;
      g.save();
      g.translate(f.x, GROUND + bob);
      g.scale(f.face, 1);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.save();
      g.translate(0, 8);
      g.scale(1, 0.28);
      g.arc(0, 0, 36, 0, Math.PI * 2);
      g.restore();
      g.fill();
      g.fillStyle = f.color;
      g.strokeStyle = "#020617";
      g.lineWidth = 4;
      g.fillRect(-16, -86, 13, 78);
      g.strokeRect(-16, -86, 13, 78);
      g.fillRect(6, -86, 13, 78);
      g.strokeRect(6, -86, 13, 78);
      g.fillRect(-28, -150, 56, 70);
      g.strokeRect(-28, -150, 56, 70);
      g.fillRect(8, -132, reach, 16);
      g.strokeRect(8, -132, reach, 16);
      g.beginPath();
      g.arc(0, -176, 24, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    }

    function drawHud(g) {
      bar(g, leftF, 48, "left");
      bar(g, rightF, W - 48, "right");
      g.fillStyle = "#f8fafc";
      g.textAlign = "center";
      g.textBaseline = "top";
      g.font = `700 ${Math.round(H * 0.035)}px Impact, "Arial Black", sans-serif`;
      g.fillText(isLast() ? "FINAL" : "ROUND " + (ctx.player.current() + 1), W / 2, 18);
    }

    function bar(g, f, x, align) {
      if (!f) return;
      const width = Math.min(280, W * 0.28);
      const left = align === "left" ? x : x - width;
      const ratio = f.stock ? f.pieces.length / f.stock : 0;
      g.fillStyle = "rgba(2,6,23,0.72)";
      g.fillRect(left, 52, width, 18);
      g.fillStyle = f.color;
      const fillW = Math.max(0, width * ratio);
      g.fillRect(align === "left" ? left : left + width - fillW, 52, fillW, 18);
      g.fillStyle = "#f8fafc";
      g.textAlign = align;
      g.textBaseline = "bottom";
      g.font = `700 ${Math.round(H * 0.032)}px "Arial Black", sans-serif`;
      g.fillText(align === "left" ? nameLeft : nameRight, x, 48);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < f.meter ? "#fde68a" : "rgba(253,230,138,0.25)";
        const px = align === "left" ? left + i * 16 : left + width - 12 - i * 16;
        g.fillRect(px, 76, 12, 8);
      }
    }

    function drawSuper(g, fx) {
      g.fillStyle = "rgba(2,6,23,0.45)";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#fef08a";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 ${Math.round(H * 0.14)}px Impact, "Arial Black", sans-serif`;
      g.fillText(fx.text, W / 2, H / 2, W * 0.86);
    }

    function drawCall(g, elapsed) {
      drawStamp(g, elapsed < 700 ? (isLast() ? "FINAL" : "ROUND " + (ctx.player.current() + 1)) : "FIGHT");
    }

    function drawStamp(g, text) {
      g.fillStyle = "#f8fafc";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 ${Math.round(H * 0.12)}px Impact, "Arial Black", sans-serif`;
      g.fillText(text, W / 2, H * 0.42);
    }

    function namePlates() {
      const shapes = livingShapes();
      const left = largestText(shapes.filter((s) => sideOf(s) === "l"));
      const right = largestText(shapes.filter((s) => sideOf(s) === "r"));
      if (!left || !right) return null;
      return { left, right };
    }

    function collectPieces() {
      const onEntry = currentSlide()?.id === entrySlideId;
      const left = [];
      const right = [];
      for (const shape of livingShapes()) {
        if (onEntry && nameplateIds.has(shape.id)) continue;
        if (!isPiece(shape)) continue;
        const piece = {
          id: shape.id,
          text: textOf(shape),
          name: shape.name || "",
          x: shape.bbox.x,
          y: shape.bbox.y,
          w: shape.bbox.w,
          h: shape.bbox.h,
          rot: 0,
          flying: false,
          gone: false,
        };
        (sideOf(shape) === "l" ? left : right).push(piece);
      }
      return { left, right };
    }

    function hidePieces(packs) {
      for (const piece of packs.left.concat(packs.right)) {
        if (ctx.scene.setVisible(piece.id, false)) hiddenIds.push(piece.id);
      }
    }

    function isPiece(shape) {
      if (textOf(shape)) return true;
      if (shape.kind === "image" && shape.bbox.w * shape.bbox.h >= areaCut) return true;
      return false;
    }

    function sideOf(shape) {
      return shape.bbox.x + shape.bbox.w / 2 < W / 2 ? "l" : "r";
    }

    function livingShapes() {
      return ctx.scene.shapes().filter((s) => s.visible !== false && s.bbox);
    }

    function areaOf(item) {
      if (item.bbox) return item.bbox.w * item.bbox.h;
      return item.w * item.h;
    }

    function textOf(shape) {
      return typeof shape.text === "string" && shape.text.trim() ? shape.text.trim() : "";
    }

    function largestText(list) {
      let best = null;
      let area = -1;
      for (const shape of list) {
        if (!textOf(shape)) continue;
        const a = areaOf(shape);
        if (a > area) {
          best = shape;
          area = a;
        }
      }
      return best;
    }

    function largestArea(list) {
      let best = null;
      let area = -1;
      for (const piece of list) {
        const a = piece.w * piece.h;
        if (a > area) {
          best = piece;
          area = a;
        }
      }
      return best;
    }

    function nearest(list, x) {
      let best = null;
      let dist = Infinity;
      for (const piece of list) {
        const d = Math.abs(piece.x + piece.w / 2 - x);
        if (d < dist) {
          best = piece;
          dist = d;
        }
      }
      return best;
    }

    function labelOf(piece) {
      return piece.text || piece.name || (zh ? "图片" : "Image");
    }

    function makeFighter(x, face, color, pieces) {
      return { x, face, color, pieces, stock: pieces.length, meter: 0, pose: "idle", poseT: 0 };
    }

    function currentSlide() {
      const abs = ctx.presentation.visibleOrder[ctx.player.current()];
      return ctx.presentation.slides[abs];
    }

    function isLast() {
      return ctx.player.current() >= ctx.player.total() - 1;
    }

    function nameField(bbox, placeholder) {
      const input = doc.createElement("input");
      input.type = "text";
      input.placeholder = placeholder;
      input.setAttribute("maxlength", "24");
      input.style.position = "absolute";
      input.style.left = (bbox.x / W) * 100 + "%";
      input.style.top = (bbox.y / H) * 100 + "%";
      input.style.width = (bbox.w / W) * 100 + "%";
      input.style.height = (bbox.h / H) * 100 + "%";
      input.style.boxSizing = "border-box";
      input.style.margin = "0";
      input.style.border = "3px solid #f8fafc";
      input.style.background = "#0f172a";
      input.style.color = "#f8fafc";
      input.style.font = "700 28px sans-serif";
      input.style.textAlign = "center";
      input.style.pointerEvents = "auto";
      input.style.zIndex = "2";
      layer.appendChild(input);
      return input;
    }

    function showNotice(text) {
      if (layer) {
        layer.remove();
        layer = null;
      }
      clearNotice();
      mountLayer();
      const note = doc.createElement("div");
      note.textContent = text;
      note.style.position = "absolute";
      note.style.left = "50%";
      note.style.top = "8%";
      note.style.transform = "translateX(-50%)";
      note.style.padding = "12px 18px";
      note.style.background = "#0f172a";
      note.style.color = "#f8fafc";
      note.style.font = "600 20px sans-serif";
      note.style.pointerEvents = "auto";
      layer.appendChild(note);
      noticeTimer = view.setTimeout(() => {
        if (mode === "idle") closeMatch();
      }, 2600);
    }

    function mountLayer() {
      if (layer) return;
      layer = doc.createElement("div");
      layer.setAttribute("data-ppt-overlay", "");
      layer.style.position = "absolute";
      layer.style.left = "0";
      layer.style.top = "0";
      layer.style.width = "100%";
      layer.style.height = "100%";
      layer.style.pointerEvents = "none";
      layer.style.zIndex = "40";
      stage.appendChild(layer);
    }

    function mountCanvas() {
      mountLayer();
      if (canvas) return;
      canvas = doc.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvas.style.position = "absolute";
      canvas.style.left = "0";
      canvas.style.top = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "auto";
      layer.appendChild(canvas);
      gfx = canvas.getContext("2d");
    }

    function ensureLoop() {
      mountCanvas();
      if (raf) return;
      const tick = (t) => {
        raf = view.requestAnimationFrame(tick);
        frame(t);
      };
      raf = view.requestAnimationFrame(tick);
    }

    function stopLoop() {
      if (raf) view.cancelAnimationFrame(raf);
      raf = 0;
      lastT = 0;
    }

    function lock(on) {
      if (locked === on) return;
      ctx.player.setNavigationLocked(on);
      locked = on;
    }

    function restore() {
      for (const id of hiddenIds) ctx.scene.setVisible(id, true);
      hiddenIds.length = 0;
    }

    function clearNotice() {
      if (noticeTimer) view.clearTimeout(noticeTimer);
      noticeTimer = 0;
    }

    function now() {
      return view.performance?.now?.() ?? Date.now();
    }

    function beep(freq, dur, type) {
      try {
        const AC = view.AudioContext || view.webkitAudioContext;
        if (!AC) return;
        if (!beep.ctx) beep.ctx = new AC();
        const o = beep.ctx.createOscillator();
        const gain = beep.ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        gain.gain.value = 0.05;
        o.connect(gain);
        gain.connect(beep.ctx.destination);
        o.start();
        o.stop(beep.ctx.currentTime + dur);
      } catch {
        /* 没有音频设备时仍然能打 */
      }
    }

    return () => {
      closeMatch();
      onSlide();
      button.remove();
      view.removeEventListener("keydown", onKey, true);
      view.removeEventListener("keyup", onKey, true);
      if (beep.ctx) beep.ctx.close?.();
    };
  },
});

"use strict";
// 手机当遥控：讲者那一侧的状态，和一条窄的遥控协议。
//
// 一场演讲里最贵的两次点击是「拿回电脑」和「找不到备注」。演讲者视图把这些搬到了同一台机器上，
// 于是人还是被钉在讲台边。这里把讲者视图拆成可以过线的东西：一个快照（当前页、下一页、备注、
// 计时）和三个命令（上一页 / 下一页 / 跳到某页）。传输不在这里 —— 宿主可能走 WebSocket、WebRTC
// 或同一条链接里的 BroadcastChannel；这一层只保证两端说同一种话，并且开源包不依赖任何私有服务。
Object.defineProperty(exports, "__esModule", { value: true });
exports.notesForSlide = notesForSlide;
exports.createPresenterBridge = createPresenterBridge;
exports.buildPresenterPageHtml = buildPresenterPageHtml;
/** 备注里的纯文本：手机屏幕窄，段落压成空行分隔，超长截断。 */
function notesForSlide(presentation, slideIndex, max = 900) {
    const notes = presentation.slides[slideIndex]?.notes ?? "";
    const text = notes.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
/**
 * 讲者侧状态机。`target` 在播放器挂载后才可用，所以用 getter 而不是构造时捕获。
 * `goto` 接受的是可见序列里的序号 —— 和 `PlayerHandle.goto` 一致，隐藏页不占号。
 */
function createPresenterBridge(target, opts) {
    const now = opts.now ?? (() => Date.now());
    const startedAt = opts.startedAt ?? now();
    const visible = opts.visibleSlides ? [...opts.visibleSlides] : undefined;
    let black = false;
    let paused = false;
    const slideAt = (slot) => visible?.[slot] ?? slot;
    const snapshot = () => {
        const t = target();
        const slot = t ? t.current() : 0;
        const total = t ? t.total() : (visible?.length ?? opts.presentation.slides.length);
        const idx = slideAt(slot);
        return {
            slide: slot,
            total,
            ...(titleOf(opts.presentation, idx) ? { title: titleOf(opts.presentation, idx) } : {}),
            notes: notesForSlide(opts.presentation, idx),
            ...(slot + 1 < total ? { nextNotes: notesForSlide(opts.presentation, slideAt(slot + 1)) } : {}),
            elapsedMs: Math.max(0, now() - startedAt),
            black,
            paused,
        };
    };
    return {
        snapshot,
        apply(cmd) {
            const t = target();
            if (!t)
                return false;
            const total = t.total();
            switch (cmd.type) {
                case "next":
                    // 最后一页不再前进：手机上误触一下不该把稿子翻出界。
                    if (t.current() >= total - 1)
                        return false;
                    t.next();
                    return true;
                case "prev":
                    if (t.current() <= 0)
                        return false;
                    t.prev();
                    return true;
                case "goto": {
                    if (!Number.isInteger(cmd.slide) || cmd.slide < 0 || cmd.slide >= total)
                        return false;
                    t.goto(cmd.slide);
                    return true;
                }
                case "black":
                    black = cmd.on;
                    return true;
                case "pause":
                    paused = !paused;
                    return true;
            }
        },
        setBlack(on) {
            black = on;
        },
        setPaused(on) {
            paused = on;
        },
        resync: snapshot,
    };
}
function titleOf(presentation, index) {
    const slide = presentation.slides[index];
    if (!slide)
        return undefined;
    for (const layer of slide.layers) {
        for (const shape of layer.shapes) {
            if (shape.kind !== "text")
                continue;
            const first = shape.paragraphs[0]?.runs.map((r) => r.text ?? "").join("").trim();
            if (first)
                return first;
        }
    }
    return undefined;
}
/**
 * 手机页。单文件、无依赖、不加载字体包；断线时按钮变灰并显示状态，避免"按了没反应"。
 * 传输由宿主注入：设置 `window.PPTRemote = { send, on }`，页面启动时会调用 `send({type:"hello"})`。
 */
function buildPresenterPageHtml(opts) {
    const zh = (opts.lang ?? "zh").startsWith("zh");
    const L = zh
        ? { prev: "上一页", next: "下一页", black: "黑屏", pause: "暂停计时", notes: "备注", next_notes: "下一页备注", waiting: "等待讲者连接…", connected: "已连接", offline: "连接断开", noNotes: "（本页没有备注）" }
        : { prev: "Prev", next: "Next", black: "Black", pause: "Pause", notes: "Notes", next_notes: "Next slide notes", waiting: "Waiting for the presenter…", connected: "Connected", offline: "Disconnected", noNotes: "(No speaker notes)" };
    return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#111">
<title>${escapeHtml(opts.title)}</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;font:16px/1.5 system-ui,-apple-system,"Noto Sans SC",sans-serif;background:#101012;color:#eee;
       display:grid;grid-template-rows:auto 1fr auto;height:100dvh;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
  header{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #26262a}
  #dot{width:8px;height:8px;border-radius:50%;background:#666;flex:none}
  #dot.on{background:#4ade80}
  #title{font-size:14px;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #clock{margin-left:auto;font-variant-numeric:tabular-nums;color:#9a9aa2;font-size:14px}
  main{overflow-y:auto;padding:14px 16px 20px}
  h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7c7c86;margin:18px 0 6px}
  #notes{white-space:pre-wrap;font-size:18px;line-height:1.55}
  #next-notes{white-space:pre-wrap;font-size:14px;color:#9a9aa2}
  footer{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom))}
  button{appearance:none;border:1px solid #2e2e34;background:#1b1b20;color:#eee;border-radius:14px;
         font:600 16px/1 inherit;padding:0;height:64px;touch-action:manipulation}
  button:active{background:#2a2a32}
  button:disabled{opacity:.38}
  footer .wide{grid-column:1/-1;height:44px;font-size:14px}
  #offline{display:none;padding:8px 16px;background:#3a1d1d;color:#f8b4b4;font-size:13px}
</style>
<div id="offline">${L.offline}</div>
<header><span id="dot"></span><span id="title">${L.waiting}</span><span id="clock">00:00</span></header>
<main><h2>${L.notes}</h2><div id="notes">${L.noNotes}</div>
<h2>${L.next_notes}</h2><div id="next-notes"></div></main>
<footer>
  <button id="prev">${L.prev}</button>
  <button id="next">${L.next}</button>
  <button class="wide" id="black">${L.black}</button>
</footer>
<script>
(function(){
  var link = window.PPTRemote;
  var dot = document.getElementById('dot'), title = document.getElementById('title');
  var notes = document.getElementById('notes'), nextNotes = document.getElementById('next-notes');
  var clock = document.getElementById('clock'), offline = document.getElementById('offline');
  var prev = document.getElementById('prev'), next = document.getElementById('next'), black = document.getElementById('black');
  var base = null, baseAt = 0, blackOn = false, total = 0, slide = 0;
  function pad(n){return (n<10?'0':'')+n}
  function paintClock(){
    if (base == null) return;
    var s = Math.floor((base + (Date.now() - baseAt))/1000);
    clock.textContent = pad(Math.floor(s/60)) + ':' + pad(s%60);
  }
  function setConnected(on){
    dot.className = on ? 'on' : '';
    offline.style.display = on ? 'none' : 'block';
    if (!on) title.textContent = ${JSON.stringify(L.waiting)};
    [prev,next,black].forEach(function(b){ b.disabled = !on; });
  }
  function paint(snap){
    if (!snap) return;
    slide = snap.slide; total = snap.total;
    title.textContent = (snap.title || '') + '  ' + (snap.slide+1) + '/' + snap.total;
    notes.textContent = snap.notes || ${JSON.stringify(L.noNotes)};
    nextNotes.textContent = snap.nextNotes || '';
    base = snap.elapsedMs; baseAt = Date.now(); paintClock();
    blackOn = !!snap.black;
    black.style.background = blackOn ? '#eee' : '';
    black.style.color = blackOn ? '#111' : '';
    prev.disabled = snap.slide <= 0;
    next.disabled = snap.slide >= snap.total - 1;
  }
  function send(msg){ if (link && link.send) link.send(msg); }
  prev.onclick = function(){ send({type:'prev'}); };
  next.onclick = function(){ send({type:'next'}); };
  black.onclick = function(){ blackOn = !blackOn; send({type:'black', on: blackOn}); };
  setInterval(paintClock, 1000);
  if (link && link.on) link.on(function(msg){
    if (!msg) return;
    if (msg.type === 'state') { setConnected(true); paint(msg.snapshot); }
    else if (msg.type === 'disconnected') setConnected(false);
  });
  setConnected(Boolean(link && link.connected));
  send({type:'hello'});
})();
</script></html>`;
}
function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

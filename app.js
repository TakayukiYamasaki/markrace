(() => {
'use strict';

const SAMPLE = `# MarkRace へようこそ

Markdownでスライドを作る
松江太郎

# 使い方

- 左側にMarkdownを書く
- \`# 見出し\` か \`---\` で次のスライド
- **F5** または「発表開始」で全画面表示
- ← → / Space でページ送り、Esc で終了
- \`Note:\` で始まる行は発表者ノート（スライドには出ない）

Note: 最初にアプリの全体像を30秒で説明する
Note: 発表者モードでは、このメモが発表者ビューに表示される

# コードも書ける

\`\`\`ruby
class Greeter
  def initialize(name)
    @name = name
  end

  # あいさつ
  def hello
    puts "Hello, #{@name}!"
  end
end

Greeter.new("Ruby").hello
\`\`\`

# 箇条書きと入れ子

1. 準備
   - Markdownを書く
   - 画像を置く
2. 発表
   - 全画面にする
3. 保存
   - .md ファイルに保存

# 表と引用

| 言語 | 作者 |
|------|------|
| Ruby | まつもとゆきひろ |
| Python | Guido van Rossum |

> 人間のためのプログラミング言語

---

## 画像・リンク

![サンプル画像](images/sample.svg)

[Ruby公式](https://www.ruby-lang.org/ja/)

# 動画も入れられる

![サンプル動画](videos/sample.mp4)

# ご清聴ありがとうございました
`;

const $ = (s) => document.querySelector(s);
const editor = $('#editor');
const KEY = 'mdslide:text', THEME_KEY = 'mdslide:theme';

/* ---------- Markdown parser ---------- */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ![alt](url): 動画ファイル・YouTube は埋め込み、それ以外は画像
function media(alt, url) {
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(url)) {
    return `<video src="${url}" controls preload="metadata" playsinline>${alt}</video>`;
  }
  const yt = url.match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return `<iframe src="https://www.youtube.com/embed/${yt[1]}" title="${alt}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
  }
  return `<img alt="${alt}" src="${url}">`;
}

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_, alt, url) => media(alt, url));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

const KEYWORDS = new Set(('def end class module if elsif else unless while until for in do return yield begin rescue ensure ' +
  'case when then self nil true false and or not require include attr_accessor attr_reader attr_writer ' +
  'function const let var new import from export async await switch break continue try catch finally ' +
  'public private static void int string bool').split(' '));

function highlight(code) {
  const re = /(#[^\n]*|\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*[?!]?)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const [t, com, str, num, word] = m;
    if (com) out += `<span class="tok-com">${esc(t)}</span>`;
    else if (str) out += `<span class="tok-str">${esc(t)}</span>`;
    else if (num) out += `<span class="tok-num">${t}</span>`;
    else out += KEYWORDS.has(word) ? `<span class="tok-kw">${t}</span>` : esc(t);
    last = m.index + t.length;
  }
  return out + esc(code.slice(last));
}

function renderList(items) {
  // items: [{indent, ordered, text}] -> nested html
  let i = 0;
  const build = (baseIndent) => {
    const ordered = items[i].ordered;
    let html = `<${ordered ? 'ol' : 'ul'}>`;
    while (i < items.length && items[i].indent >= baseIndent) {
      if (items[i].indent > baseIndent) { html = html.replace(/<\/li>$/, '') + build(items[i].indent) + '</li>'; continue; }
      html += `<li>${inline(items[i].text)}</li>`;
      i++;
    }
    return html + `</${ordered ? 'ol' : 'ul'}>`;
  };
  return build(items[0].indent);
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^##\s+note\s*$/i.test(line)) {
      // Rabbit: "## note" is a speaker note -> not shown on the slide
      i++;
      let fence = false;
      while (i < lines.length && (fence || !/^#{1,6}\s/.test(lines[i]))) { if (/^```/.test(lines[i])) fence = !fence; i++; }
    } else if (line.trim() && /^:\s+/.test(lines[i + 1] || '') && !/^(```|#|>|\||\s*(?:[-*+]|\d+\.)\s)/.test(line)) {
      // Rabbit title slide: "author\n:   name" -> show the value only
      const key = line.trim().toLowerCase(), value = lines[i + 1].replace(/^:\s+/, '');
      if (!/^(allotted_time|start_time|end_time|theme)$/.test(key)) out.push(`<p class="meta meta-${esc(key)}">${inline(value)}</p>`);
      i += 2;
    } else if ((m = line.match(/^```(\w*)/))) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${highlight(buf.join('\n'))}</code></pre>`);
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>'); i++;
    } else if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/))) {
        items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] }); i++;
      }
      out.push(renderList(items));
    } else if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderBlocks(buf)}</blockquote>`);
    } else if (/^\|.*\|\s*$/.test(line) && /^\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(lines[i + 1] || '')) {
      const cells = (l) => l.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
      const head = cells(line); i += 2;
      let html = '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        html += '<tr>' + cells(lines[i++]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
      }
      out.push(html + '</tbody></table>');
    } else if (!line.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|>|\s*(?:[-*+]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) { buf.push(lines[i++]); }
      out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/* ---------- Slide splitting ---------- */
// A slide starts at "# " (h1) or "---" outside code fences.
function splitSlides(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const slides = [];
  let cur = null, fence = false;
  const start = (n, body) => { cur = { startLine: n, lines: body ? [body] : [], notes: [] }; slides.push(cur); };
  lines.forEach((line, n) => {
    if (/^```/.test(line)) fence = !fence;
    let nm;
    if (!fence && (nm = line.match(/^(?:Note|ノート)[:：]\s?(.*)$/))) { if (!cur) start(n, null); cur.notes.push(nm[1]); }
    else if (!fence && /^#\s+/.test(line)) start(n, line);
    else if (!fence && /^---+\s*$/.test(line)) start(n, null);
    else { if (!cur) start(n, null); cur.lines.push(line); }
  });
  return slides.filter((s) => s.lines.some((l) => l.trim()));
}

/* ---------- State & rendering ---------- */
let slides = [];
let index = 0;
let theme = localStorage.getItem(THEME_KEY) || 'light';

function slideEl(slide, i) {
  const el = document.createElement('div');
  el.className = 'slide' + (i === 0 && /^#\s/.test(slide.lines[0]) ? ' title' : '');
  el.innerHTML = renderBlocks(slide.lines);
  return el;
}

function fit(stage) {
  const wrap = stage.firstElementChild;
  if (!wrap) return;
  const k = Math.min(stage.clientWidth / 1280, stage.clientHeight / 720);
  wrap.style.width = 1280 * k + 'px';
  wrap.style.height = 720 * k + 'px';
  wrap.firstElementChild.style.transform = `scale(${k})`;
}

function mount(stage, i) {
  stage.className = 'stage theme-' + theme;
  stage.innerHTML = '';
  if (!slides[i]) return;
  const wrap = document.createElement('div');
  wrap.className = 'slide-wrap';
  wrap.appendChild(slideEl(slides[i], i));
  stage.appendChild(wrap);
  fit(stage);
  // CSS の読み込み待ちや窓のサイズ変更で表示枠の大きさが変わったら合わせ直す
  // （別窓の要素は、その窓の ResizeObserver で監視する）
  if (!stage._ro) {
    stage._ro = new stage.ownerDocument.defaultView.ResizeObserver(() => fit(stage));
    stage._ro.observe(stage);
  }
}

function renderThumbs() {
  const box = $('#thumbs');
  box.innerHTML = '';
  slides.forEach((s, i) => {
    const t = document.createElement('div');
    t.className = 'thumb theme-' + theme + (i === index ? ' active' : '');
    const el = slideEl(s, i);
    // サムネイルでは動画を読み込まず、印だけ表示する
    el.querySelectorAll('video, iframe').forEach((m) => {
      const ph = document.createElement('div');
      ph.className = 'media-ph';
      ph.textContent = '🎬';
      m.replaceWith(ph);
    });
    t.appendChild(el);
    t.onclick = () => { go(i); const l = slides[i].startLine; jumpEditor(l); };
    box.appendChild(t);
  });
}

function refresh() {
  slides = splitSlides(editor.value);
  if (index >= slides.length) index = Math.max(0, slides.length - 1);
  renderThumbs();
  show();
}

function show() {
  mount($('#preview'), index);
  $('#counter').textContent = slides.length ? `${index + 1} / ${slides.length}` : '0 / 0';
  document.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('active', i === index));
  if (!$('#presenter').hidden) {
    mount($('#present-stage'), index);
    $('#progress').style.width = ((index + 1) / slides.length * 100) + '%';
    $('#page').textContent = `${index + 1} / ${slides.length}`;
    history.replaceState(null, '', '#' + (index + 1));
    updateRace();
    updatePvSlides();
  }
  const notes = slides[index] && slides[index].notes.join('\n');
  $('#notes').textContent = notes || 'ノートなし（「Note: メモ」と書くと、この欄に表示されます）';
  $('#notes').classList.toggle('empty', !notes);
}

/* ---------- 発表者ビュー（別ウィンドウ） ---------- */
let pv = null;
const pvOpen = () => pv && !pv.closed;

const PV_BODY = `<div class="pv-top"><button id="pv-prev">◀</button><button id="pv-next-btn">▶</button><span id="pv-page"></span><span class="spacer"></span><span id="pv-time"></span><button id="pv-pop" title="別ウィンドウ（常に最前面）で開く">⧉</button></div>
<div class="pv-slides"><div class="pv-col"><div class="pv-label">現在のスライド</div><div id="pv-cur" class="stage"></div></div>
<div class="pv-col"><div class="pv-label">次のスライド</div><div id="pv-next" class="stage"></div></div></div>
<div id="pv-notes"></div>`;

function wirePresenterView(win) {
  pv = win;
  const d = win.document;
  d.getElementById('pv-prev').onclick = () => go(index - 1);
  d.getElementById('pv-next-btn').onclick = () => go(index + 1);
  const pop = d.getElementById('pv-pop');
  if (d === document && 'documentPictureInPicture' in window) pop.onclick = popOutPresenterView;
  else pop.remove();
  if (d !== document) d.addEventListener('keydown', onKey); // 本体側は登録済み
  win.onresize = updatePvSlides;
  const link = d.querySelector('link');
  if (link) link.onload = updatePvSlides;
  updatePvSlides();
}

// 発表者ビューは、まず全画面スライドの上に重ねるパネルで開く（v キーで表示/非表示）。
// Chrome/Edge ではパネルの ⧉ で Document Picture-in-Picture（常に最前面の別窓）に切り替えられる。
// ※全画面化と別窓はどちらもクリック1回分の許可が必要なため、発表開始の1クリックでは両方を開けない
function openPresenterView() {
  openPresenterPanel();
}

// Chrome では別窓を開くと全画面が解除される。発表は続け、次のクリックで全画面に戻す
let poppingOut = false;
function popOutPresenterView() {
  poppingOut = !!document.fullscreenElement;
  documentPictureInPicture.requestWindow({ width: 720, height: 540 }).then((win) => {
    if (pvOpen()) pv.close();
    const d = win.document;
    d.body.className = 'pv';
    d.body.innerHTML = PV_BODY;
    const link = d.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('style.css', location.href).href;
    d.head.appendChild(link);
    copyThemeStyles(d);
    // 別窓を閉じたら、発表中ならパネルに戻す
    win.addEventListener('pagehide', () => {
      if (pv === win && !$('#presenter').hidden) { pv = null; openPresenterPanel(); }
    });
    wirePresenterView(win);
  }).catch(() => {
    poppingOut = false;
    if (!pvOpen()) openPresenterPanel();
  });
}

// パネルのタイトルバー（.pv-top）をドラッグして移動する。大きさは CSS の resize で変更
function makeDraggable(panel) {
  const bar = panel.querySelector('.pv-top');
  bar.onpointerdown = (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
    panel.style.right = panel.style.bottom = 'auto';
    bar.setPointerCapture(e.pointerId);
    bar.onpointermove = (m) => {
      panel.style.left = Math.max(0, Math.min(innerWidth - 80, m.clientX - dx)) + 'px';
      panel.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - dy)) + 'px';
    };
    bar.onpointerup = () => { bar.onpointermove = bar.onpointerup = null; };
  };
}

function openPresenterPanel() {
  const panel = document.createElement('div');
  panel.id = 'pv-panel';
  panel.className = 'pv';
  panel.innerHTML = PV_BODY;
  $('#presenter').appendChild(panel);
  makeDraggable(panel);
  new ResizeObserver(() => updatePvSlides()).observe(panel);
  wirePresenterView({
    document, panel, closed: false,
    close() { this.closed = true; panel.remove(); },
    set onresize(f) { window.addEventListener('resize', f); },
  });
}

function updatePvSlides() {
  if (!pvOpen()) return;
  const d = pv.document;
  mount(d.getElementById('pv-cur'), index);
  mount(d.getElementById('pv-next'), index + 1);
  if (!slides[index + 1]) d.getElementById('pv-next').textContent = '（最後のスライドです）';
  d.getElementById('pv-page').textContent = `${index + 1} / ${slides.length}`;
  const notes = slides[index] && slides[index].notes.join('\n');
  const box = d.getElementById('pv-notes');
  box.textContent = notes || 'ノートなし';
  box.classList.toggle('empty', !notes);
  updatePvTime();
}

function updatePvTime() {
  if (!pvOpen()) return;
  const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const total = Math.max(1, parseFloat($('#race-min').value) || 5) * 60;
  const el = (Date.now() - raceStart) / 1000;
  pv.document.getElementById('pv-time').textContent = `経過 ${fmt(el)} / 発表時間 ${fmt(total)}`;
  pv.document.getElementById('pv-time').classList.toggle('over', el > total);
}

/* ---------- うさぎとかめ ---------- */
// うさぎ = スライドの進行、かめ = 経過時間 / 発表時間
const raceOn = $('#race-on'), raceMin = $('#race-min');
let raceStart = 0, raceTimer = null;
try {
  raceOn.checked = localStorage.getItem('mdslide:race') !== '0';
  raceMin.value = localStorage.getItem('mdslide:minutes') || raceMin.value;
} catch (e) {}

// かめは毎フレーム動かして、なめらかに進める（CSS の transition は使わない）
function moveTortoise() {
  const total = Math.max(1, parseFloat(raceMin.value) || 5) * 60;
  const t = Math.min(1, (Date.now() - raceStart) / 1000 / total);
  $('#tortoise').style.setProperty('--p', t);
}
let raceFrame = 0;
function raceLoop() { moveTortoise(); raceFrame = requestAnimationFrame(raceLoop); }

function updateRace() {
  const presenter = $('#presenter');
  const on = raceOn.checked;
  presenter.classList.toggle('racing', on);
  $('#race').hidden = !on;
  if (!on) return;
  moveTortoise();
  const r = slides.length > 1 ? index / (slides.length - 1) : 0;
  $('#rabbit').style.setProperty('--p', r);
  fit($('#present-stage'));
}
function startRace() {
  raceStart = Date.now();
  clearInterval(raceTimer);
  raceTimer = setInterval(() => { updateRace(); updatePvTime(); }, 1000);
  cancelAnimationFrame(raceFrame);
  raceLoop();
}
function stopRace() { clearInterval(raceTimer); cancelAnimationFrame(raceFrame); }
raceOn.onchange = raceMin.onchange = () => {
  try { localStorage.setItem('mdslide:race', raceOn.checked ? '1' : '0'); localStorage.setItem('mdslide:minutes', raceMin.value); } catch (e) {}
};

function go(i) {
  if (!slides.length) return;
  index = Math.max(0, Math.min(slides.length - 1, i));
  show();
}

function jumpEditor(line) {
  const lines = editor.value.split('\n');
  let pos = 0;
  for (let n = 0; n < line; n++) pos += lines[n].length + 1;
  editor.focus();
  editor.setSelectionRange(pos, pos);
  editor.scrollTop = Math.max(0, line * 22 - 40);
}

function slideAtCursor() {
  const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
  let found = 0;
  slides.forEach((s, i) => { if (s.startLine <= line) found = i; });
  return found;
}

/* ---------- Events ---------- */
let saveTimer;
editor.addEventListener('input', () => {
  refresh();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, editor.value); $('#status').textContent = '自動保存しました'; } catch (e) {}
  }, 400);
});
['keyup', 'click'].forEach((ev) => editor.addEventListener(ev, () => {
  const i = slideAtCursor();
  if (i !== index) go(i);
}));
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart;
    editor.setRangeText('  ', s, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  }
});

$('#prev').onclick = () => go(index - 1);
$('#next').onclick = () => go(index + 1);

// 全画面化と別窓は、どちらもクリック1回分の許可を使う。さらに Chrome では別窓を開くと全画面が解除される。
// そのため Chrome/Edge の発表者モードは「別窓を開く → 次のクリック（キー）で全画面」の2段階にする
let needFs = false;
function requestFs() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}
function waitFullscreen(on) {
  needFs = on;
  $('#fs-hint').hidden = !on;
}
function present() {
  $('#presenter').hidden = false;
  startRace();
  const notes = $('#present-mode').value === 'notes';
  if (notes && 'documentPictureInPicture' in window) {
    popOutPresenterView();
    waitFullscreen(true);
  } else {
    requestFs();
    if (notes) openPresenterView();
  }
  show();
}
function endPresent() {
  $('#presenter').hidden = true;
  stopRace();
  waitFullscreen(false);
  poppingOut = false;
  if (pvOpen()) pv.close();
  pv = null;
  if (document.fullscreenElement) document.exitFullscreen();
  history.replaceState(null, '', location.pathname);
  show();
}
try { $('#present-mode').value = localStorage.getItem('mdslide:mode') || 'full'; } catch (e) {}
$('#present-mode').onchange = (e) => { try { localStorage.setItem('mdslide:mode', e.target.value); } catch (err) {} };
// 開始ページは、いま表示中のスライド（index）。初期状態は1枚目
$('#btn-present').onclick = () => { if (editor.value.trim()) present(); };

function onKey(e) {
  const presenting = !$('#presenter').hidden;
  if (e.key === 'F5') { e.preventDefault(); presenting ? endPresent() : $('#btn-present').click(); return; }
  if (!presenting) return;
  // 全画面待ちのとき、本体画面でのキー操作で全画面にする（別窓でのキーでは全画面にできない）
  if (needFs && e.key !== 'Escape' && (e.target.ownerDocument || e.target) === document) {
    requestFs(); waitFullscreen(false); e.preventDefault(); return;
  }
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': case 'n': go(index + 1); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p': go(index - 1); break;
    case 'v': if (pv && pv.panel) pv.panel.hidden = !pv.panel.hidden; break;
    case 'Home': go(0); break;
    case 'End': go(slides.length - 1); break;
    case 'Escape': endPresent(); return;
    case 'f': document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); break;
    default: return;
  }
  e.preventDefault();
}
document.addEventListener('keydown', onKey);
$('#presenter').addEventListener('click', (e) => {
  if (e.target.closest('video, iframe, #pv-panel')) return;
  if (needFs) { requestFs(); waitFullscreen(false); return; }
  go(e.clientX < innerWidth / 3 ? index - 1 : index + 1);
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement || $('#presenter').hidden) return;
  if (poppingOut) { poppingOut = false; waitFullscreen(true); return; }
  endPresent();
});
window.addEventListener('resize', () => { fit($('#preview')); fit($('#present-stage')); });

// toolbar
$('#btn-open').onclick = () => $('#file').click();
$('#file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  editor.value = await f.text();
  index = 0;
  editor.dispatchEvent(new Event('input'));
  e.target.value = '';
};
$('#btn-save').onclick = () => {
  const a = document.createElement('a');
  const first = (editor.value.match(/^#\s+(.+)$/m) || [, 'slides'])[1].trim();
  a.href = URL.createObjectURL(new Blob([editor.value], { type: 'text/markdown' }));
  a.download = first.replace(/[\\/:*?"<>|]/g, '_') + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#btn-sample').onclick = () => {
  if (!editor.value.trim() || confirm('現在の内容をサンプルで置き換えますか？')) {
    editor.value = SAMPLE; index = 0; editor.dispatchEvent(new Event('input'));
  }
};
/* ---------- テーマ ---------- */
// 標準テーマは themes/*.css（一覧は themes/themes.js）。読み込んだ .css はブラウザ(localStorage)に保存する
const BUILTIN_THEMES = window.MDSLIDE_THEMES || [
  { id: 'light', name: 'Light', css: 'themes/light.css' },
  { id: 'dark', name: 'Dark', css: 'themes/dark.css' },
  { id: 'rabbit', name: 'Rabbit風', css: 'themes/rabbit.css' },
];
const CUSTOM_KEY = 'mdslide:customThemes';
const themeSel = $('#theme');

function loadCustomThemes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; } catch (e) { return []; }
}
function saveCustomThemes(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) { alert('テーマを保存できませんでした（ブラウザの保存領域が使えません）。'); }
}
const isCustom = (id) => loadCustomThemes().some((t) => t.id === id);

// テーマの CSS を <head> に入れる。別窓(PiP)にも同じものを写すため、data-theme-css を付けておく
function applyThemeStyles() {
  document.querySelectorAll('[data-theme-css]').forEach((n) => n.remove());
  BUILTIN_THEMES.forEach((t) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = t.css;
    l.dataset.themeCss = t.id;
    l.onload = () => { fit($('#preview')); fit($('#present-stage')); };
    document.head.appendChild(l);
  });
  loadCustomThemes().forEach((t) => {
    const s = document.createElement('style');
    s.textContent = t.css;
    s.dataset.themeCss = t.id;
    document.head.appendChild(s);
  });
}
function copyThemeStyles(doc) {
  document.querySelectorAll('[data-theme-css]').forEach((n) => {
    const c = n.cloneNode(true);
    if (c.tagName === 'LINK') c.href = new URL(n.getAttribute('href'), location.href).href;
    doc.head.appendChild(c);
  });
}

function fillThemeSelect() {
  const custom = loadCustomThemes();
  themeSel.innerHTML = '';
  [...BUILTIN_THEMES, ...custom.map((t) => ({ ...t, name: t.name + '（読込）' }))].forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    themeSel.appendChild(o);
  });
  if (![...themeSel.options].some((o) => o.value === theme)) theme = 'light';
  themeSel.value = theme;
  $('#theme-del').hidden = !isCustom(theme);
}

themeSel.onchange = (e) => {
  theme = e.target.value;
  try { localStorage.setItem(THEME_KEY, theme); } catch (err) {}
  $('#theme-del').hidden = !isCustom(theme);
  refresh();
};
$('#theme-add').onclick = () => $('#theme-file').click();
$('#theme-file').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const css = await f.text();
  const m = css.match(/\.theme-([A-Za-z0-9_-]+)/);
  if (!m) { alert('テーマの CSS に「.theme-名前 { --bg: ...; }」の形のルールが見つかりません。\nthemes/light.css を参考にしてください。'); return; }
  const id = m[1];
  if (BUILTIN_THEMES.some((t) => t.id === id)) { alert(`テーマ ID「${id}」は標準テーマで使われています。CSS の .theme-${id} を別の名前に変えてください。`); return; }
  const list = loadCustomThemes().filter((t) => t.id !== id);
  list.push({ id, name: f.name.replace(/\.css$/i, ''), css });
  saveCustomThemes(list);
  theme = id;
  try { localStorage.setItem(THEME_KEY, theme); } catch (err) {}
  applyThemeStyles();
  fillThemeSelect();
  refresh();
};
$('#theme-del').onclick = () => {
  if (!isCustom(theme) || !confirm('このテーマをブラウザから削除しますか？（元の .css ファイルは消えません）')) return;
  saveCustomThemes(loadCustomThemes().filter((t) => t.id !== theme));
  theme = 'light';
  try { localStorage.setItem(THEME_KEY, theme); } catch (err) {}
  applyThemeStyles();
  fillThemeSelect();
  refresh();
};
applyThemeStyles();
fillThemeSelect();

// drag & drop a .md file
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && /\.(md|markdown|txt)$/i.test(f.name)) { editor.value = await f.text(); index = 0; editor.dispatchEvent(new Event('input')); }
});

/* ---------- Init ---------- */
let saved = null;
try { saved = localStorage.getItem(KEY); } catch (e) {}
editor.value = saved || SAMPLE;
refresh();
})();

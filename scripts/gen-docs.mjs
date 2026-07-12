#!/usr/bin/env node
// gen-docs.mjs — stdlib-only static-site generator.
// Reads .github/workflows/ci-*.yml headers + README repo-class table,
// emits site/index.html: a blueprint-schematic catalog of reusable
// workflow adapters with copy-paste pin snippets.
//
// No dependencies. Run: node scripts/gen-docs.mjs
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");
const OUT_DIR = join(ROOT, "site");
const PIN_TAG = "v1"; // downstream pins @v1 (see README § Version pinning)

// ---- parse ci-*.yml adapters -------------------------------------------
const files = readdirSync(WF_DIR)
	.filter((f) => f.startsWith("ci-") && f.endsWith(".yml"))
	.sort();

function parseAdapter(file) {
	const raw = readFileSync(join(WF_DIR, file), "utf8");
	const lines = raw.split(/\r?\n/);

	// leading `#` comment block = human description
	const comments = [];
	for (const l of lines) {
		if (l.startsWith("#")) comments.push(l.replace(/^#\s?/, "").trim());
		else if (l.trim() === "") continue;
		else break;
	}

	const name = (raw.match(/^name:\s*(.+)$/m) || [])[1]?.trim() || file;
	const moduleRef = (raw.match(/module:\s*(\S+)/) || [])[1] || null;
	const call = (raw.match(/call:\s*(.+)$/m) || [])[1]?.trim() || null;
	const engine = moduleRef ? "dagger" : "pnpm";

	// secrets under workflow_call.secrets
	const secrets = [];
	const secMatch = raw.match(/secrets:\s*\n([\s\S]*?)(?:\njobs:|\n\S)/);
	if (secMatch) {
		for (const m of secMatch[1].matchAll(/^\s{4,6}([A-Z0-9_]+):/gm))
			secrets.push(m[1]);
	}

	// description = first comment line that is not a "Downstream:"/"Cache:" note
	const desc =
		comments.find(
			(c) => !/^Downstream:|^Cache:|^Direct pnpm/i.test(c) && c.length > 4,
		) ||
		comments[0] ||
		"";

	return { file, name, desc, moduleRef, call, engine, secrets, comments };
}

const adapters = files.map(parseAdapter);

// ---- parse README repo-class table -------------------------------------
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const repoClass = {}; // filename -> "for repo class" text
for (const m of readme.matchAll(
	/\|\s*`\.github\/workflows\/(ci-[\w-]+\.yml)`\s*\|\s*([^|]+?)\s*\|/g,
)) {
	repoClass[m[1]] = m[2].trim();
}
for (const a of adapters) a.repoClass = repoClass[a.file] || "";

// ---- html helpers -------------------------------------------------------
const esc = (s) =>
	String(s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	);

const pinSnippet = (a) =>
	`name: ci\non: [push, pull_request]\njobs:\n  ci:\n    uses: chirag127/workflows/.github/workflows/${a.file}@${PIN_TAG}\n    secrets: inherit`;

// registration-tick corner marks (drafting signature) reused per card
const TICKS = ["tl", "tr", "bl", "br"]
	.map((p) => `<span class="tick tick-${p}" aria-hidden="true"></span>`)
	.join("");

const daggerCount = new Set(
	adapters.filter((a) => a.engine === "dagger").map((a) => a.moduleRef),
).size;

const card = (a, i) => `
  <article class="sheet" data-name="${esc(a.name)} ${esc(a.repoClass)} ${esc(a.file)}" tabindex="-1">
    ${TICKS}
    <header class="sheet-hd">
      <span class="ref">A${String(i + 1).padStart(2, "0")}</span>
      <h3>${esc(a.name)}</h3>
      <span class="engine engine-${a.engine}">${a.engine === "dagger" ? "dagger call" : "pnpm build"}</span>
    </header>
    ${a.repoClass ? `<p class="klass"><span>for</span> ${esc(a.repoClass)}</p>` : ""}
    ${a.desc ? `<p class="desc">${esc(a.desc)}</p>` : ""}
    <dl class="specs">
      <dt>file</dt><dd><code>${esc(a.file)}</code></dd>
      ${a.moduleRef ? `<dt>module</dt><dd><code>${esc(a.moduleRef.replace("github.com/chirag127/workflows/", ""))}</code></dd>` : ""}
      ${a.call ? `<dt>call</dt><dd><code>${esc(a.call)}</code></dd>` : ""}
      <dt>secrets</dt><dd>${
				a.secrets.length
					? a.secrets
							.map((s) => `<span class="secret">${esc(s)}</span>`)
							.join(" ")
					: `<span class="secret none">none</span>`
			}</dd>
    </dl>
    <div class="pin">
      <div class="pin-bar">
        <span>downstream pin — <code>ci.yml</code></span>
        <button class="copy" type="button" data-copy="${esc(pinSnippet(a))}">copy</button>
      </div>
      <pre><code>${esc(pinSnippet(a))}</code></pre>
    </div>
  </article>`;

const now = new Date().toISOString().slice(0, 10);

// signature: schematic pipeline flow diagram (hairline SVG)
const flowSvg = `
<svg class="flow" viewBox="0 0 920 120" role="img" aria-label="Pipeline: downstream repo calls workflow adapter, which runs dagger call, invoking a Dagger module.">
  <defs>
    <marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="var(--amber)"/>
    </marker>
  </defs>
  ${[
		{ x: 8, label: "downstream", sub: "ci.yml pin" },
		{ x: 240, label: "adapter", sub: "ci-*.yml" },
		{ x: 472, label: "dagger call", sub: "ci --source=." },
		{ x: 704, label: "module", sub: "dagger/*" },
	]
		.map(
			(n) => `
    <g class="node">
      <rect x="${n.x}" y="34" width="200" height="52" rx="3"/>
      <text x="${n.x + 100}" y="58" class="n-label">${n.label}</text>
      <text x="${n.x + 100}" y="76" class="n-sub">${n.sub}</text>
    </g>`,
		)
		.join("")}
  ${[228, 460, 692]
		.map(
			(x) =>
				`<line x1="${x - 20}" y1="60" x2="${x + 12}" y2="60" class="wire" marker-end="url(#ah)"/>`,
		)
		.join("")}
</svg>`;

const cards = adapters.map(card).join("\n");

const html = `<!doctype html>
<html lang="en" data-theme="blueprint">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>workflows — reusable CI adapter catalog</title>
<meta name="description" content="Blueprint catalog of ${adapters.length} reusable GitHub Actions workflow adapters + Dagger modules for the chirag127 fleet. Copy-paste pin snippets."/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
:root{
  --navy:#0d1b2a; --cyanotype:#13315c; --cyan:#56ccf2; --amber:#ffb703;
  --paper:#eef0e2; --ink:#14213d;
  --grid:rgba(86,204,242,.10); --grid-strong:rgba(86,204,242,.18);
  --bg:var(--navy); --panel:#0f2138; --fg:#dbe7f0; --muted:#8aa6bd;
  --line:rgba(86,204,242,.32); --accent:var(--amber); --link:var(--cyan);
  --disp:"Chakra Petch",system-ui,sans-serif;
  --body:"IBM Plex Sans",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,monospace;
}
html[data-theme="ozalid"]{
  --bg:var(--paper); --panel:#f7f8ef; --fg:#1a2b3d; --muted:#5a6b7a;
  --line:rgba(20,33,61,.30); --accent:#b26a00; --link:#0b5e8a;
  --grid:rgba(20,33,61,.07); --grid-strong:rgba(20,33,61,.13);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}
body{
  margin:0; font-family:var(--body); color:var(--fg); background:var(--bg);
  line-height:1.5; -webkit-font-smoothing:antialiased;
  background-image:
    linear-gradient(var(--grid) 1px,transparent 1px),
    linear-gradient(90deg,var(--grid) 1px,transparent 1px),
    linear-gradient(var(--grid-strong) 1px,transparent 1px),
    linear-gradient(90deg,var(--grid-strong) 1px,transparent 1px);
  background-size:24px 24px,24px 24px,120px 120px,120px 120px;
}
a{color:var(--link)}
code{font-family:var(--mono)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}

/* frame — the drawing sheet border */
.frame{border:1px solid var(--line);margin:16px;min-height:calc(100vh - 32px);position:relative;background:linear-gradient(var(--panel),transparent 240px)}

header.top{padding:40px 0 24px}
.kicker{font-family:var(--mono);font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--accent);margin:0 0 10px}
h1{font-family:var(--disp);font-weight:700;font-size:clamp(2.4rem,7vw,4.6rem);line-height:.95;margin:0;letter-spacing:.02em}
h1 .u{color:var(--cyan)}
.lede{max-width:60ch;color:var(--muted);margin:16px 0 0;font-size:1.05rem}
.meta-row{display:flex;flex-wrap:wrap;gap:22px;margin-top:22px;font-family:var(--mono);font-size:12.5px;color:var(--muted)}
.meta-row b{color:var(--fg);font-weight:500}

.flow{width:100%;height:auto;margin:30px 0 6px;max-width:920px}
.flow rect{fill:none;stroke:var(--line);stroke-width:1}
.flow .n-label{fill:var(--fg);font-family:var(--disp);font-weight:600;font-size:15px;text-anchor:middle}
.flow .n-sub{fill:var(--muted);font-family:var(--mono);font-size:10.5px;text-anchor:middle;letter-spacing:.04em}
.flow .wire{stroke:var(--amber);stroke-width:1.4}

.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:26px 0 6px}
.search{flex:1;min-width:220px;display:flex;align-items:center;gap:8px;border:1px solid var(--line);padding:9px 12px;background:var(--panel)}
.search span{font-family:var(--mono);font-size:12px;color:var(--muted)}
.search input{flex:1;background:transparent;border:0;color:var(--fg);font-family:var(--mono);font-size:14px;outline:none}
.count{font-family:var(--mono);font-size:12px;color:var(--muted)}
.btn{font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;background:transparent;color:var(--fg);border:1px solid var(--line);padding:9px 14px;cursor:pointer}
.btn:hover{border-color:var(--accent);color:var(--accent)}

main{padding:8px 0 40px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:18px;margin-top:18px}

.sheet{position:relative;border:1px solid var(--line);background:var(--panel);padding:20px 18px 18px}
.sheet[hidden]{display:none}
.tick{position:absolute;width:9px;height:9px;pointer-events:none}
.tick::before,.tick::after{content:"";position:absolute;background:var(--accent)}
.tick::before{width:9px;height:1px;top:0}.tick::after{height:9px;width:1px;left:0}
.tick-tl{top:-1px;left:-1px}.tick-tr{top:-1px;right:-1px;transform:scaleX(-1)}
.tick-bl{bottom:-1px;left:-1px;transform:scaleY(-1)}.tick-br{bottom:-1px;right:-1px;transform:scale(-1)}
.sheet-hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.ref{font-family:var(--mono);font-size:11px;color:var(--accent);border:1px solid var(--line);padding:1px 6px}
.sheet-hd h3{font-family:var(--disp);font-weight:600;font-size:1.2rem;margin:0;flex:1;letter-spacing:.01em}
.engine{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;padding:2px 7px;border:1px solid var(--line);color:var(--muted)}
.engine-dagger{color:var(--cyan);border-color:var(--cyan)}
.engine-pnpm{color:var(--amber);border-color:var(--amber)}
.klass{margin:12px 0 0;font-size:.92rem}
.klass span{font-family:var(--mono);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.desc{margin:8px 0 0;color:var(--muted);font-size:.9rem}
.specs{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:14px 0 0;font-size:.82rem}
.specs dt{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding-top:2px}
.specs dd{margin:0}
.specs code{font-size:.8rem;color:var(--fg);word-break:break-all}
.secret{font-family:var(--mono);font-size:11px;background:var(--cyanotype);color:var(--cyan);padding:1px 6px;border-radius:2px}
html[data-theme="ozalid"] .secret{background:#dfe6ef;color:var(--link)}
.secret.none{background:transparent;border:1px dashed var(--line);color:var(--muted)}
.pin{margin-top:16px;border:1px solid var(--line)}
.pin-bar{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 60%,var(--bg))}
.pin-bar span{font-family:var(--mono);font-size:11px;color:var(--muted)}
.copy{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;background:transparent;border:1px solid var(--line);color:var(--fg);padding:3px 10px;cursor:pointer}
.copy:hover{border-color:var(--accent);color:var(--accent)}
.copy.ok{border-color:var(--cyan);color:var(--cyan)}
.pin pre{margin:0;padding:12px;overflow-x:auto;font-family:var(--mono);font-size:12px;line-height:1.55;color:var(--fg)}

/* title-block cartouche — bottom-right, like an engineering drawing */
.cartouche{position:fixed;right:16px;bottom:16px;z-index:5;border:1px solid var(--line);background:var(--panel);font-family:var(--mono);font-size:10.5px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));max-width:340px;box-shadow:0 4px 24px rgba(0,0,0,.28)}
.cartouche div{padding:6px 9px;border-right:1px solid var(--line);border-top:1px solid var(--line)}
.cartouche div:nth-child(-n+3){border-top:0}
.cartouche div:nth-child(3n){border-right:0}
.cartouche b{display:block;color:var(--muted);font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:2px}
.cartouche .val{color:var(--fg)}
@media (max-width:560px){.cartouche{display:none}}

footer{padding:26px 0 40px;border-top:1px solid var(--line);margin-top:20px;font-family:var(--mono);font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between}
footer a{text-decoration:none}
footer a:hover{color:var(--accent)}
</style>
</head>
<body>
<div class="frame">
<div class="wrap">
  <header class="top">
    <p class="kicker">Reusable CI Plumbing · chirag127 fleet</p>
    <h1>WORK<span class="u">FLOWS</span></h1>
    <p class="lede">A catalog of thin GitHub Actions adapters. Each one is a 5-line pin in a downstream repo; the real build/deploy logic lives in locally-reproducible Dagger TypeScript modules. Copy a pin, drop it in, done.</p>
    <div class="meta-row">
      <span><b>${adapters.length}</b> workflow adapters</span>
      <span><b>${daggerCount}</b> dagger modules wired</span>
      <span>pin tag <b>@${PIN_TAG}</b></span>
      <span>rev <b>${now}</b></span>
    </div>
    ${flowSvg}
    <div class="toolbar">
      <label class="search">
        <span>filter</span>
        <input id="q" type="search" placeholder="repo class, name, file…" aria-label="Filter workflow adapters"/>
      </label>
      <span class="count" id="count">${adapters.length} shown</span>
      <button class="btn" id="theme" type="button" aria-label="Toggle blueprint / ozalid theme">theme</button>
      <a class="btn" href="https://github.com/chirag127/workflows" style="text-decoration:none">repo ↗</a>
    </div>
  </header>

  <main>
    <div class="grid" id="grid">
${cards}
    </div>
  </main>

  <footer>
    <span>chirag127/workflows · MIT · Dagger-backed CI adapters</span>
    <span>generated by <code>scripts/gen-docs.mjs</code> — stdlib, zero deps</span>
  </footer>
</div>
</div>

<aside class="cartouche" aria-label="drawing title block">
  <div><b>Project</b><span class="val">workflows</span></div>
  <div><b>Sheet</b><span class="val">1 / 1</span></div>
  <div><b>Rev</b><span class="val">${now}</span></div>
  <div><b>Drawn</b><span class="val">gen-docs</span></div>
  <div><b>Scale</b><span class="val">1:1</span></div>
  <div><b>Units</b><span class="val">adapters</span></div>
</aside>

<script>
// filter
const q=document.getElementById('q'),grid=document.getElementById('grid'),count=document.getElementById('count');
const cards=[...grid.querySelectorAll('.sheet')];
q.addEventListener('input',()=>{
  const t=q.value.trim().toLowerCase();let n=0;
  for(const c of cards){const hit=c.dataset.name.toLowerCase().includes(t);c.hidden=!hit;if(hit)n++;}
  count.textContent=n+' shown';
});
// copy pin
grid.addEventListener('click',async e=>{
  const b=e.target.closest('.copy');if(!b)return;
  try{await navigator.clipboard.writeText(b.dataset.copy);}
  catch{const ta=document.createElement('textarea');ta.value=b.dataset.copy;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
  const o=b.textContent;b.textContent='copied';b.classList.add('ok');
  setTimeout(()=>{b.textContent=o;b.classList.remove('ok');},1400);
});
// theme toggle (persisted)
const root=document.documentElement,tb=document.getElementById('theme');
const saved=localStorage.getItem('wf-theme');if(saved)root.dataset.theme=saved;
tb.addEventListener('click',()=>{const t=root.dataset.theme==='ozalid'?'blueprint':'ozalid';root.dataset.theme=t;localStorage.setItem('wf-theme',t);});
</script>
</body>
</html>`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "index.html"), html);
// Pages: disable Jekyll so paths with _ are served verbatim
writeFileSync(join(OUT_DIR, ".nojekyll"), "");
console.log(
	`gen-docs: wrote site/index.html — ${adapters.length} adapters, ${daggerCount} dagger modules`,
);

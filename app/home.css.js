// Styles for the marketing homepage (app/page.js).
// Injected via <style> like the previous homepage, so it stays self-contained.
const CSS = `
:root {
  --ink: #14152a;
  --ink-2: #2a2d3e;
  --body: #4a4e63;
  --muted: #5b5f73;
  --faint: #8a8ca0;
  --line: #eceaf5;
  --line-2: #f3f1f8;
  --soft: #f6f5fc;
  --soft-2: #fafafe;
  --violet: #7c5cff;
  --violet-600: #6a4cff;
  --violet-700: #5b3df5;
  --violet-800: #4a35e0;
  --violet-50: #f1edff;
  --violet-200: #c9bfff;
  --blue: #4f6bff;
  --night: #0f1022;
  --amber: #f59e0b;
  --amber-ink: #b45309;
  --amber-50: #fff7ed;
  --green: #10b981;
  --green-ink: #047857;
  --green-50: #ecfdf5;
  --red: #ef4444;
  --red-ink: #b91c1c;
  --grad: linear-gradient(90deg, #7c5cff, #4f6bff);
}
* { box-sizing: border-box }
html { scroll-behavior: smooth }
body { margin: 0; background: #fff; color: var(--ink); -webkit-font-smoothing: antialiased }
button, input { font: inherit }
button { cursor: pointer }
.home { overflow-x: clip; font-family: var(--font-dm-sans), 'DM Sans', system-ui, sans-serif; color: var(--ink) }
.home a { color: inherit; text-decoration: none }
.h { font-family: var(--font-manrope), Manrope, system-ui, sans-serif; letter-spacing: -.03em; font-weight: 800 }
.grad-text { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent }
.wrap { max-width: 1240px; margin: 0 auto; padding: 0 24px }
.band { max-width: 1360px; margin: 0 auto }
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .14em; color: var(--violet-700); text-transform: uppercase }
.eyebrow.light { color: var(--violet-200) }
.h2 { margin: 12px 0 14px; font-size: clamp(34px, 4.4vw, 56px); line-height: 1.05 }
.lead { margin: 0; font-size: 17px; line-height: 1.6; color: var(--body) }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.icon { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none }
.mono { font-family: ui-monospace, Menlo, monospace }
.pill { font-size: 10px; font-weight: 700; letter-spacing: .06em; padding: 4px 8px; border-radius: 6px; white-space: nowrap }
.pill.high { color: var(--amber-ink); background: var(--amber-50) }
.pill.med { color: var(--violet-800); background: var(--violet-50) }
.pill.low { color: var(--green-ink); background: var(--green-50) }
.chip { font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px }
.chip.amber { background: var(--amber-50); color: var(--amber-ink) }
.chip.green { background: var(--green-50); color: var(--green-ink) }
.chip.violet { background: var(--violet-50); color: var(--violet-800) }
.chip.plain { background: var(--soft); color: var(--ink-2) }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none }
.spark-tile { width: 20px; height: 20px; border-radius: 6px; background: linear-gradient(135deg, #7c5cff, #4f6bff); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; flex: none }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 22px; border-radius: 999px; border: 0; font-weight: 600; font-size: 15px; transition: transform .2s, box-shadow .2s, opacity .2s }
.btn:hover { transform: translateY(-2px) }
.btn-dark { background: var(--ink); color: #fff !important }
.btn-grad { background: var(--grad); color: #fff !important; box-shadow: 0 10px 24px -10px rgba(90,60,240,.6) }
.btn-outline { border: 1.5px solid #d9d6e6; color: var(--ink) !important; background: #fff }
.btn-ghost-light { border: 1.5px solid rgba(255,255,255,.3); color: #fff !important; background: transparent }
.btn.block { width: 100%; border-radius: 12px; min-height: 48px }

/* Nav */
.topbar { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,.92); backdrop-filter: blur(16px); border-bottom: 1px solid #f0eff6 }
.nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 16px; padding-bottom: 16px }
.brand { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-manrope), Manrope, sans-serif; font-weight: 800; font-size: 21px; letter-spacing: -.03em }
.brand span { color: var(--muted); font-weight: 600 }
.brand .cernly-mark { width: 25px; height: 25px; flex: none; display: block }
.navlinks { display: flex; gap: 32px; font-size: 15px; font-weight: 500 }
.navlinks a { color: var(--ink-2) !important }
.navlinks a:hover { color: var(--violet-700) !important }
.navright { display: flex; align-items: center; gap: 18px; font-size: 15px; font-weight: 600 }

/* Hero */
.hero-outer { padding: 16px 16px 0 }
.hero { position: relative; border-radius: 36px; padding: 84px 24px 0; overflow: hidden;
  background: linear-gradient(120deg, #4a2fd1, #3a2fb8, #2442c4, #3b28b0, #4a2fd1); background-size: 300% 300%; animation: heroShift 16s ease-in-out infinite }
.orb { position: absolute; border-radius: 50%; filter: blur(10px); pointer-events: none }
.orb.a { width: 640px; height: 640px; left: -200px; top: -180px; background: radial-gradient(circle, rgba(124,92,255,.55), transparent 65%); animation: driftA 14s ease-in-out infinite }
.orb.b { width: 700px; height: 700px; right: -220px; top: 60px; background: radial-gradient(circle, rgba(46,86,235,.6), transparent 65%); animation: driftB 18s ease-in-out infinite }
.orb.c { width: 560px; height: 560px; left: 30%; bottom: -260px; background: radial-gradient(circle, rgba(88,52,220,.6), transparent 65%); animation: driftC 16s ease-in-out infinite }
.hero-copy { position: relative; max-width: 900px; margin: 0 auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 22px; color: #fff }
.hero-badge { display: inline-flex; align-items: center; gap: 10px; padding: 7px 14px 7px 8px; border-radius: 999px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25); font-size: 13px; font-weight: 600 }
.hero-badge b { background: #fff; color: #3a2bc4; padding: 3px 9px; border-radius: 999px; font-size: 11px; letter-spacing: .06em }
.hero h1 { margin: 0; font-size: clamp(42px, 6.4vw, 82px); line-height: 1 }
.hero-sub { margin: 0; color: #f0edff; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; max-width: 640px }
.urlform { width: 100%; max-width: 580px; display: flex; gap: 8px; padding: 8px; background: #fff; border-radius: 999px; box-shadow: 0 30px 60px -20px rgba(20,10,80,.55) }
.urlform .field { flex: 1; display: flex; align-items: center; gap: 10px; padding: 0 16px; min-height: 48px; color: var(--muted) }
.urlform input { border: 0; outline: none; font-size: 16px; width: 100%; color: var(--ink); background: transparent }
.urlform .btn { min-height: 48px }
.hero-ticks { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; color: #f0edff; font-size: 13px; font-weight: 500 }

.mock-wrap { position: relative; max-width: 1120px; margin: 64px auto 0 }
.float-chip { position: absolute; z-index: 3; border-radius: 16px; box-shadow: 0 24px 50px -18px rgba(20,10,80,.45) }
.float-chip.left { left: -36px; top: 120px; background: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 12px; width: 230px; animation: floaty 6s ease-in-out infinite }
.float-chip.right { right: -40px; top: 300px; background: var(--ink); color: #fff; padding: 16px; width: 270px; animation: floaty2 7s ease-in-out infinite }
.trend-tile { width: 40px; height: 40px; border-radius: 12px; background: var(--green-50); color: var(--green-ink); display: flex; align-items: center; justify-content: center }
.mock { position: relative; z-index: 2; background: #fff; border-radius: 22px 22px 0 0; box-shadow: 0 -10px 80px -10px rgba(10,0,60,.45); overflow: hidden }
.browserbar { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--soft-2); position: relative; overflow: hidden }
.lights { display: flex; gap: 6px }
.lights i { width: 11px; height: 11px; border-radius: 50%; display: block }
.lights i:nth-child(1) { background: #ff6159 } .lights i:nth-child(2) { background: #ffbd2e } .lights i:nth-child(3) { background: #28c941 }
.urlbar { flex: 1; max-width: 420px; margin: 0 auto; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; font-size: 12px; color: var(--muted); text-align: center }
.scanline { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; overflow: hidden }
.scanline i { display: block; width: 25%; height: 2px; background: linear-gradient(90deg, transparent, #7c5cff, #4f6bff, transparent); animation: sweep 2.6s ease-in-out infinite }
.app { display: flex; min-height: 560px }
.side { width: 210px; flex-shrink: 0; border-right: 1px solid var(--line); padding: 20px 16px; display: flex; flex-direction: column; gap: 6px }
.ws { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 14px }
.ws-icon { width: 28px; height: 28px; border-radius: 8px; background: var(--violet-50); color: var(--violet-600); display: inline-flex; align-items: center; justify-content: center; font-size: 13px }
.side-label { font-size: 10px; font-weight: 700; letter-spacing: .12em; color: var(--muted); padding: 6px 10px }
.side-item { font-size: 13px; padding: 9px 10px; border-radius: 9px; color: var(--ink-2); display: flex; justify-content: space-between }
.side-item.on { color: var(--violet-800); background: var(--violet-50); font-weight: 600 }
.side-item small { font-size: 11px; background: var(--violet-50); color: var(--violet-800); padding: 1px 7px; border-radius: 6px; font-weight: 700 }
.app-main { flex: 1; min-width: 0; padding: 24px 28px; background: #f7f7fb; display: flex; flex-direction: column; gap: 18px }
.app-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap }
.kicker { font-size: 11px; font-weight: 700; letter-spacing: .12em; color: var(--muted) }
.mini-btn { font-size: 12px; font-weight: 600; color: #fff; padding: 8px 12px; border-radius: 9px }
.score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px }
.score-card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; align-items: center; gap: 12px }
.ring-box { position: relative; flex-shrink: 0 }
.ring-box svg { transform: rotate(-90deg); display: block }
.ring-box .num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center }
.ring { animation: ring 1.6s cubic-bezier(.2,.8,.2,1) .3s forwards }
.card { background: #fff; border: 1px solid var(--line); border-radius: 16px }
.take { padding: 20px; display: flex; flex-direction: column; gap: 10px }
.take-label { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: .1em; color: var(--violet-700) }
.nextstep { background: var(--ink); border-radius: 16px; padding: 20px; color: #fff; display: flex; flex-direction: column; gap: 10px; position: relative; overflow: hidden }
.glowball { position: absolute; border-radius: 50%; pointer-events: none }
.plan-row { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--line-2); font-size: 13px }
.plan-row:last-child { border-bottom: 0 }
.plan-row strong { flex: 1; font-weight: 600 }
.two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px }

/* Loop bento */
.section { padding: 110px 0 40px }
.sec-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; margin-bottom: 48px }
.bento { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 20px }
.tile { border-radius: 28px; padding: 32px; display: flex; flex-direction: column; gap: 22px; min-height: 420px; transition: transform .25s, box-shadow .25s; position: relative; overflow: hidden }
.tile:hover { transform: translateY(-4px); box-shadow: 0 24px 48px -24px rgba(40,30,120,.35) }
.tile.soft { background: var(--soft) }
.tile.dark { background: var(--ink); color: #fff }
.tile.tint { background: linear-gradient(160deg, #fff, var(--violet-50)); border: 1px solid #e7e2fb }
.tile h3 { margin: 8px 0 6px; font-size: 26px }
.tile p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--body) }
.tile.dark p { color: #cfcde0 }
.tile-num { font-size: 12px; font-weight: 700; color: var(--violet-700); letter-spacing: .1em }
.tile.dark .tile-num { color: var(--violet-200) }
.panel { flex: 1; background: #fff; border-radius: 20px; border: 1px solid var(--line) }
.discover { padding: 22px; display: flex; gap: 22px; align-items: center }
.radar-box { position: relative; width: 140px; height: 140px; flex-shrink: 0 }
.radar-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--violet); animation: radar 2.4s ease-out infinite }
.radar-core { position: absolute; inset: 30px; border-radius: 50%; background: linear-gradient(135deg, #7c5cff, #4f6bff); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 16px 30px -10px rgba(90,60,240,.6) }
.typed-url { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 14px; background: var(--soft-2) }
.type { display: inline-block; overflow: hidden; white-space: nowrap; vertical-align: bottom; animation: type 6s steps(15) infinite }
.caret { color: var(--violet-600); animation: caret 1s step-end infinite }
.scan-row { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--ink-2) }
.scan-row span:nth-child(2) { flex: 1 }
.scan-row small { font-size: 12px; color: var(--muted) }
.done-dot { width: 20px; height: 20px; border-radius: 50%; background: var(--green); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; animation: popIn .35s cubic-bezier(.3,1.6,.5,1) both }
.spinner { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #e4e0f7; border-top-color: var(--violet-600); animation: spin 1.1s linear infinite }
.metric { font-size: 12px; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,.08); color: #e4e2f0 }
.glass { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 18px; padding: 20px }
.fix-row { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-bottom: 1px solid var(--line-2) }
.fix-box { width: 24px; height: 24px; flex-shrink: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700 }
.fix-box.open { border: 2px solid #d9d4f0; color: var(--muted) }
.fix-box.done { background: var(--green); color: #fff; font-size: 13px; animation: popIn .35s cubic-bezier(.3,1.6,.5,1) both }
.progress { flex: 1; height: 8px; border-radius: 4px; background: var(--violet-50); overflow: hidden }
.progress i { display: block; height: 8px; border-radius: 4px; background: var(--grad); transition: width .6s cubic-bezier(.2,.8,.2,1) }
.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 5s ease-in-out infinite }

/* Product showcase */
.showcase { background: var(--night); border-radius: 36px; padding: 80px 24px; position: relative; overflow: hidden; color: #fff }
.tablist { position: relative; display: flex; justify-content: center; gap: 6px; margin: 36px auto 32px; padding: 6px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); border-radius: 999px; width: fit-content; max-width: 100%; flex-wrap: wrap }
.tablist button { border: 0; font-size: 14px; font-weight: 600; padding: 12px 20px; min-height: 44px; border-radius: 999px; background: transparent; color: #e4e2f0; transition: background .2s, color .2s }
.tablist button[aria-selected="true"] { background: #fff; color: var(--ink) }
.screen { position: relative; max-width: 1140px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 40px 100px -30px rgba(0,0,0,.7); color: var(--ink) }
.screen-scroll { overflow-x: auto }
.screen-body { min-width: 880px; background: #f7f7fb; padding: 28px; min-height: 600px }
.fadeUp { animation: fadeUp .5s cubic-bezier(.2,.8,.2,1) both }
.split { display: grid; grid-template-columns: 1fr 300px; gap: 20px }
.site-card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 14px }
.site-initial { width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--line); display: inline-flex; align-items: center; justify-content: center; font-weight: 700; color: var(--violet-800); font-size: 13px }
.bars4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px }
.bars4 > div { height: 4px; border-radius: 2px; background: #f1eff7; overflow: hidden }
.bars4 i { display: block; height: 4px; transform-origin: left; animation: bar 1.4s cubic-bezier(.2,.8,.2,1) both }
.mini-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; font-size: 12px }
.mini-list > div { display: flex; gap: 10px; align-items: center }
.num-badge { font-weight: 700; color: var(--violet-800); background: var(--violet-50); padding: 3px 7px; border-radius: 6px }
.act-icon { width: 24px; height: 24px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; flex: none }

/* Checks (sticky scroll) */
.checks-layout { display: flex; flex-wrap: wrap; gap: 48px; align-items: flex-start }
.checks-nav { flex: 0 0 220px; position: sticky; top: 100px; display: flex; flex-direction: column; border-left: 2px solid var(--line) }
.checks-nav button { display: flex; align-items: center; gap: 12px; padding: 14px 20px; margin-left: -2px; border: 0; border-left: 2px solid transparent; background: none; text-align: left; font-size: 15px; font-weight: 500; color: var(--muted); transition: color .2s, border-color .2s }
.checks-nav button small { font-size: 11px; font-weight: 700; color: #9a9cb0 }
.checks-nav button[aria-current="true"] { border-left-color: var(--violet-600); color: var(--violet-800); font-weight: 700 }
.checks-nav button[aria-current="true"] small { color: var(--violet-600) }
.checks-progress { margin: 20px 0 0 20px; height: 4px; width: 160px; border-radius: 2px; background: var(--violet-50); overflow: hidden }
.checks-progress i { display: block; height: 4px; border-radius: 2px; background: var(--grad); transition: width .4s ease }
.checks-panels { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 120px }
.check-panel { display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 100px }
.check-panel h3 { margin: 0; font-size: clamp(28px, 3vw, 38px) }
.check-panel > p { margin: 0; max-width: 560px; font-size: 16px; line-height: 1.6; color: var(--body) }
.check-head { display: flex; align-items: center; gap: 10px }
.cat-icon { width: 36px; height: 36px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; flex: none }
.frame { margin-top: 14px; background: var(--soft); border-radius: 28px; padding: 24px }
.frame.dark { background: var(--ink); position: relative; overflow: hidden }
.frame-card { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 40px -30px rgba(40,30,120,.3) }
.wf-row { display: flex; align-items: center; gap: 14px; font-size: 13px; color: var(--muted) }
.wf-row > span { width: 140px; flex-shrink: 0 }
.wf-row > div { flex: 1; height: 14px }
.wf-row i { display: block; height: 14px; border-radius: 4px; transform-origin: left; animation: bar 4s cubic-bezier(.2,.8,.2,1) infinite }
.wf-row.hot { color: var(--ink); font-weight: 600 }
.audit { display: flex; justify-content: space-between; gap: 12px; font-size: 14px }
.audit b { font-weight: 600 }
.audit .pass { color: var(--green-ink) } .audit .warn { color: var(--amber-ink) } .audit .bad { color: var(--red-ink) }
.audit.first { padding-top: 4px; border-top: 1px solid var(--line-2) }
.serp { border-radius: 14px; padding: 16px; border: 1px solid var(--line); background: var(--soft-2) }
.shimmer { display: block; height: 10px; border-radius: 3px; background: linear-gradient(90deg, rgba(124,92,255,.08) 25%, rgba(124,92,255,.22) 50%, rgba(124,92,255,.08) 75%); background-size: 200% 100%; animation: shimmer 2.4s linear infinite }
.img-flag { width: 180px; height: 130px; border-radius: 14px; background: linear-gradient(135deg, #c7d2fe, #a5b4fc); position: relative; flex-shrink: 0; overflow: hidden }
.img-flag b { position: absolute; top: 8px; left: 8px; font-size: 11px; background: #dc2626; color: #fff; padding: 3px 7px; border-radius: 6px }
.code { flex: 1; min-width: 220px; font-size: 14px; line-height: 1.8; color: var(--ink-2); background: var(--soft-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px }
.sec-badge { position: relative; width: 120px; height: 120px; flex-shrink: 0 }
.sec-badge .radar-ring { border-color: var(--green) }
.sec-badge > div:last-child { position: absolute; inset: 20px; border-radius: 50%; background: var(--green-50); color: var(--green-ink); display: flex; flex-direction: column; align-items: center; justify-content: center }
.sec-row { display: flex; align-items: center; gap: 12px; font-size: 14px }
.sec-row .done-dot { width: 22px; height: 22px }
.sec-row .mono { flex: 1; font-size: 13px }
.ai-row { display: flex; gap: 14px; align-items: flex-start; padding: 16px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); transition: background .4s, border-color .4s }
.ai-row.hot { background: rgba(124,92,255,.22); border-color: rgba(164,139,255,.6) }
.ai-row .n { width: 28px; height: 28px; flex-shrink: 0; border-radius: 9px; background: rgba(255,255,255,.1); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700 }
.ai-row.hot .n { background: var(--grad) }
.ai-row .tag { font-size: 11px; font-weight: 700; padding: 5px 9px; border-radius: 999px; white-space: nowrap; background: rgba(255,255,255,.1); color: #e4e2f0 }
.ai-row .tag.first { background: #fff; color: #3a2bc4 }

/* Ask Cernly */
.ask-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 56px; align-items: center }
.ticks-list { display: flex; flex-direction: column; gap: 12px; margin-top: 6px }
.ticks-list > div { display: flex; gap: 12px; align-items: flex-start; font-size: 15px }
.tick { width: 24px; height: 24px; border-radius: 8px; background: var(--violet-50); color: var(--violet-800); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px }
.chat { position: relative; background: #fff; border: 1px solid var(--line); border-radius: 24px; box-shadow: 0 40px 80px -40px rgba(40,30,120,.35); overflow: hidden }
.chat-body { padding: 22px 20px; display: flex; flex-direction: column; gap: 14px; min-height: 380px }
.bubble { max-width: 88%; padding: 12px 16px; font-size: 14px; line-height: 1.6; animation: fadeUp .5s cubic-bezier(.2,.8,.2,1) both }
.bubble.me { align-self: flex-end; max-width: 78%; background: var(--ink); color: #fff; border-radius: 16px 16px 4px 16px }
.bubble.ai { align-self: flex-start; background: #f4f2fb; color: var(--ink-2); border-radius: 16px 16px 16px 4px }
.typing { display: flex; gap: 5px; padding: 14px 16px }
.typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--violet-600); animation: dots 1.2s infinite }
.typing i:nth-child(2) { animation-delay: .15s } .typing i:nth-child(3) { animation-delay: .3s }
.suggest { font-size: 12px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line); color: var(--ink-2); background: #fff }
.ask-input { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 12px; padding: 6px 6px 6px 14px }
.ask-input input { flex: 1; border: 0; outline: none; font-size: 14px; background: transparent; min-width: 0 }
.send { width: 40px; height: 40px; border: 0; border-radius: 10px; background: linear-gradient(135deg, #7c5cff, #4f6bff); color: #fff; display: inline-flex; align-items: center; justify-content: center }

/* Paths + pricing + FAQ */
.paths { background: var(--soft); border-radius: 36px; padding: 80px 24px }
.paths-grid { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 24px }
.path-card, .price-card { background: #fff; border: 1px solid var(--line); border-radius: 24px; padding: 30px; display: flex; flex-direction: column; gap: 16px; transition: transform .25s, box-shadow .25s }
.path-card:hover { transform: translateY(-4px); box-shadow: 0 24px 48px -24px rgba(40,30,120,.35) }
.path-card h3, .price-card h3 { margin: 0; font-size: 22px }
.path-card p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--body) }
.path-card .btn, .price-card .btn { margin-top: auto }
.feat-list { display: flex; flex-direction: column; gap: 10px; font-size: 15px; color: var(--ink-2); margin: 0; padding: 0; list-style: none }
.path-icon { width: 48px; height: 48px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center }
.price-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 20px }
.price-card { padding: 32px; gap: 18px; position: relative; overflow: hidden }
.price-card.feature { background: var(--ink); color: #fff; border-color: var(--ink); box-shadow: 0 40px 80px -30px rgba(74,53,224,.55) }
.price-card .tier { font-size: 13px; font-weight: 700; letter-spacing: .1em; color: var(--muted); display: flex; justify-content: space-between; align-items: center }
.price-card.feature .tier { color: var(--violet-200) }
.price { font-size: 52px; line-height: 1 }
.price small { font-size: 15px; color: #a7a4c0; font-weight: 600; letter-spacing: 0 }
.price-card hr { border: 0; height: 1px; background: var(--line); margin: 0; width: 100% }
.price-card.feature hr { background: rgba(255,255,255,.12) }
.badge { font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px; letter-spacing: .04em }
.faq-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: 48px }
.faq-item { border: 1px solid var(--line); border-radius: 16px; background: #fff; transition: background .2s }
.faq-item.open { background: var(--soft-2) }
.faq-item button { width: 100%; border: 0; background: transparent; text-align: left; padding: 20px 22px; min-height: 44px; display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 16px; font-weight: 600; color: var(--ink) }
.faq-item button span { font-size: 22px; color: var(--violet-700); transition: transform .2s }
.faq-item.open button span { transform: rotate(45deg) }
.faq-item p { margin: 0; padding: 0 22px 20px; font-size: 15px; line-height: 1.65; color: var(--body) }

/* Closing + footer */
.closing { border-radius: 36px; background: var(--night); position: relative; overflow: hidden; padding: 100px 24px; text-align: center }
.closing h2 { margin: 0; color: #fff; font-size: clamp(38px, 5.2vw, 68px); line-height: 1.02 }
.closing .grad-text { background: linear-gradient(90deg, #a48bff, #7d95ff); -webkit-background-clip: text; background-clip: text }
.glass-chip { padding: 12px 16px; border-radius: 16px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); color: #e4e2f0; font-size: 13px; font-weight: 600 }
.footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; font-size: 14px; color: var(--muted); padding-top: 36px; padding-bottom: 48px }
.footer nav { display: flex; gap: 24px; flex-wrap: wrap }
.footer nav a:hover { color: var(--violet-700) }
.glow { animation: glow 5s ease-in-out infinite }

.toast { position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 20px); background: var(--ink); color: #fff; padding: 14px 18px; border-radius: 12px; font-size: 14px; opacity: 0; pointer-events: none; transition: opacity .25s, transform .25s; z-index: 100; max-width: calc(100% - 32px) }
.toast.show { opacity: 1; transform: translate(-50%, 0) }

@keyframes heroShift { 0%, 100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
@keyframes driftA { 0%, 100% { transform: translate(0,0) scale(1) } 50% { transform: translate(160px,90px) scale(1.15) } }
@keyframes driftB { 0%, 100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-180px,60px) scale(.9) } }
@keyframes driftC { 0%, 100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-120px,-110px) scale(1.2) } }
@keyframes ring { to { stroke-dashoffset: var(--o) } }
@keyframes sweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(400%) } }
@keyframes floaty { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes floaty2 { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(8px) } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes popIn { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: scale(1) } }
@keyframes draw { 0% { stroke-dashoffset: 1 } 55%, 100% { stroke-dashoffset: 0 } }
@keyframes bar { 0% { transform: scaleX(0) } 40%, 100% { transform: scaleX(1) } }
@keyframes radar { 0% { transform: scale(.4); opacity: .7 } 100% { transform: scale(1.6); opacity: 0 } }
@keyframes spin { to { transform: rotate(360deg) } }
@keyframes type { 0% { width: 0 } 45%, 100% { width: 15ch } }
@keyframes caret { 50% { opacity: 0 } }
@keyframes dots { 0%, 80%, 100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-3px) } }
@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes glow { 0%, 100% { opacity: .55 } 50% { opacity: .9 } }

@media (max-width: 900px) {
  .hide-sm { display: none !important }
  .urlform { flex-direction: column; border-radius: 24px }
  .discover { flex-direction: column; align-items: stretch }
  .radar-box { align-self: center }
}
@media (max-width: 760px) {
  .navlinks { display: none }
  .wrap { padding: 0 18px }
  .hero { padding-top: 56px }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important }
  html { scroll-behavior: auto }
}
`;

export default CSS;

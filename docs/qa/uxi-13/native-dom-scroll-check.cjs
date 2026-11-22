"use strict";
// Synthetic, static DOM evidence. No native, auth, API or business action.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const root = path.resolve(__dirname, "../../..");
const profile = path.join(root, "target", `uxi-13-scroll-chrome-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
  "--disable-sync", "--disable-extensions", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
const allowed = new Map([["customer", "uxi-08-preview"], ["customer-lifecycle", "uxi-09-preview"],
  ["operations", "uxi-10-preview"], ["operations-finance", "uxi-12-preview"]]);
const server = http.createServer((req, res) => {
  const parts = new URL(req.url, "http://127.0.0.1").pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !allowed.has(parts[0]) || !/^[\w-]+\.html$/.test(parts[1])) return res.writeHead(404).end();
  const file = path.join(root, "target", allowed.get(parts[0]), parts[1]);
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
let connection;
const results = [];
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); const pending = new Map(); let id = 0;
    socket.onopen = () => resolve({ call(method, params = {}) { return new Promise((ok, fail) => {
      const n = ++id; const timer = setTimeout(() => { pending.delete(n); fail(new Error(method)); }, 20000);
      pending.set(n, { ok, fail, timer }); socket.send(JSON.stringify({ id: n, method, params }));
    }); }, close() { socket.close(); } });
    socket.onerror = reject;
    socket.onmessage = event => { const msg = JSON.parse(event.data); const p = pending.get(msg.id);
      if (!p) return; pending.delete(msg.id); clearTimeout(p.timer); if (msg.error) p.fail(new Error(JSON.stringify(msg.error))); else p.ok(msg.result); };
  });
}
async function evaluate(expression) {
  const r = await connection.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value;
}
async function shot(name) {
  const r = await connection.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(__dirname, "screenshots", `${name}.png`), Buffer.from(r.data, "base64"));
}
async function main() {
  await new Promise(ok => server.listen(0, "127.0.0.1", ok));
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
  const port = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  connection = await connect(tab.webSocketDebuggerUrl);
  await connection.call("Page.enable"); await connection.call("Runtime.enable");
  const cases = [];
  for (const [kind, screen] of [["customer", "home"], ["customer-lifecycle", "checkout"], ["operations", "dashboard"], ["operations-finance", "summary"]]) {
    for (const tenant of ["a", "b"]) for (const scale of [100, 200]) cases.push({ kind, screen, tenant, scale });
  }
  cases.push({ kind: "customer", screen: "product", tenant: "a", scale: 100 },
    { kind: "customer", screen: "product", tenant: "b", scale: 200 },
    { kind: "customer-lifecycle", screen: "quote", tenant: "a", scale: 100 },
    { kind: "customer-lifecycle", screen: "quote", tenant: "b", scale: 200 },
    { kind: "operations-finance", screen: "closing", tenant: "a", scale: 100 },
    { kind: "operations-finance", screen: "closing", tenant: "b", scale: 200 });
  for (const item of cases) {
    const native = item.kind.startsWith("operations"); const width = native ? 320 : 360;
    const file = `${item.tenant}-${native ? "owner-" : ""}${item.screen}-${width}-${item.scale}.html`;
    const name = `scroll-${item.kind}-${file.slice(0, -5)}`;
    const url = `http://127.0.0.1:${server.address().port}/${item.kind}/${file}`;
    await connection.call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await connection.call("Page.navigate", { url });
    for (let i = 0; i < 60; i++) { if (await evaluate("document.readyState==='complete'&&!!document.querySelector('[role=tab]')")) break; await delay(100); }
    await delay(80);
    if (item.screen === "quote" || (item.tenant === "a" && item.scale === 200) || (item.tenant === "b" && item.scale === 100)) await shot(`${name}-top`);
    const before = await evaluate(`(() => { const tabs=[...document.querySelectorAll('[role=tab]')]; const tab=tabs.at(-1); const nav=tab.parentElement.parentElement; tabs[0].focus(); return {title:document.title,lang:document.documentElement.lang,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,tabLabels:tabs.map(t=>t.getAttribute('aria-label')),tabCount:tabs.length,navClientWidth:nav.clientWidth,navScrollWidth:nav.scrollWidth,navOverflow:getComputedStyle(nav).overflowX,firstTabWidth:tabs[0].getBoundingClientRect().width}; })()`);
    for (let i = 1; i < before.tabCount; i++) {
      await connection.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await connection.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    }
    const keyboard = await evaluate(`(() => { const tab=document.querySelectorAll('[role=tab]');const last=tab[tab.length-1];const nav=last.parentElement.parentElement;const a=last.getBoundingClientRect(),n=nav.getBoundingClientRect();return {focusedLabel:document.activeElement.getAttribute('aria-label'),lastTabFocused:document.activeElement===last,navScrollLeft:nav.scrollLeft,lastTabFullyVisible:a.left>=n.left-2&&a.right<=n.right+2,lastTabBounds:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},navBounds:{left:n.left,right:n.right,top:n.top,bottom:n.bottom}};})()`);
    if (!keyboard.lastTabFullyVisible) await shot(`${name}-keyboard-focus`);
    const explicitHorizontalScroll = await evaluate(`(() => {const last=[...document.querySelectorAll('[role=tab]')].at(-1);const nav=last.parentElement.parentElement;nav.scrollLeft=nav.scrollWidth;const a=last.getBoundingClientRect(),n=nav.getBoundingClientRect();return{navScrollLeft:nav.scrollLeft,maxScroll:nav.scrollWidth-nav.clientWidth,lastTabFullyVisible:a.left>=n.left-2&&a.right<=n.right+2,lastTabBounds:{left:a.left,right:a.right,top:a.top,bottom:a.bottom}};})()`);
    const controlCheck = await evaluate(`(() => {
      const controls=[...document.querySelectorAll('button,input,textarea')].filter(e=>!e.disabled&&e.getAttribute('role')!=='tab');
      const failures=[];for(const el of controls){el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();let l=0,t=0,rr=innerWidth,b=innerHeight;
        for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),x=p.getBoundingClientRect();if(/auto|scroll|hidden/.test(s.overflowX)){l=Math.max(l,x.left);rr=Math.min(rr,x.right);}if(/auto|scroll|hidden/.test(s.overflowY)){t=Math.max(t,x.top);b=Math.min(b,x.bottom);}}
        if(r.left<l-2||r.right>rr+2||r.top<t-2||r.bottom>b+2)failures.push({label:el.getAttribute('aria-label')||el.innerText,element:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},clip:{left:l,right:rr,top:t,bottom:b}});
      }return{enabledControlsExamined:controls.length,notFullyRevealedAfterScroll:failures};})()`);
    const bottom = await evaluate(`(() => {const xs=[...document.querySelectorAll('div')].filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+2);xs.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));const main=xs[0];if(main)main.scrollTop=main.scrollHeight;return{mainScrollClientHeight:main?.clientHeight,mainScrollHeight:main?.scrollHeight,mainScrollTop:main?.scrollTop,visibleText:main?.innerText.slice(-1400)};})()`);
    await shot(`${name}-bottom`);
    results.push({ ...item, width, before, keyboard, explicitHorizontalScroll, controlCheck, bottom });
    fs.writeFileSync(path.join(__dirname, "native-dom-scroll-results.json"), JSON.stringify(results, null, 2));
    console.log(`${name}: tabs=${keyboard.lastTabFocused&&keyboard.lastTabFullyVisible}, controlsNotFullyRevealed=${controlCheck.notFullyRevealedAfterScroll.length}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (connection) { try { await connection.call("Browser.close"); } catch {} connection.close(); }
  chrome.kill(); await new Promise(ok => server.close(ok));
});

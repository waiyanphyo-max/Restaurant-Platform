"use strict";
// Local, synthetic evidence only. Uses an isolated headless Chrome profile.
// Guest URLs come from the existing smoke fixture. Native previews are static
// DOM approximations; none of these checks establishes Android acceptance.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const root = path.resolve(__dirname, "../../..");
const output = path.join(__dirname, "screenshots");
fs.mkdirSync(output, { recursive: true });
const profile = path.join(root, "target/uxi-13-chrome-profile");
fs.mkdirSync(profile, { recursive: true });
fs.rmSync(path.join(profile, "DevToolsActivePort"), { force: true });
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-sync", "--disable-extensions",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let connection;
let server;
const results = [];
const options = process.argv.slice(2);
const guestLog = options.includes("--guest") ? fs.readFileSync(path.join(__dirname, "guest-production-smoke.log"), "utf8") : "";
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    socket.onopen = () => resolve({
      call(method, params = {}) {
        return new Promise((ok, fail) => {
          const messageId = ++id;
          const timer = setTimeout(() => { pending.delete(messageId); fail(new Error(`CDP timeout: ${method}`)); }, 20000);
          pending.set(messageId, { ok, fail, timer });
          socket.send(JSON.stringify({ id: messageId, method, params }));
        });
      }, close() { socket.close(); },
    });
    socket.onerror = reject;
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.fail(new Error(JSON.stringify(message.error))); else item.ok(message.result);
    };
  });
}
async function evaluate(expression) {
  const result = await connection.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function capture(name, url, width, height = 900, screenshot = true, scale = 1) {
  await connection.call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await connection.call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await connection.call("Page.navigate", { url });
  for (let n = 0; n < 80; n++) {
    if (await evaluate("document.readyState === 'complete' && document.body && document.body.innerText.length > 0")) break;
    await delay(100);
  }
  if (scale !== 1) await evaluate(`document.documentElement.style.fontSize = '${scale * 100}%'`);
  await delay(150);
  const measures = await evaluate(`(() => {
    const body = document.body;
    const controls = [...document.querySelectorAll('button,input,select,textarea,a[href]')];
    const texts = controls.filter(el => el.offsetWidth && el.offsetHeight).map(el => ({tag:el.tagName,text:el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('name') || '',disabled:!!el.disabled}));
    return { title:document.title, viewport:innerWidth, documentWidth:document.documentElement.scrollWidth,
      bodyWidth:body.scrollWidth, horizontalOverflow:document.documentElement.scrollWidth > innerWidth,
      language:document.documentElement.lang, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
      brokenImages:[...document.images].filter(i=>i.complete && !i.naturalWidth).length,
      headings:[...document.querySelectorAll('h1,h2,h3,[role=heading]')].map(e=>e.innerText),
      controls:texts, unnamedControls:texts.filter(c=>!c.text.trim()).length,
      bodyText:body.innerText.slice(0,16000), bodyContainsSynthetic: /synthetic|fixture|Restaurant [AB]/i.test(body.innerText)
    };
  })()`);
  const ax = await connection.call("Accessibility.getFullAXTree");
  measures.axNodes = ax.nodes.length;
  measures.axNamedButtons = ax.nodes.filter(n => n.role?.value === "button" && n.name?.value).length;
  if (screenshot) {
    const shot = await connection.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(shot.data, "base64"));
  }
  results.push({ name, url, width, height, rootTextScale: scale, screenshot: screenshot ? `screenshots/${name}.png` : null, ...measures });
  console.log(`${name}: width=${measures.documentWidth}/${width}, unnamed=${measures.unnamedControls}`);
  fs.writeFileSync(path.join(__dirname, options.includes("--guest") ? "guest-browser-results.json" : "native-dom-results.json"), JSON.stringify(results, null, 2));
}
async function main() {
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let n = 0; n < 100 && !fs.existsSync(portFile); n++) await delay(100);
  const port = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  connection = await connect(target.webSocketDebuggerUrl);
  await connection.call("Page.enable");
  await connection.call("Runtime.enable");
  await connection.call("Accessibility.enable");
  await connection.call("Network.enable");
  await connection.call("Network.setBlockedURLs", { urls: ["https://media.example.test/*"] });
  if (options.includes("--guest")) {
    for (const letter of ["A", "B"]) {
      const origin = new RegExp(`Preview ${letter}: (http[^\\s]+)`).exec(guestLog)[1].replace(/\/$/, "");
      const product = new RegExp(`Preview ${letter} product: (http[^\\s]+)`).exec(guestLog)[1];
      await connection.call("Network.setCookie", { name: "guest-language", value: "en", url: origin });
      for (const width of [320, 1440]) {
        await capture(`guest-${letter.toLowerCase()}-menu-${width}-100`, `${origin}/menu`, width);
        await capture(`guest-${letter.toLowerCase()}-product-${width}-100`, product, width);
      }
      await capture(`guest-${letter.toLowerCase()}-menu-320-200`, `${origin}/menu`, 320, 900, true, 2);
      await capture(`guest-${letter.toLowerCase()}-home-1440-100`, `${origin}/`, 1440);
      await connection.call("Network.setCookie", { name: "guest-language", value: "my", url: origin });
      await capture(`guest-${letter.toLowerCase()}-burmese-320-100`, `${origin}/menu`, 320);
      await capture(`guest-${letter.toLowerCase()}-burmese-320-200`, `${origin}/menu`, 320, 900, true, 2);
      await capture(`guest-${letter.toLowerCase()}-burmese-320-search`, `${origin}/menu`, 320, 900, false);
      await evaluate("document.querySelector('#menu-search').focus()");
      await connection.call("Input.insertText", { text: "no-such-synthetic-product" });
      await delay(200);
      const searchCheck = await evaluate("({value:document.querySelector('#menu-search').value,body:document.body.innerText.slice(-6000)})");
      const emptyShot = await connection.call("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `guest-${letter.toLowerCase()}-burmese-no-results.png`), Buffer.from(emptyShot.data, "base64"));
      const clearResult = await evaluate(`(() => {
        const button=[...document.querySelectorAll('button')].find(el=> /Clear|ရှင်း/i.test(el.textContent));
        if(!button)return {found:false};button.click();return {found:true};
      })()`);
      await delay(100);
      clearResult.focusReturned = await evaluate("document.activeElement.id === 'menu-search'");
      const keyboard = await connection.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      void keyboard;
      const focus = await evaluate("({tag:document.activeElement.tagName,name:document.activeElement.getAttribute('aria-label')||document.activeElement.innerText,outline:getComputedStyle(document.activeElement).outlineStyle})");
      results.push({ name: `guest-${letter.toLowerCase()}-keyboard-search`, searchCheck, clearResult, focus, text: await evaluate("document.body.innerText.slice(-4000)") });
    }
  } else {
    const allowed = new Map([
      ["customer", "uxi-08-preview"], ["customer-lifecycle", "uxi-09-preview"],
      ["operations", "uxi-10-preview"], ["operations-catalog", "uxi-11-preview"], ["operations-finance", "uxi-12-preview"],
    ]);
    server = http.createServer((req, res) => {
      const parts = new URL(req.url, "http://127.0.0.1").pathname.split("/").filter(Boolean);
      const directory = allowed.get(parts[0]);
      if (!directory || parts.length !== 2 || !/^[\w-]+\.html$/.test(parts[1])) { res.writeHead(404).end(); return; }
      const file = path.join(root, "target", directory, parts[1]);
      if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise(ok => server.listen(0, "127.0.0.1", ok));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const selections = {
      customer: ["home", "product", "cart", "account", "menu"],
      "customer-lifecycle": ["address", "checkout", "orders", "order", "uncertain", "quote"],
      operations: ["dashboard", "orders", "delivery", "queue"],
      "operations-catalog": ["menu", "team", "settings", "zones"],
      "operations-finance": ["summary", "shopping", "purchases", "sales_history", "cashbook", "closing", "audit", "exports"],
    };
    for (const [kind, screens] of Object.entries(selections)) for (const tenant of ["a", "b"]) {
      const native = kind.startsWith("operations");
      const width = native ? 320 : 360;
      const scale = tenant === "a" ? 100 : 200;
      for (const screen of screens) {
        const file = `${tenant}-${native ? "owner-" : ""}${screen}-${width}-${scale}.html`;
        await capture(`${kind}-${file.slice(0,-5)}`, `${origin}/${kind}/${file}`, width, 1000, ["home", "product", "address", "checkout", "order", "dashboard", "menu", "settings", "summary", "closing"].includes(screen));
      }
    }
    for (const role of ["staff", "delivery_driver"]) {
      const file = `b-${role}-summary-320-200.html`;
      await capture(`finance-denied-${role}`, `${origin}/operations-finance/${file}`, 320, 1000, false);
    }
  }
  const filename = options.includes("--guest") ? "guest-browser-results.json" : "native-dom-results.json";
  fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(results, null, 2));
  console.log(`Completed ${results.length} evidence rows`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (connection) { try { await connection.call("Browser.close"); } catch {} connection.close(); }
  chrome.kill();
  if (server) await new Promise(ok => server.close(ok));
});

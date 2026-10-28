import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const baseUrl = process.env['ANATOMY_URL'] ?? 'http://127.0.0.1:4200';
const executable = process.env['CHROME_BIN'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anatomy-docs-browser-'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'anatomy-docs-results-'));
const browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const failures = [];
const requests = [];
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await check()) return; await sleep(100); }
  throw new Error(`Timed out: ${label}`);
}
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  await until(() => fs.existsSync(portFile), 'Chrome debugging endpoint');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') failures.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) failures.push(`${message.params.response.status} ${message.params.response.url}`);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const check = async (name, expression) => {
    await until(() => evaluate(expression), name); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`);
  };
  const key = async (name, modifiers = 0) => {
    const params = { key: name, code: name === 'k' ? 'KeyK' : name, modifiers };
    await send('Input.dispatchKeyEvent', { ...params, type: 'keyDown' });
    await send('Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center'});const rect=node.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { ...point, type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1 });
  };
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifacts, `${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  const waitHeading = heading => until(() => evaluate(`document.querySelector('h1')?.textContent === ${JSON.stringify(heading)}`), heading);
  const navigate = async (route, heading) => { await send('Page.navigate', { url: baseUrl + route }); await waitHeading(heading); };
  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.docsWebGLCalls = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args) {
      if (/^webgl2?$|^experimental-webgl$/.test(args[0])) window.docsWebGLCalls++;
      return original.apply(this, args);
    };
  ` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/docs', 'Anatomy Angular Developer Documentation');
  await check('fresh documentation route has no WebGL calls, canvas or live anatomy', 'docsWebGLCalls===0 && !document.querySelector("canvas, app-organ-viewer, app-anatomy-page")');
  await check('desktop layout has no horizontal overflow and includes all three columns', 'document.documentElement.scrollWidth<=innerWidth && document.querySelector(".sidebar").getBoundingClientRect().width>0 && getComputedStyle(document.querySelector(".right-column")).display!=="none"');
  await screenshot('docs-home-desktop');
  await evaluate(`document.querySelector('nav[aria-label="Documentation sections"] a[href="/docs/blender-data-extraction"]').click();true`);
  await waitHeading('Blender & 3D Data Extraction');
  await check('Blender sidebar entry is active under Three.js engine', `(() => {const link=document.querySelector('nav[aria-label="Documentation sections"] a[aria-current="page"]');return link.getAttribute('href')==='/docs/blender-data-extraction' && link.closest('details').querySelector('summary').textContent.includes('Three.js engine');})()`);
  await check('Blender page renders Python, TypeScript, tables, subheadings and checklist', `(() => {const article=document.querySelector('article');return article.querySelectorAll('table').length>5 && article.querySelectorAll('.check-state').length>10 && article.querySelector('h3#position-location') && [...article.querySelectorAll('app-docs-code-block')].filter(block=>block.querySelector('.code-head').textContent.includes('python')).length===4 && article.textContent.includes('interface AnatomyAnnotation') && article.textContent.includes('Not yet extracted');})()`);
  await check('Blender uses native diagrams with preserved decision branches and safe inline source links', `document.querySelector('article .diagram').textContent.includes('No →') && document.querySelector('article p a[href*="/docs/source/"]') && !document.querySelector('canvas')`);
  await screenshot('docs-blender-desktop');
  await evaluate(`document.querySelector('.right-column app-docs-toc a[href$="#surface-normals"]').click();true`);
  await until(() => evaluate('location.hash==="#surface-normals" && Math.abs(document.getElementById("surface-normals").getBoundingClientRect().top-108)<12'), 'Blender normal section fragment');
  const blenderTimeOrigin = await evaluate('performance.timeOrigin');
  await send('Page.reload');
  await until(() => evaluate(`performance.timeOrigin!==${blenderTimeOrigin} && document.querySelector('h1')?.textContent==='Blender & 3D Data Extraction' && !!document.getElementById('surface-normals')`), 'Blender direct reload');
  await check('Blender direct refresh retains route and fragment', 'location.pathname==="/docs/blender-data-extraction" && location.hash==="#surface-normals"');
  for (const term of ['Blender', 'Vertex', 'Normal', 'Annotation']) {
    await key('k', 2);
    await evaluate(`(() => {const input=document.querySelector('#docs-search-input');input.value=${JSON.stringify(term)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await until(() => evaluate(`[...document.querySelectorAll('[role=option] strong')].some(item=>item.textContent==='Blender & 3D Data Extraction')`), `Blender search result for ${term}`);
    await check(`Blender content searchable for ${term}`, `[...document.querySelectorAll('[role=option] strong')].some(item=>item.textContent==='Blender & 3D Data Extraction')`);
    await key('Escape');
  }
  await evaluate(`(() => {const input=document.querySelector('#docs-search-input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  await evaluate(`document.querySelector('nav[aria-label="Documentation sections"] a[href="/docs/architecture"]').click();true`);
  await waitHeading('Application architecture');
  await check('sidebar navigation marks the active route', `document.querySelector('nav[aria-label="Documentation sections"] a[aria-current="page"]').getAttribute('href')==='/docs/architecture'`);
  await evaluate(`document.querySelector('.right-column app-docs-toc a[href$="#ownership"]').click();true`);
  await until(() => evaluate('location.hash==="#ownership"'), 'TOC fragment');
  await check('TOC scrolls to a real section heading', 'Math.abs(document.getElementById("ownership").getBoundingClientRect().top-108)<12');
  await key('k', 2);
  await until(() => evaluate('!!document.querySelector("app-docs-search dialog[open]")'), 'Ctrl+K dialog');
  await send('Input.insertText', { text: 'ModelLoader' });
  await until(() => evaluate(`[...document.querySelectorAll('[role=option] strong')].some(item=>item.textContent==='ModelLoader')`), 'ModelLoader search result');
  const targetIndex = await evaluate(`[...document.querySelectorAll('[role=option]')].findIndex(item=>item.querySelector('strong')?.textContent==='ModelLoader')`);
  assert(targetIndex >= 0, 'ModelLoader API result missing');
  for (let index = 0; index < targetIndex; index++) await key('ArrowDown');
  await key('Enter');
  await waitHeading('ModelLoader');
  await check('keyboard search opens API result and closes dialog', 'location.pathname==="/docs/api-reference/model-loader" && !document.querySelector("dialog[open]")');
  await screenshot('docs-api-desktop');
  await key('k', 2);
  await evaluate(`const input=document.querySelector('#docs-search-input');input.value='zzzz-no-matching-guide';input.dispatchEvent(new Event('input',{bubbles:true}));true`);
  await check('empty search results give a useful message', 'document.querySelector("dialog").textContent.includes("No documentation matches")');
  await key('Escape');
  await check('Escape closes search', '!document.querySelector("dialog[open]")');
  await evaluate(`document.querySelector('.source-links summary').click();document.querySelector('.source-links a').click();true`);
  await until(() => evaluate('!!document.querySelector("app-docs-source")'), 'source route');
  await check('source browser renders source text with no WebGL', 'document.querySelector("app-docs-source").textContent.includes("export class ModelLoader") && docsWebGLCalls===0');
  await send('Page.reload');
  await until(() => evaluate('!!document.querySelector("app-docs-source h1")'), 'source reload');
  await check('direct source reload works', 'document.querySelector("app-docs-source h1").textContent.includes("scene/model-loader.ts")');
  await navigate('/docs/dental-algorithms', 'Dental algorithms');
  await check('direct deep link renders detailed content and code without canvas', 'document.getElementById("identification") && document.querySelector("app-docs-code-block pre") && !document.querySelector("canvas")');
  await screenshot('docs-dental-desktop');
  await evaluate(`document.querySelector('button[aria-label="Use dark theme"]').click();true`);
  await check('theme is scoped to documentation', 'document.querySelector("app-docs-layout").classList.contains("dark") && !document.body.classList.contains("dark")');
  await screenshot('docs-dark-desktop');
  await send('Page.reload'); await waitHeading('Dental algorithms');
  await check('documentation theme survives reload', 'document.querySelector("app-docs-layout").classList.contains("dark")');
  await evaluate(`document.querySelector('button[aria-label="Use light theme"]').click();true`);
  // All conceptual routes are loaded directly, validating the dev server history fallback.
  const directRoutes = ['getting-started','architecture','project-structure','angular-foundation','data-models','services','organ-viewer','threejs-engine','model-loading','blender-data-extraction','geometry','dental-system','hotspots','raycasting','camera-controls','screenshots','persistence','performance','testing','api-reference','integration','troubleshooting','glossary','maintenance'];
  for (const route of directRoutes) {
    await send('Page.navigate', { url: baseUrl + '/docs/' + route });
    await until(() => evaluate(`location.pathname==='/docs/${route}' && !!document.querySelector('app-docs-page h1') && document.querySelector('h1').textContent!=='Page not found'`), route);
  }
  results.push({ name: `direct reloads of ${directRoutes.length} additional conceptual routes`, status: 'PASS' });
  await navigate('/docs/not-a-real-page', 'Page not found');
  await check('unknown page offers recovery links', `!!document.querySelector('.not-found a[href="/docs"]')`);
  await navigate('/docs/architecture', 'Application architecture');
  await evaluate(`document.querySelector('nav[aria-label="Documentation sections"] a[href="/docs/model-loading"]').click();true`);
  await waitHeading('Model loading and ownership');
  await evaluate('history.back();true'); await waitHeading('Application architecture');
  await evaluate('history.forward();true'); await waitHeading('Model loading and ownership');
  await check('browser back and forward restore documentation route', 'location.pathname==="/docs/model-loading"');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(250);
  await check('mobile page and scrollable code do not overflow viewport', 'document.documentElement.scrollWidth<=innerWidth && getComputedStyle(document.querySelector(".mobile-toc")).display!=="none"');
  await navigate('/docs/blender-data-extraction', 'Blender & 3D Data Extraction');
  await check('mobile Blender tables, code and diagram stay within the viewport', 'document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll("article .table-wrap, article pre, article .diagram")].every(element=>element.getBoundingClientRect().right<=innerWidth)');
  await screenshot('docs-blender-mobile');
  await click('button[aria-label="Open documentation navigation"]');
  await until(() => evaluate('document.querySelector("#docs-sidebar").getAttribute("aria-modal")==="true" && document.querySelector("main").hasAttribute("inert")'), 'mobile drawer rendered');
  await until(() => evaluate('Math.abs(document.querySelector("#docs-sidebar").getBoundingClientRect().left)<1'), 'drawer fully visible');
  await check('mobile drawer opens with inert background', 'document.querySelector("#docs-sidebar").getAttribute("aria-modal")==="true" && document.querySelector("main").hasAttribute("inert")');
  await until(() => evaluate('document.querySelector("#docs-sidebar").contains(document.activeElement)'), 'focus enters drawer');
  await check('mobile drawer moves keyboard focus inside', 'document.querySelector("#docs-sidebar").contains(document.activeElement)');
  await sleep(220);
  await screenshot('docs-mobile-navigation');
  await key('Escape');
  await until(() => evaluate('!document.querySelector(".drawer-open") && document.activeElement.getAttribute("aria-label")==="Open documentation navigation"'), 'drawer focus restored');
  await check('mobile Escape closes drawer and restores menu focus', '!document.querySelector(".drawer-open") && document.activeElement.getAttribute("aria-label")==="Open documentation navigation"');
  await evaluate(`document.querySelector('button[aria-label="Open documentation navigation"]').click();document.querySelector('nav[aria-label="Documentation sections"] a[href="/docs/integration"]').click();true`);
  await waitHeading('Integration handbook');
  await check('mobile route selection closes drawer', '!document.querySelector(".drawer-open") && !document.querySelector("main").hasAttribute("inert")');
  await screenshot('docs-mobile-integration');
  await check('all documentation visits made no WebGL context calls', 'docsWebGLCalls===0');
  const engineRequests = requests.filter(url => /\/models\/|\/(three(?:-mesh-bvh)?|OrbitControls|GLTFLoader|OBJLoader|MTLLoader|meshopt)[^/]*\.(?:js|glb|obj)/i.test(url));
  assert.deepEqual(engineRequests, [], 'Engine code/model requested while browsing docs');
  results.push({ name: 'documentation network requests exclude models and engine modules', status: 'PASS' });
  await evaluate(`document.querySelector('.viewer-link').click();true`);
  await until(() => evaluate('!!document.querySelector("app-organ-viewer canvas")'), 'return to anatomy');
  await check('viewer link mounts anatomy and initializes WebGL only on anatomy', 'location.pathname==="/anatomy" && docsWebGLCalls>0');
  await evaluate(`document.querySelector('.mobile-docs-link').click();true`);
  await waitHeading('Anatomy Angular Developer Documentation');
  await check('viewer-to-docs link destroys scene and removes canvas', '!document.querySelector("canvas,app-organ-viewer")');
  assert.deepEqual(failures, [], 'Uncaught browser errors or HTTP failures');
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, failures, requests }, null, 2));
  console.log(JSON.stringify({ artifacts, checks: results.length, failures }, null, 2));
} catch (error) {
  console.error(error);
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, failures, requests, error: String(error) }, null, 2));
  console.error(`Artifacts: ${artifacts}`); process.exitCode = 1;
} finally {
  socket?.close(); browser.kill(); await sleep(300);
  const resolved = path.resolve(profile);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('anatomy-docs-browser-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { /* Chrome may briefly retain a lock. */ }
  }
}

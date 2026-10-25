import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const baseUrl = process.env['ANATOMY_URL'] ?? 'http://127.0.0.1:4200';
const executable = process.env['CHROME_BIN'] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anatomy-browser-'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'anatomy-results-'));
const browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const failures = [];
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await sleep(100);
  }
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
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      failures.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      failures.push(`${message.params.response.status} ${message.params.response.url}`);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  };
  const check = async (name, expression) => {
    const value = await evaluate(expression);
    assert(value, name);
    results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  };
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifacts, `${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: artifacts });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: baseUrl });
  await until(() => evaluate('!!window.ng && !!document.querySelector("app-organ-viewer canvas")'), 'Angular viewer');
  await evaluate('window.v = ng.getComponent(document.querySelector("app-organ-viewer")); window.p = ng.getComponent(document.querySelector("app-anatomy-page")); window.list = ng.getComponent(document.querySelector("app-organ-list")); true');
  await until(() => evaluate('!v.isLoading() && !!v.model && v.animationId === null'), 'initial model idle');
  await check('initial redirect and real WebGL renderer', 'location.pathname === "/anatomy" && !!v.renderer.getContext()');
  await screenshot('desktop-brain');
  const rect = await evaluate('(() => { const r=v.renderer.domElement.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()');
  const initialPosition = await evaluate('v.camera.position.toArray()');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + 70, y: rect.y + 20, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + 70, y: rect.y + 20, button: 'left', buttons: 0, clickCount: 1 });
  await until(() => evaluate('v.animationId===null'), 'orbit damping settles', 60000);
  await check('real pointer orbit resumes rendering and damping settles', `v.camera.position.toArray().some((n,i)=>Math.abs(n-${JSON.stringify(initialPosition)}[i])>.001)`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: rect.x, y: rect.y, deltaX: 0, deltaY: -100 });
  await until(() => evaluate('v.animationId===null'), 'wheel zoom settles');
  await check('real wheel zoom resumes the renderer', 'v.camera.position.distanceTo(v.controls.target)<4');
  await evaluate('v.resetCamera();true');
  await check('search filter', 'list.updateSearchTerm("  HEART  "); list.filteredOrgans().length === 1 && list.filteredOrgans()[0].id === "heart"');
  await evaluate('list.updateSearchTerm(""); true');
  const ids = await evaluate('list.organs.map(organ => organ.id)');
  for (const organId of ids) {
    await evaluate(`document.querySelectorAll('.organ-item')[${ids.indexOf(organId)}].click(); true`);
    await until(() => evaluate(`v.loadedOrgan?.id === ${JSON.stringify(organId)} && !v.isLoading() && !!v.model && v.animationId === null`), `${organId} load and idle`, 60000);
    await check(`load ${organId}`, '!v.loadError() && v.model.visible && v.renderer.info.render.triangles > 0');
  }
  await screenshot('desktop-teeth');
  await check('dental geometry resolves all 28 model teeth', `v.computeAllToothBounds(); v.toothBoundsMap.size === 28 && [1,16,17,32].every(id => !v.toothBoundsMap.has(id))`);
  await check('dental picking identifies a physical tooth', `(() => {
    const rect = v.canvasContainer.nativeElement.getBoundingClientRect();
    for (let y=.25; y<.8; y+=.04) for (let x=.2; x<.8; x+=.04) {
      const event = new PointerEvent('pointerup', { clientX: rect.left+rect.width*x, clientY: rect.top+rect.height*y, button:0 });
      const hit = v.pickSurface(event);
      if (!hit) continue;
      v.pointerDownCoord = {x:event.clientX,y:event.clientY,time:Date.now()};
      v.handlePointerUp(event);
      if (v.selectedTooth()) return true;
    }
    return false;
  })()`);
  await check('dental division colors and grid preference persist', `(() => {
    v.setDivisionMode(3); v.applyColor('#4A9CFF'); v.toggleGridLines();
    const state = JSON.parse(localStorage.getItem('anatomy_dental_tooth_states'))[v.selectedTooth().number];
    return state.divisionMode === 3 && state.zones.middle === '#4A9CFF' && JSON.parse(localStorage.getItem('anatomy_dental_show_grid_lines')) === v.showGridLines();
  })()`);
  await check('all four dental division modes produce finite vertex colors', `(() => {
    for(const mode of [1,2,3,4]) {
      v.setDivisionMode(mode);v.applyColor('#4A9CFF');
      let valid=true;v.model.traverse(mesh=>{if(mesh.isMesh&&mesh.geometry.attributes.color)valid=valid&&mesh.geometry.attributes.color.array.every(Number.isFinite);});
      if(!valid) return false;
    }
    v.setDivisionMode(3);return true;
  })()`);
  await screenshot('desktop-dental-panel');
  await check('camera nudge zoom reset and recenter', `(() => {
    v.closeToothPanel(); v.nudgeCamera('right'); const panned = v.controls.target.length()>0;
    v.recenterCamera(); const centered = v.controls.target.length()===0;
    v.nudgeCamera('zoomIn'); const zoomed=v.camera.position.length()<4;
    v.resetCamera(); return panned && centered && zoomed && Math.abs(v.camera.position.z-4)<.001 && Math.abs(v.camera.position.x)<.001 && Math.abs(v.camera.position.y)<.001;
  })()`);
  await evaluate('v.toggleAutoRotate(); true');
  await sleep(300);
  await check('auto-rotation resumes frames', 'v.controls.autoRotate && v.animationId !== null');
  await evaluate('v.toggleAutoRotate(); true');
  await until(() => evaluate('v.animationId === null'), 'rotation stops');
  await check('idle renderer does not draw additional frames', `(async () => { const frame=v.renderer.info.render.frame; await new Promise(r=>setTimeout(r,300)); return v.animationId===null && v.renderer.info.render.frame===frame; })()`);
  await check('custom hotspot placement and value persistence', `(() => {
    v.togglePlacementMode();
    const rect=v.canvasContainer.nativeElement.getBoundingClientRect();
    let found=false;
    for(let y=.3;y<.7&&!found;y+=.05) for(let x=.25;x<.75&&!found;x+=.05) {
      const event=new PointerEvent('pointerdown',{clientX:rect.left+rect.width*x,clientY:rect.top+rect.height*y,button:0});
      Object.defineProperty(event,'target',{value:v.renderer.domElement});
      v.handlePointerDown(event); found=!!v.pendingHotspot();
    }
    if(!found) return false;
    v.pendingName='Audit point'; v.confirmPlacement();
    const point=v.loadedOrgan.hotspots.find(h=>h.name==='Audit point');
    if(!point) return false;
    window.auditPointId=point.id; point.value=42; v.saveHotspotValue(point);
    return JSON.parse(localStorage.getItem('anatomy_custom_hotspots_teeth-obj')).find(h=>h.id===point.id).value===42;
  })()`);
  await check('screenshot capture persists and appears in info panel', `(async () => {
    v.captureScreenshot(); await new Promise(r=>setTimeout(r,100));
    window.auditShot=v.lastCapturedScreenshot();
    return !!auditShot && !v.storageError() && JSON.parse(localStorage.getItem('ORIGAN-INFO'))[0].id===auditShot.id && !!document.querySelector('.capture-card');
  })()`);
  await evaluate('v.downloadScreenshot(auditShot); true');
  await until(() => fs.readdirSync(artifacts).some(name => /\.(webp|png)$/.test(name) && name.startsWith('teeth-obj-capture-')), 'screenshot download file');
  results.push({ name: 'screenshot download file saved', status: 'PASS' });
  const persisted = await evaluate('({pointId:auditPointId,shotId:auditShot.id,tooth:v.selectedTooth()?.number,states:localStorage.getItem("anatomy_dental_tooth_states"),grid:localStorage.getItem("anatomy_dental_show_grid_lines")})');
  await send('Page.reload');
  await until(() => evaluate('!!window.ng && !!document.querySelector("app-organ-viewer canvas")'), 'viewer after reload');
  await evaluate('window.v=ng.getComponent(document.querySelector("app-organ-viewer"));window.p=ng.getComponent(document.querySelector("app-anatomy-page"));window.list=ng.getComponent(document.querySelector("app-organ-list"));true');
  await until(() => evaluate('!v.isLoading() && !!v.model && v.animationId===null'), 'initial model after reload');
  await evaluate(`document.querySelectorAll('.organ-item')[${ids.indexOf('teeth-obj')}].click();true`);
  await until(() => evaluate('v.loadedOrgan?.id==="teeth-obj" && !v.isLoading() && !!v.model && v.animationId===null'), 'persisted dental model');
  await evaluate(`window.auditPointId=${JSON.stringify(persisted.pointId)};window.auditShot=JSON.parse(localStorage.getItem('ORIGAN-INFO')).find(s=>s.id===${JSON.stringify(persisted.shotId)});true`);
  await check('screenshots, dental state, grid preference, and custom point values survive reload', `v.loadedOrgan.hotspots.find(h=>h.id===auditPointId)?.value===42 &&
    v.toothColors().size>0 && localStorage.getItem('anatomy_dental_tooth_states')===${JSON.stringify(persisted.states)} &&
    JSON.stringify(v.showGridLines())===${JSON.stringify(persisted.grid)} && !!auditShot && !!document.querySelector('.capture-card')`);
  await check('storage failure shows error without false saved feedback', `(() => {
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){throw new DOMException('Audit quota failure','QuotaExceededError')};
    try { v.captureScreenshot(); return !v.lastCapturedScreenshot() && v.storageError().includes('not saved'); }
    finally { Storage.prototype.setItem=original; }
  })()`);
  await check('custom point deletion and screenshot deletion persist', `(() => {
    v.deleteHotspot(auditPointId);
    const info=ng.getComponent(document.querySelector('app-organ-info'));
    info.deleteScreenshot(auditShot.id);
    return !v.loadedOrgan.hotspots.some(h=>h.id===auditPointId) && !JSON.parse(localStorage.getItem('anatomy_custom_hotspots_teeth-obj')).some(h=>h.id===auditPointId) && info.organScreenshots().length===0;
  })()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  await screenshot('mobile');
  const mobile = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,listVisible:getComputedStyle(document.querySelector('app-organ-list')).display!=='none',viewerWidth:document.querySelector('.viewer-content').clientWidth})`);
  results.push({ name: 'mobile layout observation', ...mobile });
  await check('mobile selector and all viewer actions are visible without horizontal overflow', `(() => {
    const select=document.querySelector('.mobile-organ-picker select');
    const rect=select.getBoundingClientRect();
    return rect.width>0 && document.documentElement.scrollWidth<=innerWidth &&
      [...document.querySelectorAll('.viewer-actions button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});
  })()`);
  await evaluate(`const select=document.querySelector('.mobile-organ-picker select');select.value='heart';select.dispatchEvent(new Event('change'));true`);
  await until(() => evaluate('v.loadedOrgan?.id === "heart" && !v.isLoading() && !!v.model && v.animationId === null'), 'mobile organ switching');
  await check('mobile organ selection updates the model', 'p.selectedOrgan().id === "heart" && !v.loadError()');
  await screenshot('mobile-heart');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  await screenshot('tablet');
  await check('responsive resize updates renderer size', 'v.viewWidth===document.querySelector(".viewer-content").clientWidth && v.camera.aspect===v.viewWidth/v.viewHeight');
  await evaluate(`p.selectOrgan(list.organs.find(o=>o.id==='brain'));true`);
  await sleep(50);
  await evaluate(`p.selectOrgan(list.organs.find(o=>o.id==='teeth-obj'));true`);
  await sleep(50);
  await evaluate(`p.selectOrgan(list.organs.find(o=>o.id==='heart'));true`);
  await until(() => evaluate('v.loadedOrgan?.id==="heart" && !v.isLoading() && !!v.model && v.animationId===null'), 'rapid model replacement');
  await check('rapid model replacement keeps the latest model active', 'v.loadedOrgan.id==="heart" && !v.loadError()');
  await check('destruction cancels renderer work and releases model', `(() => {
    window.destroyedViewer=v; ng.getComponent(document.querySelector('app-root'));
    v.ngOnDestroy(); return v.animationId===null && !v.model && !document.querySelector('app-organ-viewer canvas');
  })()`);
  assert.deepEqual(failures, [], 'Uncaught browser errors or failed asset requests');
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, failures }, null, 2));
  console.log(JSON.stringify({ artifacts, results, failures }, null, 2));
} catch (error) {
  console.error(error);
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, failures, error: String(error) }, null, 2));
  console.error(`Artifacts: ${artifacts}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  // Chrome may keep its profile locked briefly; retain the isolated temporary profile if so.
  await sleep(300);
  const resolved = path.resolve(profile);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('anatomy-browser-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch {}
  }
}

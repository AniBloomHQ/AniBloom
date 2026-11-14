#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createPreviewServer } from "./dev-server.js";
import { BASE_URL } from "../api/config.js";

// Browser evaluation is injected only into a local, temporary HTTP proxy.
// No testing script is added to the real homepage or production routes.
function browserAssertions() {
  return `<script>
const catalogRequests=[];
let scenario="success";
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,options)=>{
  const url=String(input);
  if(!url.includes("/api/catalog-preview"))return originalFetch(input,options);
  catalogRequests.push({url,signal:options?.signal});
  if(scenario==="pending")return new Promise((resolve,reject)=>options.signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}));
  if(scenario==="error")return new Response("Unavailable",{status:503});
  if(scenario==="limited")return new Response("Wait",{status:429,headers:{"Retry-After":"1"}});
  const metas=scenario==="empty"?[]:Array.from({length:15},(_,i)=>({id:"anilist:"+(i+1),name:i===0?"<img src=x onerror=alert(1)>":"Preview anime "+i,releaseInfo:"2026",poster:"javascript:alert(1)"}));
  return Response.json(scenario==="invalid"?{error:"Invalid"}:{metas});
};
window.addEventListener("load",async()=>{
  const errors=[], notes={};
  function check(value,message){if(!value)errors.push(message);}
  async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error("Timed out waiting for browser state");}
  try {
    const cards=Array.from(document.querySelectorAll("a.catalog-card"));
    check(cards.length===9,"Expected 9 homepage catalog cards");
    for(const card of cards){
      const icon=card.querySelector(".catalog-icon");
      const svg=icon?.querySelector("svg");
      const rect=svg?.getBoundingClientRect();
      check(!!svg && !!svg.querySelector("path,rect,circle,polygon,polyline"),"Card has no drawn icon: "+card.getAttribute("aria-label"));
      check(!!rect && rect.width>0 && rect.height>0,"Card SVG has no visible dimensions");
      check(!svg?.innerHTML.includes("undefined"),"Card contains undefined icon");
    }
    const top=cards.find(card=>card.getAttribute("href")?.includes("/top_season.json"));
    check(!!top,"Missing Top Anime card");
    check(top?.querySelector('.catalog-icon[data-icon="trophy"]') !== null,"Top Anime trophy missing");
    const picker=document.getElementById("title-preference");
    const manual=document.querySelector(".manual-install a");
    check(!!picker && !!manual,"Missing install controls");
    for(const [language,prefix] of [["english",""],["romaji","/romaji"],["native","/native"]]){
      if(!picker)break;
      picker.value=language;
      picker.dispatchEvent(new Event("change",{bubbles:true}));
      const expected=${JSON.stringify(BASE_URL)}+prefix+"/manifest.json";
      check(manual?.href===expected,"Manual install URL incorrect for "+language);
      if(expected.startsWith("https://")){
        const deep=expected.replace("https://","nuvio://");
        check([...document.querySelectorAll('a[href^="nuvio://"]')].some(a=>a.href===deep),"Deep install URL incorrect for "+language);
      }
    }
    const grid=document.querySelector(".catalog-grid");
    const columns=getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).filter(Boolean);
    const mobile=window.innerWidth<=700;
    check(mobile ? columns.length===1 : columns.length>=2,"Unexpected responsive column count");
    notes.viewport=window.innerWidth;notes.mobile=mobile;notes.columns=columns.length;notes.cards=cards.length;
    check(catalogRequests.length===0,"Homepage must not prefetch catalogs");
    const platforms=[...document.querySelectorAll('[name="install-platform"]')];
    for(const radio of platforms){
      radio.click();
      check([...document.querySelectorAll("[data-platform-panel]")].every(panel=>panel.hidden===(panel.dataset.platformPanel!==radio.value)),"Platform guide did not switch: "+radio.value);
    }
    let copied="";
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{copied=value;}}});
    document.getElementById("copy-manifest").click();
    await until(()=>!!document.getElementById("copy-status").textContent);
    check(copied===manual.href,"Copy must use selected manifest URL");
    document.getElementById("show-qr").click();
    await until(()=>!!document.querySelector("#qr-image svg"));
    const nativeQr=document.querySelector("#qr-image path").getAttribute("d");
    picker.value="romaji";picker.dispatchEvent(new Event("change"));
    await until(()=>!!document.querySelector("#qr-image svg"));
    check(document.querySelector("#qr-image path").getAttribute("d")!==nativeQr,"QR must change with title preference");
    check(document.getElementById("qr-image").getAttribute("aria-label").includes("/romaji/manifest.json"),"QR accessibility label must follow the manifest");
    check([...document.querySelectorAll("[data-install-link]")].every(link=>link.href===manual.href.replace("https://","nuvio://")),"All app links must follow title preference");
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("Clipboard denied");}}});
    document.getElementById("copy-manifest").click();
    await until(()=>document.getElementById("copy-status").textContent.includes("unavailable"));
    check(window.getSelection().toString()===manual.textContent,"Denied clipboard should select the manual URL");
    const dialog=document.getElementById("catalog-preview");
    const status=document.getElementById("preview-status");
    const retry=document.getElementById("preview-retry");
    const items=()=>document.querySelectorAll("#preview-titles>li");
    const close=async()=>{dialog.querySelector(".preview-close").click();await new Promise(resolve=>setTimeout(resolve,0));};
    picker.value="english";picker.dispatchEvent(new Event("change"));
    cards[0].click();
    await until(()=>items().length>0);
    check(dialog.open&&items().length===12,"Preview must show at most 12 titles in a modal");
    check(!document.querySelector("#preview-titles img"),"Unsafe poster URLs must not render");
    check(items()[0].textContent.includes("<img src=x"),"Upstream title must render as text");
    check(catalogRequests.length===1,"Opening a catalog must fetch only its first page");
    await close();
    check(document.activeElement===cards[0],"Closing a preview must restore focus");
    cards[0].click();await until(()=>items().length>0);
    check(catalogRequests.length===1,"Reopening a fresh preview must reuse its response");
    await close();
    picker.value="native";picker.dispatchEvent(new Event("change"));
    cards[0].click();await until(()=>items().length>0);
    check(new URL(catalogRequests.at(-1).url,location.href).searchParams.get("titleMode")==="native","Preview must request the selected title language");
    await close();
    scenario="empty";cards[1].click();await until(()=>status.textContent.startsWith("No titles"));
    check(items().length===0,"Empty catalog must clear old titles");await close();
    scenario="error";cards[2].click();await until(()=>!retry.hidden);
    check(status.textContent.includes("temporarily unavailable"),"Failed catalog must show a recoverable error");
    scenario="success";retry.click();await until(()=>items().length>0);await close();
    scenario="invalid";cards[3].click();await until(()=>!retry.hidden);await close();
    scenario="limited";cards[4].click();await until(()=>!retry.hidden);
    check(retry.disabled,"Retry-After must prevent immediate retry");
    await until(()=>!retry.disabled);await close();
    scenario="pending";cards[5].click();await close();
    check(catalogRequests.at(-1).signal.aborted,"Closing must cancel an unfinished request");
    check(document.documentElement.scrollWidth<=window.innerWidth,"Homepage must not overflow horizontally");
    notes.interactions="copy,QR,platforms,preview,language,cache,empty,error,retry,cancel";
  } catch(error) { errors.push("Browser evaluation failed: "+String(error?.message||error)); }
  const output=document.createElement("output");
  output.id="browser-smoke-result";
  output.setAttribute("data-report",btoa(JSON.stringify({ok:errors.length===0,errors,notes})));
  document.body.appendChild(output);
});</script>`;
}

function findChrome() {
  const binaries=[process.env.CHROME_BIN,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
    "/usr/bin/chromium","/usr/bin/chromium-browser","/opt/google/chrome/chrome"].filter(Boolean);
  const binary=binaries.find(candidate=>existsSync(candidate));
  if(!binary)throw new Error("No local Chrome/Chromium executable; install a runner browser before running the smoke test");
  return binary;
}

async function runChrome(binary, url, size) {
  const args=["--headless=new","--no-sandbox","--disable-gpu","--disable-background-networking",
    "--no-first-run","--no-default-browser-check","--hide-scrollbars",
    "--virtual-time-budget=10000",`--window-size=${size}`,"--dump-dom",url];
  const child=spawn(binary,args,{stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="";
  child.stdout.on("data",chunk=>{stdout+=chunk.toString();});
  child.stderr.on("data",chunk=>{stderr+=chunk.toString().slice(0,2000);});
  const status=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("Chrome smoke timeout"));},35000);
    child.on("error",err=>{clearTimeout(timer);reject(err);});
    child.on("close",code=>{clearTimeout(timer);resolve(code);});
  });
  if(status!==0)throw new Error("Chrome exited with code "+status+": "+stderr.slice(-800));
  const match=stdout.match(/id="browser-smoke-result"[^>]*data-report="([^"]+)"/)
    || stdout.match(/data-report="([^"]+)"[^>]*id="browser-smoke-result"/);
  if(!match)throw new Error("Browser verification script did not execute");
  const report=JSON.parse(Buffer.from(match[1],"base64").toString("utf8"));
  if(!report.ok)throw new Error("Browser "+size+" failed: "+report.errors.join("; "));
  return report.notes;
}

export async function runHomepageBrowserSmoke() {
  const binary=findChrome();
  const app=createPreviewServer();
  await new Promise(resolve=>app.listen(0,"127.0.0.1",resolve));
  const appOrigin="http://127.0.0.1:"+app.address().port;
  const proxy=createServer(async(req,res)=>{
    try {
      const pathname=new URL(req.url,"http://localhost").pathname;
      const upstream=await fetch(appOrigin+(pathname==="/__browser_smoke__"?"/":req.url));
      let body=Buffer.from(await upstream.arrayBuffer());
      if(pathname==="/__browser_smoke__"){
        const html=body.toString("utf8");
        if(!html.includes("</body>"))throw new Error("Homepage body marker missing");
        body=Buffer.from(html.replace("</body>",browserAssertions()+"</body>"));
      }
      res.writeHead(upstream.status,{"content-type":upstream.headers.get("content-type")||"application/octet-stream",
        "cache-control":"no-store"});
      res.end(body);
    } catch {res.writeHead(500).end("Local browser smoke proxy failed");}
  });
  await new Promise(resolve=>proxy.listen(0,"127.0.0.1",resolve));
  const url="http://127.0.0.1:"+proxy.address().port+"/__browser_smoke__";
  try {
    const desktop=await runChrome(binary,url,"1280,900");
    const mobile=await runChrome(binary,url,"390,844");
    return {desktop,mobile};
  } finally {
    await new Promise(resolve=>proxy.close(resolve));
    await new Promise(resolve=>app.close(resolve));
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await runHomepageBrowserSmoke();
  console.log("Offline browser homepage smoke passed: "+JSON.stringify(report));
}

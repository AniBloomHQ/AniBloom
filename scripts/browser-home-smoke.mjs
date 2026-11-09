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
(function(){
  const errors=[], notes={};
  function check(value,message){if(!value)errors.push(message);}
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
  } catch(error) { errors.push("Browser evaluation failed: "+String(error?.message||error)); }
  const output=document.createElement("output");
  output.id="browser-smoke-result";
  output.setAttribute("data-report",btoa(JSON.stringify({ok:errors.length===0,errors,notes})));
  document.body.appendChild(output);
})();</script>`;
}

function findChrome() {
  const binaries=[process.env.CHROME_BIN,"/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
    "/usr/bin/chromium","/usr/bin/chromium-browser","/opt/google/chrome/chrome"].filter(Boolean);
  const binary=binaries.find(candidate=>existsSync(candidate));
  if(!binary)throw new Error("No local Chrome/Chromium executable; install a runner browser before running the smoke test");
  return binary;
}

async function runChrome(binary, url, size) {
  const args=["--headless=new","--no-sandbox","--disable-gpu","--disable-background-networking",
    "--no-first-run","--no-default-browser-check","--hide-scrollbars",
    "--virtual-time-budget=2000",`--window-size=${size}`,"--dump-dom",url];
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

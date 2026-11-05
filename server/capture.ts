// Browser research runs in the local service because Agent sandboxes may not launch Chrome.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Project } from '../shared/types.ts';
import { ValidationError } from './projects.ts';
const pending = new Map<string, Promise<unknown>>();
export function captureMaterials(project: Project): Promise<unknown> {
 const existing=pending.get(project.id); if(existing) return existing;
 const task=capture(project).finally(()=>pending.delete(project.id));
 pending.set(project.id,task); return task;
}
async function capture(project: Project) {
 if(!project.materials.urls.length) throw new ValidationError('Provide a product URL first. Screenshots only access URLs supplied for this project.');
 const dir=join(project.dir,'captures'); await mkdir(dir,{recursive:true});
 const config=await readFile(join(project.dir,'site/capture.config.json'),'utf8').then(s=>JSON.parse(s)).catch(()=>null);
 const browser=await chromium.launch({channel:'chrome'}).catch(()=>chromium.launch());
 const captures=[];
 try {
  for(const [index,url] of project.materials.urls.slice(0,3).entries()) {
   const page=await browser.newPage({viewport:{width:1280,height:1600},reducedMotion:'reduce'});
   try {
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    if(response && response.status()>=400) throw Error(`Product URL returned ${response.status()}`);
    await page.evaluate(()=>document.fonts.ready);
    if(await page.locator('vite-error-overlay').count()) throw Error('The product URL has a build error. Fix it first.');
    const brand=await page.evaluate(()=>{
     const body=getComputedStyle(document.body);
     const button=document.querySelector('button[type="submit"]') ?? document.querySelector('.btn-primary') ?? document.querySelector('button');
     return {title:document.title,colors:{background:body.backgroundColor,text:body.color,primaryButton:button?getComputedStyle(button).backgroundColor:null},fonts:{body:body.fontFamily},headings:Array.from(document.querySelectorAll('h1,h2')).map(x=>x.textContent)};
    });
    const focus:Record<string,{x:number;y:number;w:number;h:number}>={};
    const requested=config?.pages?.[index]?.focus ?? {};
    for(const [name,selector] of Object.entries(requested)) {
     if(typeof selector!=='string') continue;
     const rect=await page.locator(selector).first().boundingBox().catch(()=>null);
     if(rect) focus[name]={x:rect.x,y:rect.y,w:rect.width,h:rect.height};
    }
    const image=join(dir,`product-${index+1}.png`);
    await page.screenshot({path:image,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    const phone=join(dir,`product-${index+1}-phone.png`);
    await page.screenshot({path:phone,animations:'disabled'});
    captures.push({url,image,phone,brand,width:1280,height:1600,focus});
   } finally{await page.close();}
  }
  await writeFile(join(dir,'brand.json'),JSON.stringify(captures,null,2));
  return {directory:dir,captures};
 } finally{await browser.close();}
}

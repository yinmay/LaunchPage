// Optional live acceptance: uses the user's installed Codex and logged-in account.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const base='http://127.0.0.1:4710';
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const json=async path=>(await page.request.get(base+path)).json();
const send=async(text)=>{await page.getByLabel('Message your agent').fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();};
let id;
try {
 await page.goto(base);
 await page.getByLabel('Product name',{exact:true}).fill('launchPage 真实验收');
 await page.locator('.agent-card').filter({has:page.locator('input[value="codex"]')}).click();
 await page.getByLabel('产品网址',{exact:true}).fill(base);
 await page.getByLabel('Additional notes (optional)').fill('这是一次真实验收，为 launchPage 自身生成中文 Landing Page。产品是本地 Agent 工作台：选 Claude Code/Codex，输入资料，生成页面，实时预览，框选后附建议修改。面向独立开发者。产品当前只有首页和工作台，没有其他页面，不编造销量或客户数字。先读指定 skill，真实截图可以来自给定网址的首页。请起草简短 brief 等确认。');
 await page.getByRole('button',{name:'Start generating',exact:true}).click();
 await page.waitForURL(/#\/p\//);
 id=page.url().split('/p/')[1];
 console.log(JSON.stringify({stage:'created',id,url:page.url()}));
 const waitIdle=async(timeout)=>{
  const end=Date.now()+timeout;
  while(Date.now()<end){const s=await json(`/api/projects/${id}`);if(!s.running)return s;await pause(2500);}
  throw Error('Agent did not finish before deadline');
 };
 let s=await waitIdle(240000);
 console.log(JSON.stringify({stage:'brief',items:s.items.filter(x=>x.kind==='assistant'||x.level==='error').map(x=>x.text)}));
 if(s.items.some(x=>x.level==='error')) throw Error('Agent failed during research');
 await send('确认这份 brief。请继续实现并完成验证。只使用能从真实首页获取的产品截图；不足的场景合并，不能虚构产品界面。采用产品原有紫色品牌。请遵守 skill 的静态降级要求。生成文件放 ./site，pnpm install 完成后由 launchPage 自动启动预览，依赖安装失败请具体说明。');
 s=await waitIdle(600000);
 console.log(JSON.stringify({stage:'generated',preview:s.preview,items:s.items.filter(x=>x.kind==='assistant'||x.level==='error').map(x=>x.text).slice(-3)}));
 const frame=page.frameLocator('iframe');
 await frame.locator('h1').waitFor({timeout:120000});
 const before=await frame.locator('h1').innerText();
 await page.getByRole('button',{name:'⌖ Select',exact:true}).click();
 await frame.locator('h1').click();
 await page.getByRole('list',{name:'Selected elements'}).waitFor();
 await send('请只把框选的主标题改为「让好产品，更快被看见」，保留其他内容和样式。改完直接结束，不需要提问。');
 s=await waitIdle(240000);
 await frame.locator('h1').filter({hasText:'让好产品，更快被看见'}).waitFor({timeout:30000});
 mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/live-codex-workspace.png',fullPage:true});
 const result={passed:true,id,url:page.url(),before,after:await frame.locator('h1').innerText(),preview:s.preview};
 writeFileSync('artifacts/live-codex-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} catch(error) {
 mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/live-codex-error.png',fullPage:true});
 console.error(JSON.stringify({passed:false,id,error:String(error)}));process.exitCode=1;
} finally{await browser.close();}

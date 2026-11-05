#!/usr/bin/env node
// Protocol fixture: real files + real Vite/HMR, deterministic model responses.
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const codex = process.env.E2E_AGENT_KIND === 'codex';
if (args.includes('--version')) { console.log('0.0.0 (e2e fixture)'); process.exit(0); }
const session = `fixture-${codex ? 'codex' : 'claude'}`;
const out = (x) => console.log(JSON.stringify(x));
let n = 0;
const say = (text) => codex
 ? out({type:'item.completed',item:{id:`item_${n++}`,type:'agent_message',text}})
 : out({type:'assistant',message:{id:`msg_${n++}`,content:[{type:'text',text}]}});
let prompt='';
for await (const c of process.stdin) prompt += c;
if (codex) out({type:'thread.started',thread_id:session});
else out({type:'system',session_id:session});
const resumed = args.includes('--resume') || args.includes('resume');
if (!resumed) {
 writeFileSync('BRIEF.md','# 验收示例\n承诺：把产品资料变成官网。场景：提供资料、生成、框选修改。');
 say('BRIEF 草稿已准备好：把产品资料变成官网。请确认方案，我再继续生成。');
} else if (prompt.includes('测试停止')) {
 say('正在运行可停止的测试任务');
 await new Promise(() => setInterval(()=>{},1000));
} else {
 const site=join(process.cwd(),'site');
 const source=join(site,'src/main.js');
 const want=prompt.match(/我的修改意见：\n([\s\S]*?)\n\n请在/)?.[1]?.trim();
 mkdirSync(join(site,'src'),{recursive:true});
 if (!existsSync(join(site,'node_modules'))) symlinkSync(resolve(dirname(fileURLToPath(import.meta.url)),'../../node_modules'),join(site,'node_modules'),'dir');
 writeFileSync(join(site,'package.json'),JSON.stringify({name:'e2e-landing',type:'module',devDependencies:{vite:'*'}}));
 writeFileSync(join(site,'index.html'),'<html lang="zh"><head><title>测试产品</title></head><body><script type="module" src="/src/main.js"></script></body></html>');
 const title=want || '把产品资料变成官网';
 writeFileSync(source,`document.body.innerHTML = ${JSON.stringify(`<main style="font-family:system-ui;padding:48px;background:#f4f0e6;min-height:1400px"><nav>测试产品</nav><section id="hero"><h1 style="font-size:48px">${title}</h1><p>从资料到首发，只需要一个工作台。</p><a href="#details">了解更多</a></section><section id="details" style="margin-top:650px"><h2>真实预览，持续修改</h2></section></main>`)}; if(import.meta.hot) import.meta.hot.accept();`);
 say(want ? `已根据框选修改：${want}` : '页面已生成，右侧自动打开预览。');
}
if(codex) out({type:'turn.completed',usage:{}});
else out({type:'result',session_id:session,is_error:false,result:'ok'});

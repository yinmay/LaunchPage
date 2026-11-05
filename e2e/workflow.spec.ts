import { test, expect } from '@playwright/test';
for (const agent of ['claude','codex']) {
 test(`${agent}: 资料 → brief → 生成 → 框选修改 → 热更新 → 恢复`, async ({ page, request }) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Product name',{exact:true}).fill(`验收 ${agent}`);
  await page.locator(".agent-card").filter({has:page.locator(`input[value="${agent}"]`)}).click();
  await page.getByLabel('Additional notes (optional)').fill('团队协作工具，提供实时预览与框选修改。');
  await page.getByRole('button',{name:'Start generating',exact:true}).click();
  await expect(page.getByText('BRIEF 草稿已准备好', {exact:false})).toBeVisible();
  await page.getByLabel('Message your agent').fill('确认方案，请生成页面');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const frame=page.frameLocator('iframe');
  await expect(frame.locator('h1')).toHaveText('把产品资料变成官网',{timeout:30000});
  await page.getByRole('button',{name:'⌖ Select',exact:true}).click();
  await frame.locator('h1').click();
  await expect(page.getByRole('list',{name:'Selected elements'})).toContainText('把产品资料变成官网');
  await page.getByLabel('Message your agent').fill('让每一次产品发布都更从容');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(frame.locator('h1')).toHaveText('让每一次产品发布都更从容');
  await expect(page.getByRole('list',{name:'Selected elements'})).toHaveCount(0);
  // Drag selection and context roundtrip.
  const heading=await frame.locator('h1').boundingBox();
  if(!heading) throw Error('heading missing');
  await page.mouse.move(heading.x+4, heading.y+4);
  await page.mouse.down(); await page.mouse.move(heading.x+180,heading.y+36,{steps:8}); await page.mouse.up();
  await expect(page.getByRole('list',{name:'Selected elements'})).toBeVisible();
  await page.getByLabel('Message your agent').fill('让好产品被看见');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(frame.locator('h1')).toHaveText('让好产品被看见');
  await page.getByRole('button',{name:'Mobile',exact:true}).click();
  await expect(page.locator('iframe')).toHaveJSProperty('clientWidth',390);
  await page.getByRole('button',{name:'Desktop',exact:true}).click();
  await page.reload();
  await expect(frame.locator('h1')).toHaveText('让好产品被看见');
  await expect(page.locator('.msg-user')).toHaveCount(4);
  const projectId=page.url().split('/p/')[1];
  const snapshot=await (await request.get(`/api/projects/${projectId}`)).json();
  expect(snapshot.items.find((x:any)=>x.kind==='user' && x.picks)?.picks[0]).toMatchObject({tag:'h1'});
  await page.getByLabel('Message your agent').fill('测试停止');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await expect(page.getByText('Turn stopped.',{exact:true})).toBeVisible();
  await page.screenshot({path:`artifacts/${agent}-workspace.png`,fullPage:true});
  expect(errors).toEqual([]);
 });
}
test('资料校验与接口边界',async({request})=>{
 const res=await request.post('/api/projects',{data:{name:'无资料',agent:'claude',materials:{repoPaths:[],urls:[],notes:''}}});
 expect(res.status()).toBe(400);
 const badOrigin=await request.post('/api/projects',{headers:{Origin:'https://example.com'},data:{}});
 expect(badOrigin.status()).toBe(403);
});

test('由本地服务采集真实产品截图',async({request})=>{
 const created=await request.post('/api/projects',{data:{name:'截图验收',agent:'codex',materials:{repoPaths:[],urls:['http://127.0.0.1:4790/'],notes:''}}});
 expect(created.status()).toBe(201);
 const p=await created.json();
 const res=await request.post(`/api/projects/${p.id}/capture`,{data:{}});
 expect(res.status()).toBe(200);
 const result=await res.json();
 expect(result.captures[0]).toMatchObject({url:'http://127.0.0.1:4790/',width:1280,height:1600});
 expect(result.captures[0].brand.title).toContain('launchPage');
});

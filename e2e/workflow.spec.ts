import { test, expect } from '@playwright/test';
for (const agent of ['claude','codex']) {
 test(`${agent}: 资料 → brief → 生成 → 框选修改 → 热更新 → 恢复`, async ({ page, request }) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('产品名',{exact:true}).fill(`验收 ${agent}`);
  await page.locator(".agent-card").filter({has:page.locator(`input[value="${agent}"]`)}).click();
  await page.getByLabel('补充说明（可选）').fill('团队协作工具，提供实时预览与框选修改。');
  await page.getByRole('button',{name:'开始生成',exact:true}).click();
  await expect(page.getByText('BRIEF 草稿已准备好', {exact:false})).toBeVisible();
  await page.getByLabel('给 Agent 的消息').fill('确认方案，请生成页面');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  const frame=page.frameLocator('iframe');
  await expect(frame.locator('h1')).toHaveText('把产品资料变成官网',{timeout:30000});
  await page.getByRole('button',{name:'⌖ 框选',exact:true}).click();
  await frame.locator('h1').click();
  await expect(page.getByRole('list',{name:'已框选的元素'})).toContainText('把产品资料变成官网');
  await page.getByLabel('给 Agent 的消息').fill('让每一次产品发布都更从容');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(frame.locator('h1')).toHaveText('让每一次产品发布都更从容');
  await expect(page.getByRole('list',{name:'已框选的元素'})).toHaveCount(0);
  // Drag selection and context roundtrip.
  const heading=await frame.locator('h1').boundingBox();
  if(!heading) throw Error('heading missing');
  await page.mouse.move(heading.x+4, heading.y+4);
  await page.mouse.down(); await page.mouse.move(heading.x+180,heading.y+36,{steps:8}); await page.mouse.up();
  await expect(page.getByRole('list',{name:'已框选的元素'})).toBeVisible();
  await page.getByLabel('给 Agent 的消息').fill('让好产品被看见');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(frame.locator('h1')).toHaveText('让好产品被看见');
  await page.getByRole('button',{name:'手机',exact:true}).click();
  await expect(page.locator('iframe')).toHaveJSProperty('clientWidth',390);
  await page.getByRole('button',{name:'桌面',exact:true}).click();
  await page.reload();
  await expect(frame.locator('h1')).toHaveText('让好产品被看见');
  await expect(page.locator('.msg-user')).toHaveCount(4);
  const projectId=page.url().split('/p/')[1];
  const snapshot=await (await request.get(`/api/projects/${projectId}`)).json();
  expect(snapshot.items.find((x:any)=>x.kind==='user' && x.picks)?.picks[0]).toMatchObject({tag:'h1'});
  await page.getByLabel('给 Agent 的消息').fill('测试停止');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.getByRole('button',{name:'停止',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'停止',exact:true}).click();
  await expect(page.getByText('已停止本轮。',{exact:true})).toBeVisible();
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

import { test, expect } from '../fixtures.js';

test.describe('観点: TOODDAE 로컬 폴더 runtime', () => {
  test('パターン: brand/footer/status는 TOODDAE와 로컬 폴더만 표시한다', async ({ dayline, page }) => {
    await dayline.open();
    await expect(page.getByTestId('brand')).toHaveText(/TOODDAE/);
    await expect(page.getByTestId('brand-mark')).toHaveAttribute('data-logo','td-check-03');
    expect(await dayline.brandGeometry()).toEqual({viewBox:'0 0 512 512',fill:'currentColor',paths:['M86 105H291C364 105 422 157 422 231C422 275 404 309 354 345L326 317C357 295 372 266 372 231C372 181 340 146 291 146H86C58 146 58 105 86 105Z','M168 164H221V322H301L354 371L426 302L446 323L354 411L301 360H168Z']});
    await expect(dayline.brandIcon).toHaveAttribute('fill','currentColor');
    await expect(page).toHaveTitle('TOODDAE');
    await expect(page.getByTestId('open-obsidian')).toHaveCount(0);
    await expect(page.getByTestId('folder-button')).toBeVisible();
    await expect(page.getByTestId('footer')).toContainText(/TOODDAE.*HIGHSOUL.*v/);
    await page.getByTestId('sync-pill').click();
    await expect(page.getByTestId('status-dialog')).toBeVisible();
    await expect(page.getByTestId('status-dialog')).not.toContainText(/PID|npm run|uptime|가동 시간/i);
  });

  test('パターン: folder-unavailable 상태는 연결됨으로 표시하지 않고 inline Edit을 제공한다', async ({ dayline, page, vault }) => {
    await dayline.open();
    await page.route('**/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ready: false, rootId: vault.rootId, folderError: 'folder-unavailable', vault: { name: 'missing', readonly: false } }) }));
    await page.getByTestId('sync-pill').click();
    await expect(page.getByTestId('status-dialog')).toContainText(/열 수 없|unavailable|開けません|无法打开/);
    await expect(page.getByTestId('status-dialog')).not.toContainText(/연결됨|Connected|接続済み|已连接/);
    await expect(page.getByTestId('folder-edit')).toBeVisible();
  });
  test('パターン: drive folder 상태는 sync를 과장하지 않고 rename 안내를 보인다', async ({ dayline, page, vault }) => {await dayline.open();await page.route('**/api/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ready:true,rootId:vault.rootId,folderError:null,vault:{name:'Drive Notes',kind:'drive',readonly:false}})}));await page.getByTestId('sync-pill').click();await expect(page.getByTestId('status-dialog')).toContainText(/드라이브|Drive|ドライブ|驱动器/);await expect(page.getByTestId('folder-hint')).toContainText(/파일 관리자|file manager|ファイル管理|文件管理器/);expect(await dayline.fontSize('folder-hint')).toBeGreaterThanOrEqual(12);});
  test('パターン: header folder name은 현재 root header와 빈 body로 Finder reveal만 요청한다', async ({ dayline, page, vault }) => {
    await dayline.open();
    let called=false;
    await page.route('**/api/runtime/reveal', async route=>{called=true;expect(route.request().headers()['x-tooddae-root']).toBe(vault.rootId);expect(route.request().postDataJSON()).toEqual({});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rootId:vault.rootId})});});
    await page.getByTestId('folder-button').click();
    await expect.poll(()=>called).toBe(true);
  });

  test('パターン: quick draft가 있으면 folder connect를 막고 draft를 유지한다', async ({ dayline, page, alternateFolder, spawnServer }) => {
    const server = await spawnServer({});
    await dayline.open({ url: server.url });
    await dayline.quickInput.fill('switch 전에 남은 draft');
    await page.route('**/api/folder/choose', (route) => {
      expect(route.request().headers()['x-tooddae-root']).toBe(server.status.rootId);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ path: alternateFolder }) });
    });
    await page.getByTestId('sync-pill').click();
    await page.getByTestId('folder-edit').click();
    await expect(page.getByTestId('folder-path')).toHaveValue(alternateFolder);
    await page.getByTestId('folder-connect').click();
    await expect(page.getByTestId('status-dialog')).toContainText(/저장|닫은 뒤|unfinished/i);
    await expect(dayline.quickInput).toHaveValue('switch 전에 남은 draft');
  });

  test('パターン: 다른 tab의 folder switch는 이전 tab을 stale로 잠그고 Write draft를 보존한다', async ({ dayline, page, alternateFolder, spawnServer, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 409 \(Conflict\)/);
    const server = await spawnServer({});
    await dayline.open({ url: server.url });
    await page.getByTestId('nav-write').click();
    await page.getByTestId('write-edit').click();
    await page.getByTestId('write-editor').fill('old root draft');
    const other = await page.context().newPage();
    await other.goto(server.url);
    const response = await other.request.post(`${server.url}/api/folder/connect`, { headers: { origin: server.url, 'content-type': 'application/json', 'x-tooddae-root': server.status.rootId }, data: { path: alternateFolder } });
    expect(response.ok()).toBe(true);
    await expect(page.getByTestId('root-changed-dialog')).toBeVisible();
    await expect(page.getByTestId('write-editor')).toHaveText('old root draft');
    await expect(page.getByTestId('root-reload')).toBeVisible();
    await other.close();
  });
});

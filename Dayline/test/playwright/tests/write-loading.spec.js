import { test, expect } from '../fixtures.js';
import { WriteLoadingPage } from '../page-objects/write-loading.page.js';

test.describe('観点: Write の初期表示', () => {
  test('パターン: settings 대기 중에는 localized loading만 보이고 준비된 note에서 편집·단축키 저장이 이어진다', async ({ page, vault }) => {
    vault.write(`Write/${vault.today}.md`, '# 준비된 노트\n\n기다린 뒤에 보여요.');
    const write = new WriteLoadingPage(page, vault);
    const held = await write.holdSettings();

    await write.openInKorean();
    await held.started;
    await expect(write.routeState).toHaveText('불러오는 중…');
    await expect(write.noteRail).toBeHidden();
    await expect(write.editAction).toBeHidden();
    await expect(write.saveAction).toBeHidden();
    await expect(write.organizeAction).toBeHidden();
    await write.captureLoadingEvidence();

    held.release();
    await expect(write.routeState).toHaveCount(0);
    await expect(write.preview).toContainText('기다린 뒤에 보여요.');
    await write.openWriteEdit();
    await expect(write.titleInput).toHaveValue('준비된 노트');
    await expect(write.editor).toHaveText('기다린 뒤에 보여요.');
    await write.editor.fill('저장된 본문');
    await page.keyboard.press('ControlOrMeta+S');
    await expect(write.preview).toContainText('저장된 본문');
    await expect.poll(() => write.noteFile(vault.today)).toBe('# 준비된 노트\n\n저장된 본문');
  });

  test('パターン: initial note 대기 중에는 채워진 rail과 빈 sheet를 노출하지 않고 응답 뒤 함께 표시한다', async ({ page, vault }) => {
    vault.write(`Write/${vault.today}.md`, '# 늦은 노트\n\nnote 응답 뒤에 보여요.');
    const write = new WriteLoadingPage(page, vault);
    const held = await write.holdInitialNote();

    await write.openInKorean();
    await held.started;
    await expect(write.routeState).toHaveText('불러오는 중…');
    await expect(write.noteRail).toBeHidden();
    await expect(write.editAction).toBeHidden();

    held.release();
    await expect(write.routeState).toHaveCount(0);
    await expect(write.noteRail).toBeVisible();
    await expect(write.preview).toContainText('note 응답 뒤에 보여요.');
  });

  test('パターン: initial note 실패는 localized error와 Retry를 표시하고 listener 중복 없이 복구한다', async ({ page, vault, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);
    vault.write(`Write/${vault.today}.md`, '# Retry 노트\n\n다시 불러왔어요.');
    const write = new WriteLoadingPage(page, vault);
    await write.trackPointerListeners();
    await write.failNextWriteNoteRequest();

    await write.openInKorean();
    await expect(write.routeState).toHaveAttribute('role', 'alert');
    await expect(write.routeState).toContainText('페이지를 불러오지 못했어요.');
    await expect(write.routeRetry).toHaveText('다시 시도');
    const listenersBefore = await write.pointerListenerCount(); // アクセントカーソルが document に 1 つ持つ分を除くため、再試行前を基準にする
    await write.routeRetry.click();

    await expect(write.routeState).toHaveCount(0);
    await expect(write.preview).toContainText('다시 불러왔어요.');
    expect(listenersBefore).toBeGreaterThanOrEqual(1);
    expect(await write.pointerListenerCount()).toBe(listenersBefore); // 再試行で増えない = 重複しない
  });
});

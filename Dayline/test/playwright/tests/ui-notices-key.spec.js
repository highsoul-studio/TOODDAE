import { test, expect } from '../fixtures.js';
import { PagesPage } from '../page-objects/pages.page.js';

test.describe('観点: UI labels, visible placement notices, and saved-key presence', () => {
  test('パターン: 추가 toast는 실제 표시 위치를 말하고 편집은 이동 여부와 무관하게 저장을 말한다', async ({ page, vault, dayline }) => {
    const pages = new PagesPage(page, vault);
    await dayline.open({ lang: 'ko' });

    await dayline.quickInput.fill('default today');
    await dayline.quickInput.press('Enter');
    await expect(pages.latestToast()).toHaveText('오늘에 추가했어요');
    await expect(pages.taskIn('panel-tasks', 'default today')).toBeVisible();

    await dayline.quickInput.fill(`future scheduled ⏳ ${vault.day(2)}`);
    await dayline.quickInput.press('Enter');
    await expect(pages.latestToast()).toHaveText('예정에 추가했어요');
    await expect(pages.taskIn('upcoming', 'future scheduled')).toBeVisible();

    await dayline.quickInput.fill(`future due only 📅 ${vault.day(3)}`);
    await dayline.quickInput.press('Enter');
    await expect(pages.latestToast()).toHaveText('예정에 추가했어요');
    await expect(pages.taskIn('upcoming', 'future due only')).toBeVisible();

    await dayline.quickInput.fill(`today due only 📅 ${vault.today}`);
    await dayline.quickInput.press('Enter');
    await expect(pages.latestToast()).toHaveText('오늘에 추가했어요');
    await expect(pages.taskIn('panel-tasks', 'today due only')).toBeVisible();

    await dayline.quickInput.fill(`past start future due 🛫 ${vault.day(-1)} 📅 ${vault.day(4)}`);
    await dayline.quickInput.press('Enter');
    await expect(pages.latestToast()).toHaveText('오늘에 추가했어요');
    await expect(pages.taskIn('panel-tasks', 'past start future due')).toBeVisible();

    await dayline.openAddDialog();
    await dayline.textField.fill('manual future details');
    await dayline.setDate('start', vault.day(5));
    await dayline.setDate('due', vault.day(6));
    await dayline.pickOption('prio', 'high');
    await dayline.memoField.fill('manual memo\nsecond line');
    await dayline.saveDialog();
    await expect(pages.latestToast()).toHaveText('예정에 추가했어요');
    await expect(pages.taskIn('upcoming', 'manual future details')).toBeVisible();

    await dayline.openAddDialog();
    await dayline.textField.fill('new undated');
    await dayline.clearDate('start');
    await dayline.clearDate('due');
    await dayline.saveDialog();
    await expect(pages.latestToast()).toHaveText('인박스에 추가했어요');
    await expect(pages.taskIn('inbox', 'new undated')).toBeVisible();

    await dayline.openEditDialog('折り返さない短いタイトル', 'tasks');
    await dayline.clearDate('start');
    await dayline.saveDialog();
    await expect(pages.latestToast()).toHaveText('저장했어요');
    await expect(pages.taskIn('inbox', '折り返さない短いタイトル')).toBeVisible();

    expect(vault.note()).toContain(`default today ⏳ ${vault.today} 📅 ${vault.today}`);
    expect(vault.note()).toContain(`today due only 📅 ${vault.today}`);
    expect(vault.note()).toContain(`past start future due 🛫 ${vault.day(-1)} 📅 ${vault.day(4)}`);
    expect(vault.inbox()).toContain(`future scheduled ⏳ ${vault.day(2)}`);
    expect(vault.inbox()).toContain(`future due only 📅 ${vault.day(3)}`);
    expect(vault.inbox()).toContain(`manual future details ⏫ ⏳ ${vault.day(5)} 📅 ${vault.day(6)}\n  manual memo\n  second line`);
    expect(vault.inbox()).toContain('new undated');
  });

  test('パターン: palette labels와 Write icon labels는 mounted 상태에서 4개 언어로 갱신되고 SVG가 남는다', async ({ page, vault, dayline }) => {
    const pages = new PagesPage(page, vault);
    await dayline.open({ lang: 'ja' });
    await pages.open('write');

    await expect.poll(() => pages.actionLabel('write-edit')).toEqual({ aria: '編集', title: '', text: '' });
    expect(await pages.actionIcon('write-edit')).toBe('#i-pencil');
    expect(await pages.actionIcon('write-read')).toBe('#i-save');
    expect(await pages.actionIcon('write-delete')).toBe('#i-trash');

    await pages.selectLanguage('한국어');
    await expect.poll(() => pages.actionLabel('write-edit')).toEqual({ aria: '편집', title: '', text: '' });
    expect(await pages.actionIcon('write-edit')).toBe('#i-pencil');

    await pages.selectLanguage('English');
    await expect.poll(() => pages.actionLabel('write-read')).toEqual({ aria: 'Save', title: '', text: '' });
    expect(await pages.actionIcon('write-read')).toBe('#i-save');

    await pages.selectLanguage('中文');
    await expect.poll(() => pages.actionLabel('write-delete')).toEqual({ aria: '删除', title: '', text: '' });
    expect(await pages.actionIcon('write-delete')).toBe('#i-trash');

    await pages.open('set');
    expect(await pages.paletteLabels('light')).toEqual(['背景', '强调色']);
    expect(await pages.paletteLabels('dark')).toEqual(['背景', '强调色']);
  });

  test('パターン: provider별 hasKey만 placeholder에 반영하고 늦은 저장 응답은 새 draft를 지우지 않는다', async ({ page, vault, dayline }) => {
    const pages = new PagesPage(page, vault);
    const metadata = await pages.mockKeyMetadata({ anthropic: true, openai: false });
    await dayline.open({ lang: 'ko' });
    await pages.open('set');

    await expect(pages.keyField).toHaveValue('');
    await expect(pages.keyField).toHaveAttribute('placeholder', '키가 설정되어 있습니다. 변경하려면 새 키를 입력하세요.');
    await pages.selectProvider('OpenAI');
    await expect(pages.keyField).toHaveValue('');
    await expect(pages.keyField).toHaveAttribute('placeholder', 'API 키를 입력하세요.');

    const delayed = metadata.delayNext();
    await pages.keyField.fill('test-old-draft');
    await pages.keySave.click();
    await delayed.started;
    await pages.keyField.fill('test-newer-draft');
    delayed.release();
    await expect(pages.keyField).toHaveValue('test-newer-draft');
    await expect(pages.keyField).toHaveAttribute('placeholder', '키가 설정되어 있습니다. 변경하려면 새 키를 입력하세요.');

    await pages.keySave.click();
    await expect(pages.keyField).toHaveValue('');
    await expect(pages.keyField).toHaveAttribute('placeholder', '키가 설정되어 있습니다. 변경하려면 새 키를 입력하세요.');
    await pages.keySave.click();
    await expect(pages.keyField).toHaveValue('');
    await expect(pages.keyField).toHaveAttribute('placeholder', 'API 키를 입력하세요.');

    await pages.selectProvider('Anthropic (Claude)');
    await expect(pages.keyField).toHaveAttribute('placeholder', '키가 설정되어 있습니다. 변경하려면 새 키를 입력하세요.');
    await pages.selectLanguage('日本語');
    await expect(pages.keyField).toHaveAttribute('placeholder', 'キーは設定済みです。変更するには新しいキーを入力してください。');
    await pages.selectLanguage('English');
    await expect(pages.keyField).toHaveAttribute('placeholder', 'A key is set. Enter a new key to change it.');
    await pages.selectLanguage('中文');
    await expect(pages.keyField).toHaveAttribute('placeholder', '密钥已设置。如需更改，请输入新密钥。');
  });

  test('パターン: 같은 provider의 A key 응답이 늦어도 B clear 이후 saved presence와 status를 되돌리지 않는다', async ({ page, vault, dayline, allowedConsoleErrors }) => {
    allowedConsoleErrors.push(/Failed to load resource: the server responded with a status of 500/);
    const pages = new PagesPage(page, vault);
    const metadata = await pages.mockKeyMetadata({ anthropic: true, openai: false });
    await dayline.open({ lang: 'ko' });
    await pages.open('set');

    const staleSuccess = metadata.delayNext();
    await pages.keyField.fill('synthetic-a-success');
    const staleSuccessCompletion = pages.runKeySave();
    await staleSuccess.started;
    await pages.keyField.fill('');
    await pages.runKeySave();
    await expect(pages.keyField).toHaveAttribute('placeholder', 'API 키를 입력하세요.');
    staleSuccess.release();
    await staleSuccessCompletion;
    expect(metadata.hasKey('anthropic')).toBe(false);
    await expect(pages.settingsStatus).toHaveText('');
    await expect(pages.keyField).toHaveAttribute('placeholder', 'API 키를 입력하세요.');

    const staleFailure = metadata.delayNext({ fail: true });
    await pages.keyField.fill('synthetic-a-failure');
    const staleFailureCompletion = pages.runKeySave();
    await staleFailure.started;
    await pages.keyField.fill('');
    await pages.runKeySave();
    await expect(pages.keyField).toHaveAttribute('placeholder', 'API 키를 입력하세요.');
    staleFailure.release();
    await staleFailureCompletion;
    expect(metadata.hasKey('anthropic')).toBe(false);
    await expect(pages.settingsStatus).toHaveText('');
    await expect(pages.keyField).toHaveAttribute('placeholder', 'API 키를 입력하세요.');
  });
});

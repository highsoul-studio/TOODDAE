// スタイルガイド用: 自前の入力部品を実際に動かして見せる (アプリ本体と同じ ui.js を使う)。
import * as ui from '/ui.js';

const today = new Date().toISOString().slice(0, 10);
const mount = (id, c) => document.getElementById(id).append(c.el);
mount('demo-select', ui.select({ label: 'Priority', value: 'high', options: [{ value: '', label: 'なし' }, { value: 'highest', label: '最優先' }, { value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }] }));
mount('demo-date', ui.datePicker({ label: 'Start date', value: today, today }));
mount('demo-date2', ui.datePicker({ label: 'Due date', value: '', today }));
mount('demo-time', ui.timePicker({ label: 'Start time', value: '14:30' }));
document.getElementById('theme')?.addEventListener('click', () => window.dayTheme.toggle());
// 見本の行: チェックすると、アプリと同じ取り消し線の描画が見られる (DOM を作り直さないので CSS の transition だけで動く)
for (const c of document.querySelectorAll('.tasks .chk')) c.addEventListener('change', () => c.closest('.task').classList.toggle('is-done', c.checked));
mount('demo-days', ui.weekdayChips({ label: 'Days', value: [1, 3, 5] }));

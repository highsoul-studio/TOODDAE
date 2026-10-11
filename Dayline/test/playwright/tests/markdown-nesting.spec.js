import { test, expect } from '../fixtures.js';
import { MarkdownNestingPage } from '../page-objects/markdown-nesting.page.js';

test.describe('観点: Write の階層 Markdown list', () => {
  test('パターン: 3階層 task list는 안전하게 들여쓰기되고 Read/Edit 왕복에도 원문이 보존된다', async ({ page, vault }) => {
    const markdown=new MarkdownNestingPage(page,vault);
    const original=markdown.prepare('- [ ] parent\n  - [x] child\n    - [ ] grandchild\n      - <script>globalThis.__nestedPwned=true</script>\n      - [bad](javascript:globalThis.__nestedPwned=true)\n  - plain\0text');
    await markdown.open();

    const state=await markdown.nestedState();
    expect(state.labels).toEqual(['parent','child','grandchild']);
    expect(state.checked).toEqual([false,true,false]);
    expect(state.disabled).toEqual([true,true,true]);
    expect(state.left[1]-state.left[0]).toBeGreaterThanOrEqual(16);
    expect(state.left[2]-state.left[1]).toBeGreaterThanOrEqual(16);
    expect({scripts:state.scripts,unsafeLinks:state.unsafeLinks,executed:state.executed}).toEqual({scripts:0,unsafeLinks:0,executed:false});

    await markdown.roundTripReadMode();
    expect(markdown.source()).toBe(original);
  });
});

import { PagesPage } from './pages.page.js';

export class MarkdownNestingPage extends PagesPage {
  prepare(source) {
    this.vault.write(`Write/${this.vault.today}.md`,source);
    return source;
  }

  async roundTripReadMode() {
    await this.page.getByTestId('write-edit').click();
    await this.page.getByTestId('write-read').click();
  }

  source() { return this.noteFile(this.vault.today); }

  nestedState() {
    return this.preview.evaluate((preview) => {
      const root=preview.querySelector(':scope > .task-list'),parent=root?.querySelector(':scope > li'),childList=parent?.querySelector(':scope > .task-list'),child=childList?.querySelector(':scope > li'),grandList=child?.querySelector(':scope > .task-list'),grand=grandList?.querySelector(':scope > li');
      const label=item=>[...item.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.data).join('').trim();
      const input=item=>item?.querySelector(':scope > input');
      const boxes=[parent,child,grand].map(item=>input(item));
      return{
        labels:[parent,child,grand].map(label),
        checked:boxes.map(box=>box.checked),
        disabled:boxes.map(box=>box.disabled),
        left:boxes.map(box=>box.getBoundingClientRect().left),
        scripts:preview.querySelectorAll('script').length,
        unsafeLinks:preview.querySelectorAll('a[href^="javascript:"]').length,
        executed:globalThis.__nestedPwned===true,
      };
    });
  }
}

// Small, safe Markdown renderer for local notes. Raw HTML never executes.
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

function inline(source) {
  const held = [],hold=value=>`\u0000${held.push(value)-1}\u0000`;
  let text=String(source)
    .replace(/\\([\\`*_[\]~])/g,(_,value)=>hold(esc(value)))
    .replace(/`([^`\n]+)`/g,(_,value)=>hold(`<code>${esc(value)}</code>`))
    .replace(/(?<=[\p{L}\p{N}])_+(?=[\p{L}\p{N}])/gu,value=>hold(value));
  text=esc(text)
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g,(_,label,url)=>hold(/^(https?:\/\/|mailto:|obsidian:\/\/)/i.test(url)?`<a href="${url}" rel="noopener noreferrer">${label}</a>`:label))
    .replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g,'<strong>$1</strong>')
    .replace(/(?<![\p{L}\p{N}])__(\S(?:[\s\S]*?\S)?)__(?![\p{L}\p{N}])/gu,'<strong>$1</strong>')
    .replace(/(?<!~)~~(?!~)(\S(?:[\s\S]*?\S)?)(?<!~)~~(?!~)/g,'<del>$1</del>')
    .replace(/(?<!\*)\*(?!\*)(\S(?:[^*]*?\S)?)(?<!\*)\*(?!\*)/g,'<em>$1</em>')
    .replace(/(?<![\p{L}\p{N}])_(\S(?:[\s\S]*?\S)?)_(?![\p{L}\p{N}])/gu,'<em>$1</em>');
  return text.replace(/\u0000(\d+)\u0000/g,(_,index)=>held[index]??'');
}

function tableCells(line) {
  const cells = ['']; let code = false, escaped = false, pipes = 0;
  for (const char of String(line).trim()) {
    if (escaped) { cells[cells.length-1] += char === '|' ? '|' : `\\${char}`; escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '`') { code = !code; cells[cells.length-1] += char; continue; }
    if (char === '|' && !code) { cells.push(''); pipes++; continue; }
    cells[cells.length - 1] += char;
  }
  if (escaped) cells[cells.length - 1] += '\\';
  if (!pipes) return null;
  if (!cells[0].trim()) cells.shift();
  if (!cells.at(-1)?.trim()) cells.pop();
  return cells.length > 1 ? cells.map(cell => cell.trim()) : null;
}

const tableAlignment = cell => { const match=cell.match(/^(:)?-{3,}(:)?$/);return match?(match[1]&&match[2]?'center':match[2]?'right':'left'):null; };

function listItem(line) {
  const match=String(line).match(/^([ \t]*)(?:(\d+)[.)]|([-*+]))[ \t]+(.*)$/);
  if (!match) return null;
  let indent=0,content=match[4],checked=null;
  for(const char of match[1])indent=char==='\t'?indent+4-indent%4:indent+1;
  if(match[3]){const task=content.match(/^\[([ xX])\][ \t]+(.*)$/);if(task){checked=task[1].toLowerCase()==='x';content=task[2];}}
  return{indent,type:match[2]?'ol':'ul',task:checked!==null,checked,start:match[2]??'',content};
}

export function renderMarkdown(value = '') {
  const lines = String(value).replace(/\u0000/g, '').replace(/\r\n/g, '\n').split('\n');
  let out = '', fence = null;
  const lists=[];
  const closeList=()=>{const list=lists.pop();if(!list)return;if(list.item)out+='</li>';out+=`</${list.type}>`;};
  const closeLists=()=>{while(lists.length)closeList();};
  const openList=item=>{out+=item.type==='ol'&&item.start!=='1'?`<ol start="${item.start}">`:`<${item.type}${item.task?' class="task-list"':''}>`;lists.push({indent:item.indent,type:item.type,key:`${item.type}:${item.task}`,item:false});};
  for (let index=0;index<lines.length;index++) {
    const line=lines[index];
    if (/^```/.test(line)) {
      closeLists();
      if (fence) { out += `<pre><code>${esc(fence.join('\n'))}</code></pre>`; fence = null; }
      else fence = [];
      continue;
    }
    if (fence) { fence.push(line); continue; }
    const header=tableCells(line),separator=tableCells(lines[index+1]??''),align=separator?.map(tableAlignment);
    if(header&&separator&&header.length===separator.length&&align.every(Boolean)){
      closeLists();out+='<div class="markdown-table-wrap"><table><thead><tr>'+header.map((cell,i)=>`<th class="is-${align[i]}">${inline(cell)}</th>`).join('')+'</tr></thead><tbody>';index+=2;
      while(index<lines.length){const row=tableCells(lines[index]);if(!row||row.length!==header.length)break;out+='<tr>'+row.map((cell,i)=>`<td class="is-${align[i]}">${inline(cell)}</td>`).join('')+'</tr>';index++;}
      out+='</tbody></table></div>';index--;continue;
    }
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { closeLists();out+='<hr>';continue; }
    const item=listItem(line);
    if(item){
      while(lists.length&&item.indent<lists.at(-1).indent)closeList();
      let list=lists.at(-1),key=`${item.type}:${item.task}`;
      if(!list||item.indent>list.indent)openList(item);
      else if(list.key!==key){closeList();openList(item);}
      else if(list.item)out+='</li>';
      list=lists.at(-1);out+=`<li>${item.task?`<input type="checkbox" disabled${item.checked?' checked':''}>`:''}${inline(item.content)}`;list.item=true;
      continue;
    }
    closeLists();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) out += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    else if (/^>\s?/.test(line)){const quote=[line.replace(/^>\s?/,'')];while(/^>\s?/.test(lines[index+1]??''))quote.push(lines[++index].replace(/^>\s?/,''));out+=`<blockquote>${inline(quote.join('\n')).replace(/ {2}\n/g,'<br>')}</blockquote>`;}
    else if (line.trim()){const paragraph=[line],special=value=>!value.trim()||/^```|^(#{1,6})\s+|^>\s?|^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(value)||listItem(value)||(()=>{const head=tableCells(value),sep=tableCells(lines[index+2]??'');return head&&sep&&head.length===sep.length&&sep.map(tableAlignment).every(Boolean);})();while(index+1<lines.length&&!special(lines[index+1]))paragraph.push(lines[++index]);out+=`<p>${inline(paragraph.join('\n')).replace(/ {2}\n/g,'<br>')}</p>`;}
  }
  closeLists();
  if (fence) out += `<pre><code>${esc(fence.join('\n'))}</code></pre>`;
  return out;
}

export default renderMarkdown;

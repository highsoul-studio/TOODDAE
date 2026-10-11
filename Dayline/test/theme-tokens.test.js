import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../public/tokens.css',import.meta.url),'utf8');
test('theme interpolates explicit registered color properties only',()=>{const registered=new Set([...css.matchAll(/@property\s+(--[\w-]+)/g)].map(m=>m[1]));const palettes=fs.readFileSync(new URL('../public/palettes.css',import.meta.url),'utf8');for(const match of palettes.matchAll(/(--[\w-]+):\s*(?:#[\da-f]+|rgb\()/gi))assert.ok(registered.has(match[1]),match[1]);assert.doesNotMatch(css,/transition:\s*all\b/);for(const property of registered)assert.ok(css.includes(`${property} var(--theme-ms`),property);});

const fs = require('node:fs');
const path = require('node:path');

const target = path.join(process.cwd(), 'node_modules', 'is-generator-function', 'index.js');
if (!fs.existsSync(target)) {
  console.log('[postinstall] skip: is-generator-function not found');
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
if (source.includes('const __gf = require(\'generator-function\');\nvar getGeneratorFunction =')) {
  console.log('[postinstall] already patched');
  process.exit(0);
}

const from = "var getGeneratorFunction = require('generator-function');";
const to = "const __gf = require('generator-function');\nvar getGeneratorFunction = typeof __gf === 'function' ? __gf : (__gf && typeof __gf.default === 'function' ? __gf.default : function () { return null; });";

if (!source.includes(from)) {
  console.log('[postinstall] pattern not found, no changes made');
  process.exit(0);
}

let next = source.replace(from, to);
next = next.replace(
  "const __gf = require('generator-function');\\nvar getGeneratorFunction =",
  "const __gf = require('generator-function');\nvar getGeneratorFunction =",
);
fs.writeFileSync(target, next, 'utf8');
console.log('[postinstall] patched is-generator-function for CJS/ESM interop');

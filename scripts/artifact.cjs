// Assemble dist-artifact/ en une seule page HTML autonome (orbit-studio.html).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../dist-artifact/assets');
const files = fs.readdirSync(dir);
const css = fs.readFileSync(path.join(dir, files.find((f) => f.endsWith('.css'))), 'utf8');
const js = fs.readFileSync(path.join(dir, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<title>Orbit Studio</title>
<meta name="theme-color" content="#07060b">
<style>
:root{color-scheme:dark}
html,body{background:#07060b;color:#f3f0fa}
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
const out = path.join(__dirname, '../dist-artifact/orbit-studio.html');
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' Ko');

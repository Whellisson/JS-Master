const fs = require('fs');
const html = fs.readFileSync('./public/index.html', 'utf8');
const startIdx = html.indexOf('<script>') + 8;
const endIdx = html.indexOf('</script>', startIdx);
const js = html.substring(startIdx, endIdx);

// Write to temp file and use node's --check
fs.writeFileSync('./temp_check.js', js);

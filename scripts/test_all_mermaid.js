const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const content = fs.readFileSync('BLUEPRINT.md', 'utf-8');
const lines = content.split('\n');

const diagrams = [];
let inDiagram = false;
let currentDiagram = [];
let startLine = 0;

lines.forEach((line, idx) => {
  if (line.trim().startsWith('```mermaid')) {
    inDiagram = true;
    currentDiagram = [];
    startLine = idx + 1;
  } else if (inDiagram && line.trim() === '```') {
    inDiagram = false;
    diagrams.push({ startLine, endLine: idx + 1, code: currentDiagram.join('\n') });
  } else if (inDiagram) {
    currentDiagram.push(line);
  }
});

console.log(`Found ${diagrams.length} Mermaid diagrams in BLUEPRINT.md`);

// Build an HTML test harness
let testHtml = `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
</head>
<body>
`;

diagrams.forEach((d, idx) => {
  testHtml += `<h3>Diagram ${idx + 1} (lines ${d.startLine}-${d.endLine})</h3>\n`;
  testHtml += `<div id="diag-${idx + 1}" class="mermaid">\n${d.code}\n</div>\n`;
});

testHtml += `
<script>
  mermaid.initialize({ startOnLoad: false });
  window.results = [];
  
  async function testAll() {
    const diags = document.querySelectorAll('.mermaid');
    for (let i = 0; i < diags.length; i++) {
      const el = diags[i];
      const code = el.textContent;
      try {
        await mermaid.parse(code);
        window.results.push({ id: i + 1, status: 'OK' });
      } catch (err) {
        window.results.push({ id: i + 1, status: 'ERROR', message: err.str || err.message || String(err) });
      }
    }
    const report = document.createElement('pre');
    report.id = 'report';
    report.textContent = JSON.stringify(window.results, null, 2);
    document.body.appendChild(report);
    window.done = true;
  }
  
  testAll();
</script>
</body>
</html>`;

fs.writeFileSync('test_all_diagrams.html', testHtml);
console.log('Written test_all_diagrams.html');

// Start HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync('test_all_diagrams.html'));
});

server.listen(9876, () => {
  console.log('Server listening on http://localhost:9876');
  try {
    const cmd = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --headless --dump-dom --virtual-time-budget=10000 "http://localhost:9876"`;
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 15000 });
    const match = out.match(/<pre id="report">([\s\S]*?)<\/pre>/);
    if (match) {
      const results = JSON.parse(match[1]);
      console.log('\n=== MERMAID PARSE TEST RESULTS ===');
      results.forEach(r => {
        const d = diagrams[r.id - 1];
        if (r.status === 'OK') {
          console.log(`[PASS] Diagram ${r.id} (lines ${d.startLine}-${d.endLine})`);
        } else {
          console.log(`[FAIL] Diagram ${r.id} (lines ${d.startLine}-${d.endLine}): ${r.message}`);
        }
      });
    } else {
      console.log('No report found in DOM output');
    }
  } catch (e) {
    console.error('Error running headless Chrome:', e.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

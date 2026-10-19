import json
from pathlib import Path

def generate_html():
    blueprint_path = Path("BLUEPRINT.md")
    if not blueprint_path.exists():
        print("BLUEPRINT.md not found!")
        return

    markdown_content = blueprint_path.read_text(encoding="utf-8")
    escaped_md = json.dumps(markdown_content)

    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LoRaResQ — Master Architecture Blueprint (PDF Export)</title>
  
  <!-- GitHub Markdown CSS -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
  
  <!-- Highlight.js for Syntax Highlighting -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

  <!-- KaTeX for Math Equations -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>

  <!-- Marked.js Markdown Parser -->
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>

  <!-- Mermaid.js Vector Diagrams -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>

  <style>
    body {{
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 40px 20px;
      background-color: #f6f8fa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    }}

    .export-header {{
      background: #ffffff;
      border: 1px solid #d0d7de;
      border-radius: 8px;
      padding: 18px 24px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 1px 3px rgba(31, 35, 40, 0.12);
    }}

    .export-header h2 {{
      margin: 0;
      font-size: 18px;
      color: #24292f;
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .export-header p {{
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #57606a;
    }}

    .btn-print {{
      background-color: #2da44e;
      color: #ffffff;
      border: 1px solid rgba(27, 31, 36, 0.15);
      border-radius: 6px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 1px 0 rgba(27, 31, 36, 0.1);
      transition: background-color 0.2s;
    }}

    .btn-print:hover {{
      background-color: #2c974b;
    }}

    .status-badge {{
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      background-color: #dafbe1;
      color: #1a7f37;
      margin-left: 8px;
    }}

    .markdown-body {{
      background: #ffffff;
      border: 1px solid #d0d7de;
      border-radius: 8px;
      padding: 48px;
      box-shadow: 0 1px 3px rgba(31, 35, 40, 0.12);
    }}

    /* Diagrams presentation */
    .mermaid {{
      display: flex;
      justify-content: center;
      background-color: #f6f8fa;
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      padding: 20px;
      margin: 24px 0;
      overflow-x: auto;
    }}

    .mermaid svg {{
      max-width: 100% !important;
      height: auto !important;
    }}

    /* Print Styles */
    @media print {{
      body {{
        background-color: #ffffff;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }}

      .export-header, .no-print {{
        display: none !important;
      }}

      .markdown-body {{
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }}

      h1, h2, h3, h4 {{
        page-break-after: avoid;
        break-after: avoid;
      }}

      table, pre, .mermaid, blockquote {{
        page-break-inside: avoid;
        break-inside: avoid;
      }}

      a {{
        text-decoration: underline;
        color: #0969da !important;
      }}
    }}
  </style>
</head>
<body>

  <div class="export-header no-print">
    <div>
      <h2>
        <span>📄 LoRaResQ Architecture — Print & PDF Export</span>
        <span id="mermaid-status" class="status-badge" style="background-color: #fff8c5; color: #9a6700;">Rendering Diagrams...</span>
      </h2>
      <p>Pixel-perfect GitHub styling with interactive vector diagrams, tables, and KaTeX math.</p>
    </div>
    <button class="btn-print" onclick="window.print()">
      🖨️ Save as PDF / Print
    </button>
  </div>

  <article class="markdown-body" id="content">
    <div id="loading" style="text-align: center; padding: 40px; color: #57606a;">
      <p>Loading Markdown, compiling diagrams, and rendering math...</p>
    </div>
  </article>

  <script>
    const rawMarkdown = {escaped_md};

    async function init() {{
      const contentDiv = document.getElementById('content');
      
      // 1. Configure marked
      marked.setOptions({{
        gfm: true,
        breaks: false,
        highlight: function(code, lang) {{
          if (lang === 'mermaid') return code;
          if (lang && hljs.getLanguage(lang)) {{
            try {{
              return hljs.highlight(code, {{ language: lang }}).value;
            }} catch (e) {{}}
          }}
          return hljs.highlightAuto(code).value;
        }}
      }});

      // 2. Render Markdown to DOM
      contentDiv.innerHTML = marked.parse(rawMarkdown);

      // 3. Transform Mermaid code blocks into <pre class="mermaid">
      const codeBlocks = contentDiv.querySelectorAll('code.language-mermaid');
      codeBlocks.forEach(codeEl => {{
        const preParent = codeEl.parentElement;
        const mermaidPre = document.createElement('pre');
        mermaidPre.className = 'mermaid';
        mermaidPre.textContent = codeEl.textContent.trim();
        preParent.replaceWith(mermaidPre);
      }});

      // 4. Initialize Mermaid
      mermaid.initialize({{
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        flowchart: {{ useMaxWidth: true, htmlLabels: true, curve: 'basis' }},
        sequence: {{ useMaxWidth: true, showSequenceNumbers: true }}
      }});

      // 5. Render Mermaid Vector SVGs
      try {{
        await mermaid.run({{ querySelector: '.mermaid' }});
        const badge = document.getElementById('mermaid-status');
        if (badge) {{
          badge.textContent = 'Mermaid Diagrams Rendered (Ready to Print)';
          badge.style.backgroundColor = '#dafbe1';
          badge.style.color = '#1a7f37';
        }}
        console.log('All Mermaid diagrams successfully rendered!');
      }} catch (err) {{
        console.error('Mermaid render error:', err);
        const badge = document.getElementById('mermaid-status');
        if (badge) {{
          badge.textContent = 'Diagram Warning (Check console)';
          badge.style.backgroundColor = '#ffebe9';
          badge.style.color = '#cf222e';
        }}
      }}

      // 6. Render KaTeX Math (after mermaid to avoid touching diagrams)
      if (typeof renderMathInElement === 'function') {{
        renderMathInElement(contentDiv, {{
          delimiters: [
            {{left: '$$', right: '$$', display: true}},
            {{left: '$', right: '$', display: false}},
            {{left: '\\(', right: '\\)', display: false}},
            {{left: '\\[', right: '\\]', display: true}}
          ],
          ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'svg', 'annotation'],
          ignoredClasses: ['mermaid', 'no-math'],
          throwOnError: false
        }});
      }}
    }}

    document.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>
"""
    output_path = Path("BLUEPRINT.html")
    output_path.write_text(html_template, encoding="utf-8")
    print(f"Successfully generated {output_path.resolve()} ({output_path.stat().st_size} bytes)")

if __name__ == "__main__":
    generate_html()

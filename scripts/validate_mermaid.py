import re

with open('BLUEPRINT.md', 'r', encoding='utf-8') as f:
    text = f.read()

blocks = re.findall(r'```mermaid\n([\s\S]*?)\n```', text)
print(f'Total mermaid blocks: {len(blocks)}')

for i, block in enumerate(blocks, 1):
    errors = []
    lines = block.strip().split('\n')
    diag_type = lines[0].strip()
    
    for l_num, line in enumerate(lines, 1):
        if '<===>' in line:
            errors.append(f'Line {l_num}: contains invalid arrow <===>')
        if diag_type.startswith('sequenceDiagram'):
            # Check for unquoted parens in participant/actor alias
            m = re.match(r'^\s*(actor|participant)\s+\w+\s+as\s+([^"\n]+)$', line)
            if m and ('(' in m.group(2) or ')' in m.group(2)):
                errors.append(f'Line {l_num}: unquoted parens in participant alias: {line.strip()}')
            # Check for semicolons in message text
            if ':' in line and not line.strip().startswith('Note') and not line.strip().startswith('autonumber'):
                parts = line.split(':', 1)
                if ';' in parts[1]:
                    errors.append(f'Line {l_num}: semicolon in message text (causes premature statement split): {line.strip()}')
    
    if errors:
        print(f'Diagram {i} ({diag_type}): FAILED')
        for e in errors:
            print('  ', e)
    else:
        print(f'Diagram {i} ({diag_type}): OK')

import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Alert Card Header Padding (align-items stretch so right col can span full height)
css = re.sub(r'\.alert-card-header\s*\{[^}]*\}', '.alert-card-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: stretch; gap: 16px; }', css)

# 2. Left side adjustments
css = re.sub(r'\.ac-level\s*\{[^}]*\}', '.ac-level { font-size: 0.75rem; font-weight: 500; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; display: block; line-height: 1.3; }', css)
css = re.sub(r'\.ac-title\s*\{[^}]*\}', '.ac-title { font-size: 0.95rem; font-weight: 500; color: rgba(255, 255, 255, 0.9); margin-bottom: 16px; line-height: 1.4; }', css)

# 3. Metadata Grid -> Flex Space-Between
css = re.sub(r'\.ac-summary-grid\s*\{[^}]*\}', '.ac-summary-grid { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); }', css)

# 4. Ac Right
css = re.sub(r'\.ac-right\s*\{[^}]*\}', '.ac-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; }', css)

# 5. Timestamp
css = re.sub(r'\.ac-time\s*\{[^}]*\}', '.ac-time { font-size: 0.75rem; font-weight: 400; color: rgba(255, 255, 255, 0.4); line-height: 1.3; }', css)


with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'w', encoding='utf-8') as f:
    f.write(css)
print('Refined alert-card spacing')


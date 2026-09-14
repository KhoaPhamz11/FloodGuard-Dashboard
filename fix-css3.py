import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Make ac-left flex center
css = re.sub(r'\.ac-left\s*\{[^}]*\}', '.ac-left { flex: 1; display: flex; flex-direction: column; justify-content: center; }', css)

# Make alert-card-header padding equal top/bottom
css = re.sub(r'\.alert-card-header\s*\{[^}]*\}', '.alert-card-header { padding: 20px; display: flex; justify-content: space-between; align-items: stretch; gap: 16px; }', css)

# Re-apply exact colors to ac-level
css = re.sub(r'\.alert-card\.critical \.ac-level\s*\{[^}]*\}', '.alert-card.critical .ac-level { color: #d32f2f; }', css)
css = re.sub(r'\.alert-card\.warning \.ac-level\s*\{[^}]*\}', '.alert-card.warning .ac-level { color: #e67e22; }', css)
css = re.sub(r'\.alert-card\.info \.ac-level\s*\{[^}]*\}', '.alert-card.info .ac-level { color: #0288d1; }', css)
css = re.sub(r'\.alert-card\.safe \.ac-level\s*\{[^}]*\}', '.alert-card.safe .ac-level { color: #388e3c; }', css)

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'w', encoding='utf-8') as f:
    f.write(css)
print('Fixed colors and centering')


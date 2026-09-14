import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Increase top padding of alert-card-header to push content down a bit
css = re.sub(r'\.alert-card-header\s*\{[^}]*\}', '.alert-card-header { padding: 20px 20px 16px 20px; display: flex; justify-content: space-between; align-items: stretch; gap: 16px; }', css)

# 2. Increase ac-level font size to 1rem (same as station name)
css = re.sub(r'\.ac-level\s*\{[^}]*\}', '.ac-level { font-size: 1rem; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; display: block; line-height: 1.3; }', css)

# 3. Adjust ac-right to vertically center its contents
css = re.sub(r'\.ac-right\s*\{[^}]*\}', '.ac-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 12px; }', css)

# 4. Ac-title (station name) margin adjust if needed (keep 12px)
# css = re.sub(r'\.ac-title\s*\{[^}]*\}', '.ac-title { font-size: 1rem; font-weight: 600; color: #ffffff; margin-bottom: 12px; line-height: 1.4; }', css)

# 5. Timestamp time (make it slightly bigger if needed, or keep 0.8rem)
# css = re.sub(r'\.ac-time\s*\{[^}]*\}', '.ac-time { font-size: 0.8rem; font-weight: 500; color: rgba(255, 255, 255, 0.6); line-height: 1.3; margin: 0; }', css)


with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'w', encoding='utf-8') as f:
    f.write(css)
print('Updated alert-center CSS for spacing and centering')


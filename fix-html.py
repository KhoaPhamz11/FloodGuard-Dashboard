import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\public\index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('<div class="summary-item critical">', '<div class="summary-item critical" onclick="setSeverityFilter(\'critical\')">')
html = html.replace('<div class="summary-item warning">', '<div class="summary-item warning" onclick="setSeverityFilter(\'warning\')">')
html = html.replace('<div class="summary-item info">', '<div class="summary-item info" onclick="setSeverityFilter(\'info\')">')
html = html.replace('<div class="summary-item safe">', '<div class="summary-item safe" onclick="setSeverityFilter(\'safe\')">')

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\public\index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Updated index.html summary items')


import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace with regex
pattern = r'(function viewAlertOnMap\(stationName\) \{\s*closeAlertCenter\(\);)'
replacement = r'\1\n    if (typeof showLayer === "function") showLayer("main");'
js = re.sub(pattern, replacement, js)

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Updated viewAlertOnMap reliably')


import re
with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Make sure window.expandedStationNames is defined at the top
if 'window.expandedStationNames' not in js:
    js = js.replace('function renderActiveAlerts() {', 'window.expandedStationNames = window.expandedStationNames || new Set();\nfunction renderActiveAlerts() {')

# Modify card.className
js = re.sub(r'card\.className = `alert-card \$\{alert\.severity\} \$\{alert\.severity === \'critical\' \? \'pulse\' : \'\'\}`;', 
            'let isExpanded = window.expandedStationNames.has(alert.stationName) ? \'expanded\' : \'\';\n        card.className = `alert-card ${alert.severity} ${isExpanded}`;', 
            js)

onclick_str = 'onclick="this.parentElement.classList.toggle(\'expanded\')"'
new_onclick_str = 'onclick="this.parentElement.classList.toggle(\'expanded\'); if(this.parentElement.classList.contains(\'expanded\')) { window.expandedStationNames.add(\'${alert.stationName}\'); } else { window.expandedStationNames.delete(\'${alert.stationName}\'); }"'

js = js.replace(onclick_str, new_onclick_str)

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Fixed alerts.js expand state correctly')


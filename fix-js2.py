import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Remove Lượng mưa
js = re.sub(r'<div>Lượng mưa: \$\{alert\.rain\} mm</div>', '', js)
# Also remove standard unicode if it was converted (e.g. Lng ma)
js = re.sub(r'<div[^>]*>L.*?ng m.*?a.*?</div>', '', js)

# 2. Add pause logic to renderActiveAlerts
pause_logic = '''
    const list = document.getElementById('active-alerts-list');
    if (!list) return;

    // --- PAUSE UPDATES IF USER IS INTERACTING ---
    // If the user has scrolled down OR has expanded a card, pause the UI refresh
    // so they don't lose their place or see flickering.
    if (list.scrollTop > 10 || (window.expandedStationNames && window.expandedStationNames.size > 0)) {
        return;
    }
    // --------------------------------------------

    list.innerHTML = '';
'''
js = re.sub(r'const list = document\.getElementById\(\'active-alerts-list\'\);\s*if \(\!list\) return;\s*list\.innerHTML = \'\';', pause_logic, js)

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Updated alerts.js')


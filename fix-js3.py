import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Define setSeverityFilter
filter_func = '''
window.currentSeverityFilter = 'all';
window.setSeverityFilter = function(severity) {
    if (window.currentSeverityFilter === severity) {
        window.currentSeverityFilter = 'all'; // toggle off
    } else {
        window.currentSeverityFilter = severity;
    }
    
    // Update active class
    document.querySelectorAll('.summary-item').forEach(item => {
        item.classList.remove('active');
        if (window.currentSeverityFilter !== 'all' && item.classList.contains(severity)) {
            item.classList.add('active');
        }
    });
    
    renderActiveAlerts();
};
'''
if 'window.setSeverityFilter' not in js:
    js = filter_func + js

# Update renderActiveAlerts to use currentSeverityFilter
# Find `if (currentFilterType !== 'all') {` and add severity filter after it.
new_filter_logic = '''
    // Severity Filter
    if (window.currentSeverityFilter && window.currentSeverityFilter !== 'all') {
        filtered = filtered.filter(a => a.severity === window.currentSeverityFilter);
    }
'''
js = js.replace('// Sort', new_filter_logic + '\n    // Sort')

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\js\alerts.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Updated alerts.js with severity filter')


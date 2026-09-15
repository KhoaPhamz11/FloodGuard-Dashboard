import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\dashboard.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove my previous bulky !important additions
content = re.sub(r'\.station-picker-btn\s*\{[^}]*!important[^}]*\}', '', content)
content = re.sub(r'\.station-picker-btn\s*\{\s*font-size:\s*1\.15rem;[^}]*\}', '', content)

# Append new refined typography
refined_css = '''
/* Refined Station Picker Typography */
.station-picker-btn { 
    font-size: 15px !important; 
    font-weight: 500 !important; 
    line-height: 1.4 !important;
    padding: 18px 12px !important;
    color: #e0e0e0;
    transition: all 0.2s ease;
}
.station-picker-btn:hover, .station-picker-btn:focus, .station-picker-btn.active {
    font-weight: 600 !important;
    color: #fff;
}
'''

content += refined_css

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\dashboard.css', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated dashboard.css')


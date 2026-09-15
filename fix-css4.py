import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'r', encoding='utf-8') as f:
    css = f.read()

new_css = '''
.summary-item {
    cursor: pointer;
    transition: transform 0.2s, background 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.summary-item:hover {
    background: rgba(255, 255, 255, 0.05);
}
.summary-item.active {
    background: rgba(255, 255, 255, 0.08);
}
.summary-item .count {
    font-size: 1.8rem;
    font-weight: 700;
}
.summary-item .label {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
}

.summary-item.critical.active { box-shadow: 0 0 15px rgba(211, 47, 47, 0.4) inset; border-color: rgba(211, 47, 47, 0.8); }
.summary-item.warning.active { box-shadow: 0 0 15px rgba(230, 126, 34, 0.4) inset; border-color: rgba(230, 126, 34, 0.8); }
.summary-item.info.active { box-shadow: 0 0 15px rgba(2, 136, 209, 0.4) inset; border-color: rgba(2, 136, 209, 0.8); }
.summary-item.safe.active { box-shadow: 0 0 15px rgba(56, 142, 60, 0.4) inset; border-color: rgba(56, 142, 60, 0.8); }
'''

css += new_css

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\src\css\alert-center.css', 'w', encoding='utf-8') as f:
    f.write(css)
print('Updated alert-center.css with summary active states')


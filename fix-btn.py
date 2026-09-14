import re

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\public\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Locate map-card block specifically
pattern = r'(<div class="card map-card motion-fade-up motion-p4 liquid-glass hover-motion-card">.*?<div class="card-header">.*?</h3>\s*)(</div>\s*<div class="map-container" id="main-map-container" style="position: relative;">\s*<div id="main-map" class="map-motion-entrance"></div>\s*)<button class="btn-fullscreen tooltip" id="btnFullscreenMap" data-tooltip="Toàn màn hình">\s*<svg.*?</svg>\s*</button>\s*(</div>)'

def repl(m):
    return m.group(1) + '''<button class="btn-fullscreen tooltip" id="btnFullscreenMap" data-tooltip="Toàn màn hình" style="position: static; width: 28px; height: 28px; background: transparent; border: 1px solid rgba(255,255,255,0.1); margin-left: auto;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                            </button>
                        ''' + m.group(2) + m.group(3)

new_content = re.sub(pattern, repl, content, flags=re.DOTALL)

with open(r'c:\Users\Admin\Desktop\Data\files\FloodGuard-Dashboard\frontend\public\index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

if new_content != content:
    print('Modified HTML')
else:
    print('Not modified')


const fs = require('fs');
const glob = require('fs'); // Actually just hardcode the files

const files = [
    'c:/Users/Admin/Desktop/Data/files/FloodGuard-Dashboard/frontend/src/js/alerts.js',
    'c:/Users/Admin/Desktop/Data/files/FloodGuard-Dashboard/frontend/src/js/app.js',
    'c:/Users/Admin/Desktop/Data/files/FloodGuard-Dashboard/frontend/src/js/layout.js',
    'c:/Users/Admin/Desktop/Data/files/FloodGuard-Dashboard/frontend/src/js/notification.js',
    'c:/Users/Admin/Desktop/Data/files/FloodGuard-Dashboard/frontend/public/index.html'
];

const svgs = {
    '🔴': '<svg class="feather status-icon critical" width="16" height="16" viewBox="0 0 24 24" fill="#e53935" stroke="#e53935" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>',
    '🟠': '<svg class="feather status-icon warning" width="16" height="16" viewBox="0 0 24 24" fill="#f57c00" stroke="#f57c00" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>',
    '🔵': '<svg class="feather status-icon info" width="16" height="16" viewBox="0 0 24 24" fill="#29b6f6" stroke="#29b6f6" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>',
    '🟢': '<svg class="feather status-icon safe" width="16" height="16" viewBox="0 0 24 24" fill="#43a047" stroke="#43a047" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>',
    '⚠': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    '🔔': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
    '🧠': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path></svg>',
    '🗺️': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>',
    '🧭': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>',
    '📍': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
    '📊': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    '📡': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"></path><path d="M2 8.82a15 15 0 0 1 20 0"></path><path d="M5 12.82a10 10 0 0 1 14 0"></path><path d="M8.5 16.42a5 5 0 0 1 7 0"></path></svg>',
    '✅': '<svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#43a047" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
};

for (const file of files) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        for (const [emoji, svg] of Object.entries(svgs)) {
            content = content.split(emoji).join(svg);
        }
        fs.writeFileSync(file, content);
        console.log('Replaced in ' + file);
    }
}


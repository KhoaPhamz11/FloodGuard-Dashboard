const fs = require('fs');
const file = 'c:/Users/Admin/Desktop/Data/files/FloodGuard-Dashboard/frontend/src/js/layout.js';
let content = fs.readFileSync(file, 'utf8');

// The original lines are broken because they look like:
// titleEl.textContent = mode === "detail"
//     ? "<svg class="feather" ... </svg> Text"
//     : "<svg class="feather" ... </svg> Text";

// We'll just replace the exact broken parts.
content = content.replace(/\? \"<svg class=\"feather\"/g, '? `<svg class="feather"');
content = content.replace(/\: \"<svg class=\"feather\"/g, ': `<svg class="feather"');
content = content.replace(/<\/svg> Ch([^"]*)\"/g, '</svg> Ch$1`');
content = content.replace('titleEl.textContent = mode === "detail"', 'titleEl.innerHTML = mode === "detail"');
content = content.replace('if (titleEl) titleEl.textContent = `<svg', 'if (titleEl) titleEl.innerHTML = `<svg');
content = content.replace('if (coordsEl) coordsEl.textContent = `<svg', 'if (coordsEl) coordsEl.innerHTML = `<svg');

fs.writeFileSync(file, content);
console.log('Fixed syntax in layout.js');


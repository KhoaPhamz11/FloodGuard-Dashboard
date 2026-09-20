// modeSwitcher.js - Handles UI mode selection and theme toggle

// Theme toggle button handler
function initThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
  // Initialize from saved preference
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.remove('dark-theme');
  } else {
    document.body.classList.add('dark-theme');
  }
}

// Mode selector handling
function initModeSelector() {
  const selector = document.getElementById('modeSelect');
  if (!selector) return;
  // Load saved mode
  const savedMode = localStorage.getItem('runMode') || 'station-files';
  selector.value = savedMode;
  selector.addEventListener('change', () => {
    const mode = selector.value;
    localStorage.setItem('runMode', mode);
  });
}

// Start simulation button (if exists)
function initStartButton() {
  const btn = document.getElementById('startSimulationBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const mode = document.getElementById('modeSelect')?.value || 'station-files';
    try {
      const resp = await fetch(`/api/start?mode=${mode}`);
      const data = await resp.json();
      alert(data.message || 'Simulation started');
    } catch (e) {
      console.error('Start error', e);
      alert('Failed to start simulation');
    }
  });
}

// Initialize all UI helpers on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initModeSelector();
  initStartButton();
});


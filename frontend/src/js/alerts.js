
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
// File: alerts.js — Trung tâm Cảnh báo (Alert Center) Logic

let alertCenterOpen = false;
let alertsData = [];
let historyData = [];
let eventTimeline = [];
let currentFilterType = 'all';
let currentSort = 'newest';

// Khởi tạo Alert Center
function initAlertCenter() {
    // Event listeners cho các nút mở/đóng
    const headerBtn = document.getElementById('headerAlertBtn');
    const sidebarBtn = document.getElementById('sidebarAlertBtn');
    const closeBtn = document.getElementById('closeAlertBtn');
    const drawer = document.getElementById('alertCenterDrawer');

    if (headerBtn) headerBtn.addEventListener('click', () => toggleAlertCenter('header'));
    if (sidebarBtn) sidebarBtn.addEventListener('click', () => toggleAlertCenter('sidebar'));
    if (closeBtn) closeBtn.addEventListener('click', closeAlertCenter);

    // Đóng khi nhấn ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && alertCenterOpen) {
            closeAlertCenter();
        }
    });

    // Tab Navigation
    const tabs = document.querySelectorAll('.alert-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.alert-tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active to clicked tab
            e.target.classList.add('active');
            const targetId = `tab-${e.target.dataset.tab}`;
            const targetContent = document.getElementById(targetId);
            if(targetContent) targetContent.classList.add('active');
        });
    });

    // Filters & Sort
    const filterSelect = document.getElementById('alert-filter-type');
    const sortSelect = document.getElementById('alert-sort');
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentFilterType = e.target.value;
            renderActiveAlerts();
        });
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderActiveAlerts();
        });
    }
}

// Mở/Đóng Alert Center
function toggleAlertCenter(source) {
    if (alertCenterOpen) closeAlertCenter();
    else openAlertCenter(source);
}

function openAlertCenter(source) {
    const drawer = document.getElementById('alertCenterDrawer');
    if (drawer) {
        if (source === 'sidebar') {
            drawer.classList.add('fullscreen-mode');
        } else {
            drawer.classList.remove('fullscreen-mode');
        }
        drawer.classList.add('open');
        alertCenterOpen = true;
        updateSidebarActiveState();
    }
}

function closeAlertCenter() {
    const drawer = document.getElementById('alertCenterDrawer');
    if (drawer) {
        drawer.classList.remove('open');
        drawer.classList.remove('fullscreen-mode');
        alertCenterOpen = false;
        updateSidebarActiveState();
    }
}

function updateSidebarActiveState() {
    const sidebarItem = document.getElementById('sidebarAlertBtn');
    if (sidebarItem) {
        if (alertCenterOpen) {
            sidebarItem.classList.add('sidebar-alert-active');
        } else {
            sidebarItem.classList.remove('sidebar-alert-active');
        }
    }
}

// Cập nhật dữ liệu từ realtime flow (app.js gọi hàm này)
function updateAlertCenter(latestData) {
    if (!latestData || !latestData.stations_data) return;

    const newAlerts = [];
    const currentTime = latestData.timestamp || new Date().toLocaleTimeString('vi-VN');
    
    // Gắn latestData vào biến toàn cục để viewAlertOnMap sử dụng
    window._latestAlertData = latestData;

    // Chuyển đổi station_data thành alert items
    latestData.stations_data.forEach(station => {
        // code = 0: An toàn, 1: Cảnh báo nhẹ, 2: Cảnh báo nặng, 3: Nghiêm trọng
        if (station.code > 0) {
            let severity = 'info';
            let titlePrefix = 'Cảnh báo nhẹ';
            
            if (station.code === 2) {
                severity = 'warning';
                titlePrefix = 'Cảnh báo nặng';
            } else if (station.code === 3) {
                severity = 'critical';
                titlePrefix = 'Nghiêm trọng';
            }

            const alertItem = {
                id: `alert-${station.station_name}-${currentTime}`,
                stationName: station.station_name,
                stationObj: station,
                severity: severity,
                title: `${titlePrefix}`,
                time: currentTime,
                type: 'station',
                waterLevel: station.H,
                rain: station.R,
                status: station.description,
                timestampValue: Date.now()
            };
            newAlerts.push(alertItem);
        } else if (station.code === 0) {
            // Theo dõi trạm đã về AN TOÀN cho timeline
            const wasAlerted = alertsData.find(a => a.stationName === station.station_name);
            if (wasAlerted) {
                historyData.unshift({
                    time: currentTime,
                    title: 'An toàn',
                    stationName: station.station_name,
                    stationObj: station
                });
            }
        }
    });

    // So sánh dữ liệu mới và cũ để thêm vào lịch sử
    newAlerts.forEach(newA => {
        const oldA = alertsData.find(a => a.stationName === newA.stationName);
        if (!oldA || oldA.severity !== newA.severity) {
            historyData.unshift(newA);
        }
    });
    
    if (historyData.length > 100) historyData.length = 100;
    
    alertsData = newAlerts;

    updateSummaryCounts(latestData);
    updateBadges();
    
    // Nếu tab Cảnh báo hiện tại đang mở, render lại
    renderActiveAlerts();
    renderHistory();
}

function updateSummaryCounts(latestData) {
    let critical = 0;
    let warning = 0;
    let info = 0;
    let safe = 0;

    latestData.stations_data.forEach(st => {
        if (st.code === 3) critical++;
        else if (st.code === 2) warning++;
        else if (st.code === 1) info++;
        else safe++;
    });

    const elC = document.getElementById('count-critical');
    const elW = document.getElementById('count-warning');
    const elI = document.getElementById('count-info');
    const elS = document.getElementById('count-safe');

    if (elC) elC.textContent = critical;
    if (elW) elW.textContent = warning;
    if (elI) elI.textContent = info;
    if (elS) elS.textContent = safe;

    const miniC = document.getElementById('mini-count-critical');
    const miniW = document.getElementById('mini-count-warning');
    const miniI = document.getElementById('mini-count-info');
    const miniS = document.getElementById('mini-count-safe');

    if (miniC) miniC.textContent = critical;
    if (miniW) miniW.textContent = warning;
    if (miniI) miniI.textContent = info;
    if (miniS) miniS.textContent = safe;
}

function updateBadges() {
    const totalAlerts = alertsData.length;
    const headerBadge = document.getElementById('headerAlertBadge');
    const sidebarBadge = document.getElementById('sidebarAlertBadge');

    if (headerBadge) {
        headerBadge.textContent = totalAlerts;
        if (totalAlerts > 0) headerBadge.classList.remove('hidden');
        else headerBadge.classList.add('hidden');
    }

    if (sidebarBadge) {
        sidebarBadge.textContent = totalAlerts > 99 ? '99+' : totalAlerts;
        sidebarBadge.style.display = totalAlerts > 0 ? 'inline-block' : 'none';
    }
}

// Deleted timeline functions
window.expandedStationNames = window.expandedStationNames || new Set();
function renderActiveAlerts() {
    
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


    // Filter
    let filtered = alertsData;
    if (currentFilterType !== 'all') {
        filtered = filtered.filter(a => a.type === currentFilterType);
    }

    
    // Severity Filter
    if (window.currentSeverityFilter && window.currentSeverityFilter !== 'all') {
        filtered = filtered.filter(a => a.severity === window.currentSeverityFilter);
    }

    // Sort
    filtered.sort((a, b) => {
        if (currentSort === 'newest') return b.timestampValue - a.timestampValue;
        if (currentSort === 'oldest') return a.timestampValue - b.timestampValue;
        if (currentSort === 'critical') {
            const getVal = (sev) => sev === 'critical' ? 3 : (sev === 'warning' ? 2 : 1);
            return getVal(b.severity) - getVal(a.severity);
        }
        return 0;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state"><svg class="feather" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#43a047" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> KHÔNG CÓ CẢNH BÁO<br><br>Hiện tại hệ thống đang hoạt động bình thường.</div>`;
        return;
    }

    filtered.forEach(alert => {
        const card = document.createElement('div');
        let isExpanded = window.expandedStationNames.has(alert.stationName) ? 'expanded' : '';
        card.className = `alert-card ${alert.severity} ${isExpanded}`;
        
        let districtName = alert.stationName;
        // Lookup station location if possible
        if (typeof getStationNumericId === "function" && typeof getStationLocation === "function") {
            const sid = getStationNumericId(alert.stationObj);
            const loc = getStationLocation(sid);
            if (loc) districtName = loc.district;
        }

        card.innerHTML = `
            <div class="alert-card-header" onclick="this.parentElement.classList.toggle('expanded'); if(this.parentElement.classList.contains('expanded')) { window.expandedStationNames.add('${alert.stationName}'); } else { window.expandedStationNames.delete('${alert.stationName}'); }">
                <div class="ac-left">
                    <div class="ac-level">${alert.title}</div>
                    <div class="ac-title">Trạm: ${districtName}</div>
                    <div class="ac-summary-grid">
                        <div>Mực nước: ${alert.waterLevel} cm</div>
                        
                    </div>
                </div>
                <div class="ac-right">
                    <div class="ac-time">${alert.time}</div>
                    <div class="ac-expand-icon">▼</div>
                </div>
            </div>
            <div class="alert-card-body">
                <div class="ac-reasons">
                    <h4>NGUYÊN NHÂN</h4>
                    <ul>
                        <li>${alert.status}</li>
                        <li>Khu vực nằm trong bán kính ảnh hưởng 2 km</li>
                    </ul>
                </div>
                <div class="ac-actions">
                    <button class="ac-btn primary" onclick="viewAlertOnMap('${alert.stationName}'); event.stopPropagation();">XEM TRÊN BẢN ĐỒ</button>
                    <button class="ac-btn" onclick="acknowledgeAlert(this); event.stopPropagation();">XÁC NHẬN</button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

function renderHistory() {
    const list = document.getElementById('history-alerts-list');
    if (!list) return;

    if (historyData.length === 0) {
        list.innerHTML = `<div class="empty-state">Chưa có dữ liệu lịch sử cảnh báo.</div>`;
        return;
    }

    list.innerHTML = '';
    historyData.forEach(alert => {
        let districtName = alert.stationName;
        if (typeof getStationNumericId === "function" && typeof getStationLocation === "function" && alert.stationObj) {
            const sid = getStationNumericId(alert.stationObj);
            const loc = getStationLocation(sid);
            if (loc) districtName = loc.district;
        }

        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.style.padding = '12px';
        div.style.background = 'rgba(255,255,255,0.03)';
        div.style.marginBottom = '8px';
        div.style.borderRadius = '8px';
        
        div.innerHTML = `<span class="tl-time">${alert.time}</span> <span class="tl-text"><strong>${alert.title}</strong> — Trạm ${districtName}</span>`;
        list.appendChild(div);
    });
}

function viewAlertOnMap(stationName) {
    closeAlertCenter();
    if (typeof showLayer === "function") showLayer("main");
    // Tận dụng Map hiện tại để focus
    if (typeof mainMap !== "undefined" && typeof getStationNumericId === "function" && typeof getStationLocation === "function") {
        const latestD = window._latestAlertData;
        if (latestD && latestD.stations_data) {
            const station = latestD.stations_data.find(s => s.station_name === stationName);
            if (station) {
                const sid = getStationNumericId(station);
                const loc = getStationLocation(sid);
                if (loc) {
                    mainMap.flyTo({
                        center: [loc.lng, loc.lat],
                        zoom: 15,
                        pitch: 45,
                        bearing: 0,
                        essential: true
                    });
                    
                    // Thử mở popup nếu logic tồn tại
                    if (typeof showStationPopup === "function") {
                        showStationPopup(loc.lng, loc.lat, station, mainMap);
                    }
                }
            }
        }
    }
}

function acknowledgeAlert(btnElement) {
    btnElement.textContent = 'ĐÃ XÁC NHẬN';
    btnElement.style.background = 'rgba(255,255,255,0.1)';
    btnElement.style.color = '#888';
    btnElement.disabled = true;
    
    // Bỏ hiệu ứng pulse của card
    const card = btnElement.closest('.alert-card');
    if (card) {
        card.classList.remove('pulse');
    }
}

// Đăng ký khởi tạo
document.addEventListener('DOMContentLoaded', () => {
    initAlertCenter();
});

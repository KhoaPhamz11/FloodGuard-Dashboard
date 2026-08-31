// File: layout.js — Module quản lý chuyển đổi layer & navigation (V2 Round 2)
// Thêm: station picker modal dùng chung cho "Trạm & Cảm biến" + "Báo cáo"
// Thêm: renderStationDetail() + updateStationDetail() cho layer chi tiết trạm

let currentLayer = "main";
let stationPickerMode = "reports";   // "reports" hoặc "detail"
let currentDetailStationId = null;   // Trạm đang được xem chi tiết

// ===== CHUYỂN LAYER =====
function showLayer(layerName) {
    // 1. Ẩn tất cả layers
    document.querySelectorAll(".layer-container").forEach(el => {
        el.classList.remove("layer-active");
    });

    // 2. Hiện layer được chọn
    const targetLayer = document.getElementById(`layer-${layerName}`);
    if (targetLayer) {
        targetLayer.classList.add("layer-active");
    }

    // 3. Highlight mục sidebar tương ứng
    document.querySelectorAll(".sidebar-item").forEach(item => {
        item.classList.remove("active");
        if (item.dataset.layer === layerName) {
            item.classList.add("active");
        }
    });

    // Nếu đang ở reports → highlight "Báo cáo"
    if (layerName === "reports") {
        document.querySelectorAll(".sidebar-item").forEach(item => {
            if (item.dataset.layer === "reports-picker") item.classList.add("active");
        });
    }
    // Nếu đang ở station-detail → highlight "Trạm & Cảm biến"
    if (layerName === "station-detail") {
        document.querySelectorAll(".sidebar-item").forEach(item => {
            if (item.dataset.layer === "stations-picker") item.classList.add("active");
        });
    }

    // 4. Hiện/ẩn nút Back
    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
        backBtn.style.display = layerName === "main" ? "none" : "flex";
    }

    // 5. Xử lý đặc biệt khi chuyển layer
    if (layerName === "fullmap") {
        if (typeof initFullscreenMap === "function") initFullscreenMap();
        if (typeof refreshMapSize === "function") refreshMapSize("fullscreen");
    } else if (layerName === "main") {
        if (typeof refreshMapSize === "function") refreshMapSize("main");
    }

    currentLayer = layerName;
}

// ===== KHỞI TẠO NAVIGATION =====
function initLayout() {
    // Sidebar click handlers
    document.querySelectorAll(".sidebar-item").forEach(item => {
        item.addEventListener("click", () => {
            const layerName = item.dataset.layer;

            if (layerName === "reports-picker") {
                openStationPicker("reports");
            } else if (layerName === "stations-picker") {
                openStationPicker("detail");
            } else {
                showLayer(layerName);
            }
        });
    });

    // Nút Back
    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            showLayer("main");
        });
    }

    // Nút "Xem toàn màn hình" trên thẻ map
    const btnFullscreen = document.getElementById("btnFullscreenMap");
    if (btnFullscreen) {
        btnFullscreen.addEventListener("click", () => {
            showLayer("fullmap");
        });
    }

    // Link "Xem tất cả cảnh báo >"
    const btnAllAlerts = document.getElementById("btnViewAllAlerts");
    if (btnAllAlerts) {
        btnAllAlerts.addEventListener("click", (e) => {
            e.preventDefault();
            showLayer("alerts");
        });
    }

    // Modal: nút đóng
    const modalClose = document.getElementById("modalClose");
    if (modalClose) {
        modalClose.addEventListener("click", closeStationPicker);
    }

    // Modal: click bên ngoài để đóng
    const modal = document.getElementById("stationPickerModal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeStationPicker();
        });
    }

    // Tạo 9 nút chọn trạm trong modal
    generateStationPickerButtons();
}

// ===== STATION PICKER MODAL =====
function openStationPicker(mode) {
    stationPickerMode = mode || "reports";

    // Đổi tiêu đề modal cho rõ mục đích
    const titleEl = document.getElementById("pickerModalTitle");
    if (titleEl) {
        titleEl.textContent = mode === "detail"
            ? "📡 Chọn trạm để xem chi tiết"
            : "📊 Chọn trạm để xem báo cáo";
    }

    const modal = document.getElementById("stationPickerModal");
    if (modal) modal.style.display = "flex";
}

function closeStationPicker() {
    const modal = document.getElementById("stationPickerModal");
    if (modal) modal.style.display = "none";
}

function generateStationPickerButtons() {
    const container = document.getElementById("stationPickerList");
    if (!container || typeof STATION_LOCATIONS === "undefined") return;
    container.innerHTML = "";

    STATION_LOCATIONS.forEach(loc => {
        const btn = document.createElement("button");
        btn.className = "station-picker-btn";
        btn.innerHTML = `<span class="picker-icon">📡</span>Trạm ${loc.district}`;

        btn.addEventListener("click", () => {
            closeStationPicker();

            if (stationPickerMode === "detail") {
                // === Chế độ chi tiết trạm ===
                currentDetailStationId = loc.id;
                renderStationDetail(loc.id);
                showLayer("station-detail");
            } else {
                // === Chế độ báo cáo (5 biểu đồ) ===
                if (typeof currentReportStationId !== "undefined") {
                    currentReportStationId = loc.id;
                }
                if (typeof renderAllChartsForStation === "function") {
                    renderAllChartsForStation(loc.id);
                }
                showLayer("reports");
            }
        });

        container.appendChild(btn);
    });
}

// ===== RENDER STATION DETAIL (gọi 1 lần khi chọn trạm) =====
function renderStationDetail(stationId) {
    const loc = typeof getStationLocation === "function"
        ? getStationLocation(stationId)
        : null;
    if (!loc) return;

    const displayName = typeof getStationDisplayName === "function"
        ? getStationDisplayName(stationId)
        : `Trạm ${stationId}`;

    // Cập nhật thông tin tĩnh trên water card
    const nameEl = document.getElementById("detail-station-name");
    if (nameEl) nameEl.textContent = displayName;

    const streetEl = document.getElementById("detail-station-street");
    if (streetEl) streetEl.textContent = loc.street;

    const districtEl = document.getElementById("detail-station-district");
    if (districtEl) districtEl.textContent = loc.district;

    // Cập nhật header card phải
    const titleEl = document.getElementById("detail-title");
    if (titleEl) titleEl.textContent = `📡 ${displayName}`;

    const coordsEl = document.getElementById("detail-coords");
    if (coordsEl) coordsEl.textContent = `📍 ${loc.lat}°N, ${loc.lng}°E — ${loc.street}, ${loc.district}`;

    // Tạo 6 metric cards + 1 status card
    const grid = document.getElementById("detail-metrics-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const metrics = [
        { icon: "💧", label: "Mực nước ngập",  id: "detail-h",     unit: "m" },
        { icon: "⬆️", label: "Tốc độ dâng",   id: "detail-v",     unit: "m/phút" },
        { icon: "🌧️", label: "Lượng mưa",     id: "detail-r",     unit: "mm/phút" },
        { icon: "🌊", label: "Thủy triều",    id: "detail-htide", unit: "m" },
        { icon: "🚰", label: "Thoát nước",    id: "detail-d",     unit: "mm/phút" },
        { icon: "⚡", label: "Risk Score",    id: "detail-risk",  unit: "" }
    ];

    metrics.forEach(m => {
        const card = document.createElement("div");
        card.className = "detail-metric-card";
        card.innerHTML = `
            <span class="metric-label">${m.icon} ${m.label}</span>
            <div>
                <span class="metric-value" id="${m.id}">--</span>
                <span class="metric-unit">${m.unit}</span>
            </div>
        `;
        grid.appendChild(card);
    });

    // Status card (full width)
    const statusCard = document.createElement("div");
    statusCard.className = "detail-metric-card metric-status";
    statusCard.innerHTML = `
        <span class="metric-label">📊 Trạng thái hoạt động</span>
        <span class="metric-value metric-status-text" id="detail-status-text">Đang chờ dữ liệu...</span>
    `;
    grid.appendChild(statusCard);
}

// ===== UPDATE STATION DETAIL (gọi mỗi giây từ app.js) =====
function updateStationDetail(latestData) {
    if (!currentDetailStationId || !latestData || !latestData.stations_data) return;

    const station = latestData.stations_data.find(
        s => typeof getStationNumericId === "function" && getStationNumericId(s) === currentDetailStationId
    );
    if (!station) return;

    // Cập nhật 6 giá trị metric
    const updates = {
        "detail-h":     Number(station.H).toFixed(2),
        "detail-v":     Number(station.V).toFixed(3),
        "detail-r":     Number(station.R).toFixed(2),
        "detail-htide": Number(station.H_tide).toFixed(2),
        "detail-d":     Number(station.D).toFixed(2),
        "detail-risk":  Number(station.S_risk).toFixed(2)
    };

    Object.entries(updates).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });

    // Cập nhật trạng thái
    const status = typeof getStatusFromCode === "function"
        ? getStatusFromCode(station.code)
        : "SAFE";

    const statusLabels = {
        SAFE: "An toàn",
        ADVISORY: "Cảnh báo nhẹ",
        WARNING: "Cảnh báo",
        CRITICAL: "Nguy hiểm"
    };

    // Badge trên water card
    const badge = document.getElementById("detail-status-badge");
    if (badge) {
        badge.textContent = statusLabels[status] || status;
        badge.className = `water-status-badge badge-${status.toLowerCase()}`;
    }

    // Text trên metrics card
    const statusText = document.getElementById("detail-status-text");
    if (statusText) {
        statusText.textContent = station.description || statusLabels[status] || status;
        statusText.className = `metric-value metric-status-text status-text-${status.toLowerCase()}`;
    }
}

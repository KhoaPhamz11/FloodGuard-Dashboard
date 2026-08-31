// File: layout.js — Module quản lý chuyển đổi layer & navigation (MỚI trong V2)
// Điều phối sidebar, nút Back, station picker modal, chuyển giữa 6 layers.

let currentLayer = "main";

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
    // Nếu đang ở reports (layer 6) thì highlight mục "Báo cáo"
    if (layerName === "reports") {
        document.querySelectorAll(".sidebar-item").forEach(item => {
            if (item.dataset.layer === "reports-picker") item.classList.add("active");
        });
    }

    // 4. Hiện/ẩn nút Back
    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
        backBtn.style.display = layerName === "main" ? "none" : "flex";
    }

    // 5. Xử lý đặc biệt khi chuyển layer
    if (layerName === "fullmap") {
        // Lazy init bản đồ fullscreen (chỉ tạo lần đầu)
        if (typeof initFullscreenMap === "function") initFullscreenMap();
        if (typeof refreshMapSize === "function") refreshMapSize("fullscreen");
    } else if (layerName === "main") {
        // Refresh map nhỏ khi quay về main
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
                // Mở modal chọn trạm thay vì chuyển layer
                openStationPicker();
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
function openStationPicker() {
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

            // Lưu station ID cho report charts update
            if (typeof currentReportStationId !== "undefined") {
                currentReportStationId = loc.id;
            }

            // Vẽ 5 biểu đồ cho trạm được chọn
            if (typeof renderAllChartsForStation === "function") {
                renderAllChartsForStation(loc.id);
            }

            // Chuyển sang layer reports
            showLayer("reports");
        });

        container.appendChild(btn);
    });
}


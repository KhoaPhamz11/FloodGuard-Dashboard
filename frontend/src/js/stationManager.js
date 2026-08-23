// frontend/src/js/stationManager.js

const StationManager = (function() {
    let stationsData = [];
    let selectedStationId = 1; // Default selected

    function init() {
        const grid = document.getElementById('stationsGrid');
        const stationSelect = document.getElementById('station-select');
        
        grid.innerHTML = '';
        stationSelect.innerHTML = '';

        for (let i = 1; i <= 9; i++) {
            // Create Station Card
            const card = document.createElement('div');
            card.id = `station-card-${i}`;
            card.className = `station-card status-safe`;
            if (i === selectedStationId) {
                card.classList.add('station-selected');
            }

            card.innerHTML = `
                <div class="station-name" id="name-val-${i}">Trạm ${i}</div>
                <div class="station-depth" data-tooltip="Độ sâu mực nước ngập (m)">H: <span id="depth-val-${i}">0.00</span> m</div>
                <div class="station-rate" data-tooltip="Tốc độ dâng/rút (cm/phút)">V: <span id="rate-val-${i}">0.00</span> cm/p</div>
                <div class="station-risk" data-tooltip="Điểm rủi ro (0-100)">Risk: <span id="risk-val-${i}">0</span></div>
                <div class="station-status-text" id="status-val-${i}">SAFE</div>
            `;

            // Click event to select station
            card.addEventListener('click', () => {
                selectStation(i);
            });

            grid.appendChild(card);

            // Create Option in Dropdown
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `📍 Trạm ${i}`;
            stationSelect.appendChild(option);
        }

        // Dropdown change event
        stationSelect.addEventListener('change', (e) => {
            selectStation(parseInt(e.target.value));
        });
    }

    function selectStation(id) {
        // Remove selection from previous
        const prevCard = document.getElementById(`station-card-${selectedStationId}`);
        if (prevCard) prevCard.classList.remove('station-selected');

        // Update selected id
        selectedStationId = id;

        // Add selection to new
        const newCard = document.getElementById(`station-card-${selectedStationId}`);
        if (newCard) newCard.classList.add('station-selected');

        // Sync dropdown
        const stationSelect = document.getElementById('station-select');
        stationSelect.value = id;
        
        // Trigger chart update for new station
        if (window.ChartHandler) {
            ChartHandler.onStationChange(selectedStationId);
        }
    }

    function update(stations) {
        stationsData = stations;

        stations.forEach(station => {
            const id = station.station_id;
            
            // Update Text
            document.getElementById(`name-val-${id}`).textContent = station.name;
            document.getElementById(`depth-val-${id}`).textContent = station.depth_H;
            document.getElementById(`rate-val-${id}`).textContent = station.rise_rate_V;
            document.getElementById(`risk-val-${id}`).textContent = station.risk_score;
            document.getElementById(`status-val-${id}`).textContent = station.status;

            // Update Dropdown text
            const selectOption = document.querySelector(`#station-select option[value="${id}"]`);
            if (selectOption) {
                selectOption.textContent = `📍 ${station.name}`;
            }

            // Update Classes for Color
            const card = document.getElementById(`station-card-${id}`);
            if (card) {
                card.classList.remove('status-safe', 'status-advisory', 'status-warning', 'status-critical');
                card.classList.add(`status-${station.status.toLowerCase()}`);
            }
        });
    }

    function getSelectedStationId() {
        return selectedStationId;
    }

    function getStationsData() {
        return stationsData;
    }

    return {
        init,
        update,
        getSelectedStationId,
        getStationsData
    };
})();

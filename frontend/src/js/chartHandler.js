// frontend/src/js/chartHandler.js

const ChartHandler = (function() {
    let floodChart = null;
    let currentMode = 'realtime-rain';
    
    // Historical data simulation
    const historyData = {
        labels: ['-6h', '-5h', '-4h', '-3h', '-2h', '-1h', 'Hiện tại'],
        rain: [10, 15, 8, 25, 40, 12, 5],
        tide: [0.5, 0.8, 1.2, 1.5, 1.3, 0.9, 0.6]
    };

    // Realtime data tracking
    const maxRealtimePoints = 20;
    const realtimeLabels = [];
    const realtimeRain = [];
    const realtimeDrainage = [];
    const realtimeTide = [];

    function init() {
        const ctx = document.getElementById('flood-chart-canvas').getContext('2d');
        const modeSelect = document.getElementById('chart-mode-select');

        // Initial Chart Setup
        floodChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#ffffff' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8892b0' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    y: {
                        ticks: { color: '#8892b0' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                },
                animation: { duration: 400 }
            }
        });

        modeSelect.addEventListener('change', (e) => {
            currentMode = e.target.value;
            renderChart();
        });
    }

    function onStationChange(stationId) {
        // When station changes, we might want to clear realtime arrays or fetch new data.
        // For demo, we just clear and re-render.
        realtimeLabels.length = 0;
        realtimeRain.length = 0;
        realtimeDrainage.length = 0;
        realtimeTide.length = 0;
        renderChart();
    }

    function update(data) {
        // data.timestamp and data.stations
        const selectedId = StationManager.getSelectedStationId();
        const station = data.stations.find(s => s.station_id === selectedId);
        if (!station) return;

        // Push new data points
        realtimeLabels.push(data.datetime_str);
        realtimeRain.push(station.rainfall_R);
        realtimeDrainage.push(station.drainage_D);
        realtimeTide.push(station.tide_H);

        if (realtimeLabels.length > maxRealtimePoints) {
            realtimeLabels.shift();
            realtimeRain.shift();
            realtimeDrainage.shift();
            realtimeTide.shift();
        }

        renderChart();
    }

    function renderChart() {
        if (!floodChart) return;
        
        const stationId = StationManager.getSelectedStationId();
        const stationName = `Trạm ${stationId}`;

        let chartType = 'bar';
        let labels = [];
        let dataset = {};

        switch (currentMode) {
            case 'realtime-rain':
                chartType = 'bar';
                labels = realtimeLabels;
                dataset = {
                    label: `Lượng mưa - ${stationName} (mm/phút)`,
                    data: realtimeRain,
                    backgroundColor: 'rgba(0, 212, 255, 0.5)',
                    borderColor: '#00d4ff',
                    borderWidth: 1
                };
                break;
            case 'realtime-drainage':
                chartType = 'line';
                labels = realtimeLabels;
                dataset = {
                    label: `Thoát nước - ${stationName} (mm/phút)`,
                    data: realtimeDrainage,
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    borderColor: '#28a745',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                };
                break;
            case 'realtime-tide':
                chartType = 'line';
                labels = realtimeLabels;
                dataset = {
                    label: `Mực nước triều - ${stationName} (m)`,
                    data: realtimeTide,
                    backgroundColor: 'rgba(123, 47, 252, 0.1)',
                    borderColor: '#7b2ffc',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                };
                break;
            case 'history-rain-6h':
                chartType = 'bar';
                labels = historyData.labels;
                dataset = {
                    label: `Lịch sử Lượng mưa 6h - ${stationName}`,
                    data: historyData.rain,
                    backgroundColor: 'rgba(255, 152, 0, 0.5)',
                    borderColor: '#ff9800',
                    borderWidth: 1
                };
                break;
            case 'history-tide-6h':
                chartType = 'line';
                labels = historyData.labels;
                dataset = {
                    label: `Lịch sử Thủy triều 6h - ${stationName}`,
                    data: historyData.tide,
                    backgroundColor: 'rgba(74, 158, 255, 0.2)',
                    borderColor: '#4a9eff',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                };
                break;
        }

        floodChart.config.type = chartType;
        floodChart.data.labels = labels;
        floodChart.data.datasets = [dataset];
        floodChart.update();
    }

    return {
        init,
        update,
        onStationChange
    };
})();

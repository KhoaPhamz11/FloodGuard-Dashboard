// frontend/src/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // Initialize components
    StationManager.init();
    ChartHandler.init();
    AlertManager.init();

    // Simulate real-time data updates
    simulateDataFeed();
});

// Mock Data Generator following the exact JSON schema from PDF
function generateMockData(timestamp) {
    const statuses = ['SAFE', 'ADVISORY', 'WARNING', 'CRITICAL'];
    const causes = ['NORMAL', 'HEAVY_RAIN', 'TIDAL_OVERFLOW', 'COMPOUND_FLOOD', 'BASEMENT_LEAK'];
    const areas = ['Quận 1', 'Quận 2', 'Quận 3', 'Quận 4', 'Quận 5', 'Quận 7', 'Bình Thạnh', 'Phú Nhuận', 'Thủ Đức'];

    const stations = [];
    for (let i = 1; i <= 9; i++) {
        const risk_score = Math.floor(Math.random() * 100);
        let status = 'SAFE';
        if (risk_score >= 75) status = 'CRITICAL';
        else if (risk_score >= 45) status = 'WARNING';
        else if (risk_score >= 20) status = 'ADVISORY';

        let cause = causes[Math.floor(Math.random() * causes.length)];
        if (status === 'SAFE') cause = 'NORMAL';

        stations.push({
            station_id: i,
            name: `Trạm ${areas[i-1]}`,
            rainfall_R: (Math.random() * 50).toFixed(1),
            tide_H: (Math.random() * 3).toFixed(2),
            drainage_D: (Math.random() * 10).toFixed(1),
            depth_H: (Math.random() * 1.5).toFixed(2),
            rise_rate_V: (Math.random() * 0.5 - 0.1).toFixed(2), // can be negative if receding
            risk_score: risk_score,
            status: status,
            root_cause: cause,
            message: `[${status}] Ngập do ${cause}`
        });
    }

    const hours = Math.floor(timestamp / 60) % 24;
    const mins = timestamp % 60;
    const datetime_str = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

    return {
        timestamp: timestamp,
        datetime_str: datetime_str,
        stations: stations
    };
}

function simulateDataFeed() {
    let currentTimestamp = 1;

    // Run once immediately
    const data = generateMockData(currentTimestamp);
    document.getElementById('currentTime').textContent = `Thời gian mô phỏng: ${data.datetime_str}`;
    StationManager.update(data.stations);
    ChartHandler.update(data);
    AlertManager.update(data);

    setInterval(() => {
        currentTimestamp += 5; // advance 5 minutes per tick for demo
        const newData = generateMockData(currentTimestamp);
        
        // Update UI components with new data
        document.getElementById('currentTime').textContent = `Thời gian mô phỏng: ${newData.datetime_str}`;
        StationManager.update(newData.stations);
        ChartHandler.update(newData);
        AlertManager.update(newData);
    }, 3000); // update every 3 seconds
}

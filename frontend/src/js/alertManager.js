// frontend/src/js/alertManager.js

const AlertManager = (function() {
    let notificationFeed = null;
    const maxNotifications = 50;

    function init() {
        notificationFeed = document.getElementById('notification-feed');
    }

    function addNotification(timeStr, stationName, status, message) {
        if (!notificationFeed) return;

        const li = document.createElement('li');
        li.className = `alert-item status-${status.toLowerCase()}`;
        
        let icon = '🟢';
        if (status === 'ADVISORY') icon = '🔵';
        else if (status === 'WARNING') icon = '🟠';
        else if (status === 'CRITICAL') icon = '🔴';

        li.innerHTML = `<span class="alert-time">${timeStr}</span> ${icon} <strong>${stationName}:</strong> ${message}`;
        
        // Insert at top
        notificationFeed.insertBefore(li, notificationFeed.firstChild);

        // Limit size
        while (notificationFeed.children.length > maxNotifications) {
            notificationFeed.removeChild(notificationFeed.lastChild);
        }
    }

    function update(data) {
        // Log alerts for stations that are not SAFE, or occasionally SAFE ones to show it's working
        data.stations.forEach(station => {
            // Only add a notification if the status is CRITICAL or WARNING, 
            // or randomly for ADVISORY to avoid spamming the log in this demo.
            if (station.status === 'CRITICAL' || station.status === 'WARNING') {
                addNotification(data.datetime_str, station.name, station.status, station.message);
            }
        });
    }

    return {
        init,
        update
    };
})();

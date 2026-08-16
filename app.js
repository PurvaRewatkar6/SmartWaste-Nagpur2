// SmartWaste Nagpur - Core Application Logic

// Predefined Coordinates & Smooth Routes
const citizenLat = 21.1290;
const citizenLng = 79.0565;
const DEMO_SEGMENT_DURATION = 1000; // 1 second per tick

// Smooth Interpolated Truck Route (Distance linear drop hone ke liye)
const truckRoute = [
    [21.1250, 79.0520], // ~500m
    [21.1260, 79.0530], // ~390m
    [21.1270, 79.0540], // ~270m
    [21.1280, 79.0550], // ~150m
    [21.1285, 79.0558], // ~100m
    [21.1288, 79.0562], // ~50m (Stop Area 1 - Citizen)
    [21.1290, 79.0565], // 0m Doorstep
    [21.1298, 79.0572], // Area 2 towards
    [21.1308, 79.0580], // Area 2 (Stop)
    [21.1315, 79.0568], // Area 3
    [21.1270, 79.0528]  // Reset Loop
];

const evAutoRoute = [
    [21.1210, 79.0480], // Depot
    [21.1235, 79.0510],
    [21.1260, 79.0535],
    [21.1285, 79.0558], // ~50m arrival
    [21.1290, 79.0565], // Citizen Complaint Spot
    [21.1305, 79.0565]
];

// App State Management
const state = {
    greenCredits: 120,
    verifiedCollections: 128,
    activeComplaintsCount: 0,
    complaints: [],
    activeRequest: null,
    
    // Simulation state
    activeRoute: truckRoute,
    activeVehicleType: 'truck', // 'truck' or 'ev_auto'
    routeIndex: 0,
    citizenDistance: 9999,
    simulationPaused: false,
    stoppedForPickup: false,
    stopTimer: null
};

// Leaflet Map Globals
let map = null;
let truckMarker = null;
let evMarker = null;
let routePolyline = null;
let citizenMarker = null;
let audioCtx = null;

function initAudioOnInteraction() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
}

function playAutoSound() {
    try {
        initAudioOnInteraction();
        if (!audioCtx || audioCtx.state !== 'running') return;
        
        let osc1 = audioCtx.createOscillator();
        let gain1 = audioCtx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain1.gain.setValueAtTime(0.25, audioCtx.currentTime);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.15);
    } catch(e) {
        console.error("Audio error:", e);
    }
}

// Haversine Distance Helper
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// Initialize Map
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    map = L.map('map').setView([21.1270, 79.0540], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    const truckIcon = L.divIcon({ html: '<div style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🚛</div>', iconSize: [35, 35], iconAnchor: [17, 17] });
    const miniAutoIcon = L.divIcon({ html: '<div style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🛺</div>', iconSize: [35, 35], iconAnchor: [17, 17] });

    // Markers Initialization
    truckMarker = L.marker(truckRoute[0], { icon: truckIcon }).addTo(map).bindPopup("Main Waste Truck");
    evMarker = L.marker(evAutoRoute[0], { icon: miniAutoIcon }).bindPopup("<b>Express Mini-EV Auto</b><br>Missed Pickup Unit");

    routePolyline = L.polyline(truckRoute, { color: '#27ae60', weight: 4, dashArray: '5, 5' }).addTo(map);

    citizenMarker = L.marker([citizenLat, citizenLng], {
        icon: L.divIcon({ html: '<div style="font-size: 24px;">🏠</div>', iconSize: [25, 25], iconAnchor: [12, 12] })
    }).addTo(map).bindPopup("<b>Citizen Location (Area 1)</b>");
}

// Render UI Components & Distance Updates
function renderUI() {
    const currentPos = state.activeRoute[state.routeIndex];
    state.citizenDistance = getDistanceMeters(currentPos[0], currentPos[1], citizenLat, citizenLng);

    // Dynamic Distance & ETA Update
    const distanceVal = document.getElementById('distanceVal');
    const etaEl = document.getElementById('eta');
    const statusBanner = document.getElementById('audioBanner');

    if (distanceVal) {
        distanceVal.innerText = state.citizenDistance + " m";
    }

    if (etaEl) {
        if (state.citizenDistance <= 50) {
            etaEl.innerText = "ARRIVED (5s STOP)";
        } else {
            const mins = Math.max(1, Math.ceil(state.citizenDistance / 60));
            etaEl.innerText = mins + " Mins";
        }
    }

    if (statusBanner) {
        if (state.citizenDistance <= 50) {
            statusBanner.innerText = `🚨 ${state.activeVehicleType === 'truck' ? 'MAIN TRUCK' : 'MINI-EV AUTO'} AT AREA 1 STOP!`;
            statusBanner.style.display = 'block';
        } else {
            statusBanner.style.display = 'none';
        }
    }
}

// Main Simulation Tick (Continuous Movement & 5-Second Stop Logic)
function simulationTick() {
    if (state.simulationPaused) return;

    const currentPos = state.activeRoute[state.routeIndex];
    state.citizenDistance = getDistanceMeters(currentPos[0], currentPos[1], citizenLat, citizenLng);

    // Check 50m Stop Condition
    if (state.citizenDistance <= 50 && !state.stoppedForPickup) {
        state.stoppedForPickup = true;
        state.simulationPaused = true; // Stop vehicle movement
        playAutoSound();
        renderUI();

        // Resume after 5 Seconds
        setTimeout(() => {
            state.simulationPaused = false;
        }, 5000);
        return;
    }

    // Reset stop trigger once vehicle moves away from 50m zone
    if (state.citizenDistance > 60) {
        state.stoppedForPickup = false;
    }

    // Move to next point in route
    state.routeIndex = (state.routeIndex + 1) % state.activeRoute.length;
    
    const newLatLng = state.activeRoute[state.routeIndex];
    
    if (state.activeVehicleType === 'truck') {
        if (truckMarker) truckMarker.setLatLng(newLatLng);
    } else {
        if (evMarker) evMarker.setLatLng(newLatLng);
    }

    if (map) map.panTo(newLatLng);
    renderUI();
}

// Function: Register Missed Pickup Complaint & Dispatch Mini-EV Auto
function registerMissedPickupComplaint(locationName = "Area 1 - Doorstep") {
    state.activeComplaintsCount += 1;
    const newComplaint = {
        id: Date.now(),
        location: locationName,
        status: 'enroute'
    };
    state.complaints.push(newComplaint);

    alert(`Complaint Registered! Main truck bypassed. Dispatching NMC Mini-EV Auto to ${locationName}.`);

    // HIDE BADA TRUCK & SHOW ONLY MINI AUTO
    if (map) {
        if (truckMarker) map.removeLayer(truckMarker); // Hide Truck
        if (evMarker) evMarker.addTo(map);             // Show Mini-EV Auto
    }

    // Switch Route to Mini-EV Route
    state.activeVehicleType = 'ev_auto';
    state.activeRoute = evAutoRoute;
    state.routeIndex = 0;
    state.stoppedForPickup = false;
    state.simulationPaused = false;
}

// Window Event Listeners & Button Handling
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    setInterval(simulationTick, DEMO_SEGMENT_DURATION);

    // Complaint Button Trigger Listener (agar UI par ID 'complainBtn' ya similar button ho)
    const complainBtn = document.getElementById('complainBtn');
    if (complainBtn) {
        complainBtn.addEventListener('click', () => {
            registerMissedPickupComplaint("Bajaj Nagar (Area 1)");
        });
    }
});

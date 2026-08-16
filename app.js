// SmartWaste Nagpur - Core Application Logic

// Predefined Coordinates & Routes
const citizenLat = 21.1290;
const citizenLng = 79.0565;
const DEMO_MISSED_PICKUP_TIMEOUT = 7000;
const DEMO_SEGMENT_DURATION = 1200;

const truckRoute = [
    [21.1270, 79.0528], [21.1270, 79.0540], [21.1278, 79.0540], [21.1278, 79.0554],
    [21.1290, 79.0565], // Area 1 citizen collection
    [21.1302, 79.0565], [21.1302, 79.0582], [21.1315, 79.0582],
    [21.1315, 79.0568], // Area 2 collection
    [21.1324, 79.0568], [21.1324, 79.0550], [21.1311, 79.0550],
    [21.1311, 79.0537], // Area 3 collection
    [21.1294, 79.0537], [21.1294, 79.0521], [21.1278, 79.0521],
    [21.1278, 79.0534], // Area 4 collection
    [21.1270, 79.0528]
];

const evAutoRoute = [
    [21.1210, 79.0480], // Depot
    [21.1210, 79.0510], 
    [21.1210, 79.0535], 
    [21.1235, 79.0535], 
    [21.1260, 79.0535], 
    [21.1260, 79.0565], 
    [21.1275, 79.0565], 
    [21.1290, 79.0565], // Arrived at Citizen House
    [21.1305, 79.0565], 
    [21.1320, 79.0565]  
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
    activeVehicleType: 'truck',
    routeIndex: 0,
    citizenDistance: 9999,
    citizenRemainingRouteMeters: 0,
    collectionStopDistance: 9999,
    remainingRouteMeters: 0,
    simulationPaused: false,
    wasAtCitizen: false,
    activeComplaintId: null,
    assignedVehicleId: null,
    
    collectionPoints: [
        { name: "VNIT Chowk (Area 1)", routeIndex: 3, status: "pending" },
        { name: "Bajaj Nagar (Area 2 - Citizen)", routeIndex: 4, status: "pending" },
        { name: "Bajaj Nagar Park (Area 3)", routeIndex: 10, status: "pending" },
        { name: "East Chowk (Area 4)", routeIndex: 14, status: "pending" }
    ]
};

// UI Modal Callbacks
let alertModalCallback = null;
let promptModalCallback = null;
let confirmModalCallback = null;

// Leaflet Map Globals
let map = null;
let truckMarker = null;
let evMarker = null;
let routePolyline = null;
let citizenMarker = null;
let truckIcon = null;
let miniAutoIcon = null;

// Audio Context
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

        let osc2 = audioCtx.createOscillator();
        let gain2 = audioCtx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.2); 
        gain2.gain.setValueAtTime(0.25, audioCtx.currentTime + 0.2);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(audioCtx.currentTime + 0.2);
        osc2.stop(audioCtx.currentTime + 0.35);
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

// Modal Utilities
function showCustomAlert(title, message, callback = null) {
    const alertTitle = document.getElementById('alertTitle');
    const alertMessage = document.getElementById('alertMessage');
    const alertModal = document.getElementById('customAlertModal');
    
    if (alertTitle) alertTitle.innerText = title;
    if (alertMessage) alertMessage.innerText = message;
    if (alertModal) alertModal.style.display = 'flex';
    alertModalCallback = callback;
}

function closeAlertModal() {
    const alertModal = document.getElementById('customAlertModal');
    if (alertModal) alertModal.style.display = 'none';
    if (alertModalCallback) {
        alertModalCallback();
        alertModalCallback = null;
    }
}

function showCustomPrompt(title, message, placeholder, callback) {
    const promptTitle = document.getElementById('promptTitle');
    const promptMessage = document.getElementById('promptMessage');
    const input = document.getElementById('promptInput');
    const promptModal = document.getElementById('customPromptModal');
    
    if (promptTitle) promptTitle.innerText = title;
    if (promptMessage) promptMessage.innerText = message;
    if (input) {
        input.value = '';
        input.placeholder = placeholder;
    }
    if (promptModal) promptModal.style.display = 'flex';
    promptModalCallback = callback;
    if (input) setTimeout(() => input.focus(), 100);
}

function closePromptModal(isConfirm) {
    const promptModal = document.getElementById('customPromptModal');
    if (promptModal) promptModal.style.display = 'none';
    if (promptModalCallback) {
        const input = document.getElementById('promptInput');
        const value = input ? input.value.trim() : '';
        promptModalCallback(isConfirm ? value : null);
        promptModalCallback = null;
    }
}

function showCustomConfirm(title, message, callback) {
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmModal = document.getElementById('customConfirmModal');
    
    if (confirmTitle) confirmTitle.innerText = title;
    if (confirmMessage) confirmMessage.innerText = message;
    if (confirmModal) confirmModal.style.display = 'flex';
    confirmModalCallback = callback;
}

function closeConfirmModal(isConfirm) {
    const confirmModal = document.getElementById('customConfirmModal');
    if (confirmModal) confirmModal.style.display = 'none';
    if (confirmModalCallback) {
        confirmModalCallback(isConfirm);
        confirmModalCallback = null;
    }
}

// Initialize Map
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    map = L.map('map').setView([21.1255, 79.0522], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    truckIcon = L.divIcon({ html: '<div style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🚛</div>', iconSize: [35, 35], iconAnchor: [17, 17] });
    miniAutoIcon = L.divIcon({ html: '<div style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🛺</div>', iconSize: [35, 35], iconAnchor: [17, 17] });

    truckMarker = L.marker(truckRoute[0], { icon: truckIcon }).addTo(map).bindPopup("Main Truck #04");
    evMarker = L.marker(evAutoRoute[0], { icon: miniAutoIcon }).bindPopup("<b>Eco Mini-EV Auto #EV-02</b><br>Express Missed Pickup Unit");
    routePolyline = L.polyline(truckRoute, { color: '#27ae60', weight: 4, dashArray: '5, 5' }).addTo(map);

    citizenMarker = L.marker([citizenLat, citizenLng], {
        icon: L.divIcon({ html: '<div style="font-size: 24px;">🏠</div>', iconSize: [25, 25], iconAnchor: [12, 12] })
    }).addTo(map).bindPopup("<b>Your House Spot</b>");
}

function getActiveComplaint() {
    return state.complaints.find(complaint => complaint.id === state.activeComplaintId) || null;
}

function getActiveTarget() {
    if (state.activeVehicleType === 'ev_auto') {
        const complaint = getActiveComplaint();
        if (!complaint || complaint.status !== 'enroute') return null;
        return {
            type: 'complaint',
            name: `${complaint.location} (Complaint)`,
            routeIndex: 7,
            coordinates: evAutoRoute[7]
        };
    }

    const stop = state.collectionPoints.find(point => point.status === 'pending');
    if (!stop) return null;
    return {
        type: 'collection',
        name: stop.name,
        routeIndex: stop.routeIndex,
        coordinates: truckRoute[stop.routeIndex],
        stop
    };
}

function getActiveMarker() {
    return state.activeVehicleType === 'ev_auto' ? evMarker : truckMarker;
}

// Render UI Components
function renderUI() {
    const citizenPoints = document.getElementById('citizenPoints');
    const verifiedCount = document.getElementById('verifiedCount');
    const complaintCount = document.getElementById('complaintCount');
    
    if (citizenPoints) citizenPoints.innerText = state.greenCredits;
    if (verifiedCount) verifiedCount.innerText = state.verifiedCollections + " Houses";
    if (complaintCount) complaintCount.innerText = state.activeComplaintsCount;
    
    const collectionStatusEl = document.getElementById('collectionStatus');

    const currentPos = state.activeRoute[state.routeIndex];
    const activeTarget = getActiveTarget();
    state.citizenDistance = getDistanceMeters(currentPos[0], currentPos[1], citizenLat, citizenLng);
    state.collectionStopDistance = activeTarget
        ? getDistanceMeters(currentPos[0], currentPos[1], activeTarget.coordinates[0], activeTarget.coordinates[1])
        : 0;

    const distanceVal = document.getElementById('distanceVal');
    if (distanceVal) {
        if (state.citizenDistance >= 1000) {
            distanceVal.innerText = (state.citizenDistance / 1000).toFixed(2) + " km";
        } else {
            distanceVal.innerText = Math.round(state.citizenDistance) + " m";
        }
    }

    const etaEl = document.getElementById('eta');
    if (etaEl) {
        if (state.citizenDistance <= 60) {
            etaEl.innerText = "ARRIVED";
        } else {
            const mins = Math.max(1, Math.ceil(state.citizenDistance / 120));
            etaEl.innerText = mins + (mins === 1 ? " Min" : " Mins");
        }
    }

    const audioBanner = document.getElementById('audioBanner');
    if (state.citizenDistance <= 60) {
        if (audioBanner) {
            audioBanner.innerText = `${state.activeVehicleType === 'truck' ? 'VEHICLE' : 'MINI-EV'} ARRIVED AT YOUR DOORSTEP!`;
            audioBanner.style.display = 'block';
        }

        if (!state.wasAtCitizen) {
            playAutoSound();
        }
        state.wasAtCitizen = true;
    } else {
        if (audioBanner) audioBanner.style.display = 'none';
        state.wasAtCitizen = false;
    }

    if (collectionStatusEl) {
        if (state.activeRequest === null) {
            collectionStatusEl.innerText = "⏳ Pending Pickup";
            collectionStatusEl.style.color = "#e67e22";
        } else if (state.activeRequest === "completed_segregated") {
            collectionStatusEl.innerText = "✅ Picked Up (+20 Green Credits)";
            collectionStatusEl.style.color = "#27ae60";
        }
    }
}

// Simulation Interval Tick
function simulationTick() {
    if (state.simulationPaused) return;

    state.routeIndex = (state.routeIndex + 1) % state.activeRoute.length;
    
    const newLatLng = state.activeRoute[state.routeIndex];
    const activeMarker = getActiveMarker();
    if (activeMarker) activeMarker.setLatLng(newLatLng);
    if (map) map.panTo(newLatLng);

    if (state.activeVehicleType === 'truck' && state.routeIndex === 0) {
        state.collectionPoints.forEach(pt => pt.status = "pending");
        state.activeRequest = null;
    }

    if (state.activeVehicleType === 'ev_auto' && state.routeIndex === 0) {
        switchToVehicle('truck');
        return;
    }

    renderUI();
}

// Switch Vehicle Logic
function switchToVehicle(vehicleType) {
    state.activeVehicleType = vehicleType;
    state.routeIndex = 0;
    state.simulationPaused = false;
    state.wasAtCitizen = false;
    
    if (vehicleType === 'truck') {
        state.activeRoute = truckRoute;
    } else if (vehicleType === 'ev_auto') {
        state.activeRoute = evAutoRoute;
    }
    
    const startLatLng = state.activeRoute[0];
    const activeMarker = getActiveMarker();
    if (activeMarker) activeMarker.setLatLng(startLatLng);
    if (map) map.panTo(startLatLng);
    
    renderUI();
}

// Global Init Execution
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    setInterval(simulationTick, DEMO_SEGMENT_DURATION);
});

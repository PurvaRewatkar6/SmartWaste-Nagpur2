// SmartWaste Nagpur - Core Logic

// Coordinates & Smooth Interpolated Route
const citizenLat = 21.1290;
const citizenLng = 79.0565;
const DEMO_SEGMENT_DURATION = 1000;

// Route mapped with specific Target Areas
const truckRoute = [
    [21.1250, 79.0520], // Starting
    [21.1260, 79.0530], // ~390m
    [21.1270, 79.0540], // ~270m
    [21.1280, 79.0550], // Area 1: VNIT Campus Chowk
    [21.1288, 79.0562], // Stop Area (50m zone)
    [21.1290, 79.0565], // Area 2: Bajaj Nagar (Citizen House)
    [21.1298, 79.0572], // Area 3: IT Park Road
    [21.1308, 79.0580], // Area 4: Shankar Nagar Chowk
    [21.1315, 79.0568], // Area 5: Laxmi Nagar Zone
    [21.1270, 79.0528]  // Reset Loop
];

const evAutoRoute = [
    [21.1210, 79.0480], // Depot
    [21.1235, 79.0510],
    [21.1260, 79.0535],
    [21.1285, 79.0558],
    [21.1290, 79.0565], // Citizen Complaint Spot
    [21.1305, 79.0565]
];

// App State
const state = {
    greenCredits: 120,
    verifiedCollections: 128,
    activeComplaintsCount: 0,
    complaints: [],
    
    // Simulation state
    activeRoute: truckRoute,
    activeVehicleType: 'truck',
    routeIndex: 0,
    citizenDistance: 9999,
    simulationPaused: false,
    stoppedForPickup: false,
    
    // 5 Target Areas Status for NMC Dashboard
    targetAreas: [
        { id: 1, name: "Area 1: VNIT Campus Chowk", routeIndex: 3, status: "pending" },
        { id: 2, name: "Area 2: Bajaj Nagar (Citizen Spot)", routeIndex: 5, status: "pending" },
        { id: 3, name: "Area 3: IT Park Road", routeIndex: 6, status: "pending" },
        { id: 4, name: "Area 4: Shankar Nagar Chowk", routeIndex: 7, status: "pending" },
        { id: 5, name: "Area 5: Laxmi Nagar Zone", routeIndex: 8, status: "pending" }
    ]
};

// Map & Audio Globals
let map = null;
let truckMarker = null;
let evMarker = null;
let routePolyline = null;
let citizenMarker = null;

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

// Map Setup
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    map = L.map('map').setView([21.1270, 79.0540], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    const truckIcon = L.divIcon({ html: '<div style="font-size: 32px;">🚛</div>', iconSize: [35, 35], iconAnchor: [17, 17] });
    const miniAutoIcon = L.divIcon({ html: '<div style="font-size: 32px;">🛺</div>', iconSize: [35, 35], iconAnchor: [17, 17] });

    truckMarker = L.marker(truckRoute[0], { icon: truckIcon }).addTo(map).bindPopup("Main Waste Truck #04");
    evMarker = L.marker(evAutoRoute[0], { icon: miniAutoIcon }).bindPopup("<b>NMC Mini-EV Auto</b><br>Complaint Pickup Unit");

    routePolyline = L.polyline(truckRoute, { color: '#27ae60', weight: 4, dashArray: '5, 5' }).addTo(map);

    citizenMarker = L.marker([citizenLat, citizenLng], {
        icon: L.divIcon({ html: '<div style="font-size: 24px;">🏠</div>', iconSize: [25, 25], iconAnchor: [12, 12] })
    }).addTo(map).bindPopup("<b>Citizen House Spot</b>");
}

// Dynamic UI Render (NMC Dashboard + Citizen View)
function renderUI() {
    const citizenPoints = document.getElementById('citizenPoints');
    const verifiedCount = document.getElementById('verifiedCount');
    const complaintCount = document.getElementById('complaintCount');
    
    if (citizenPoints) citizenPoints.innerText = state.greenCredits;
    if (verifiedCount) verifiedCount.innerText = state.verifiedCollections + " Houses";
    if (complaintCount) complaintCount.innerText = state.activeComplaintsCount;

    const currentPos = state.activeRoute[state.routeIndex];
    state.citizenDistance = getDistanceMeters(currentPos[0], currentPos[1], citizenLat, citizenLng);

    const distanceVal = document.getElementById('distanceVal');
    const etaEl = document.getElementById('eta');

    if (distanceVal) distanceVal.innerText = state.citizenDistance + " m";

    if (etaEl) {
        if (state.citizenDistance <= 50) {
            etaEl.innerText = "ARRIVED (5s STOP)";
        } else {
            const mins = Math.max(1, Math.ceil(state.citizenDistance / 60));
            etaEl.innerText = mins + " Mins";
        }
    }

    // NMC Dashboard: Target Areas Live Status Table/List Render
    const nmcAreaContainer = document.getElementById('nmcAreaStatusList');
    if (nmcAreaContainer) {
        nmcAreaContainer.innerHTML = state.targetAreas.map(area => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee; background: ${area.status === 'collected' ? '#e8f8f5' : '#fff'}; margin-bottom: 5px; border-radius: 6px;">
                <span style="font-weight: 600; font-size: 14px; color: #2c3e50;">${area.name}</span>
                <span style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; ${area.status === 'collected' ? 'background:#27ae60; color:#fff;' : 'background:#f39c12; color:#fff;'}">
                    ${area.status === 'collected' ? '✅ COLLECTED' : '⏳ PENDING'}
                </span>
            </div>
        `).join('');
    }
}

// Live Area Tracking: Updates Area status on NMC Dashboard as Truck moves
function updateTargetAreaStatus(currentRouteIndex) {
    const area = state.targetAreas.find(a => a.routeIndex === currentRouteIndex);
    if (area && area.status !== 'collected') {
        area.status = 'collected';
        renderUI();
    }
}

// Main Simulation Loop
function simulationTick() {
    if (state.simulationPaused) return;

    const currentPos = state.activeRoute[state.routeIndex];
    state.citizenDistance = getDistanceMeters(currentPos[0], currentPos[1], citizenLat, citizenLng);

    // Auto update NMC Dashboard when truck reaches specific route indexes
    updateTargetAreaStatus(state.routeIndex);

    // 50m Auto-Stop Rule
    if (state.citizenDistance <= 50 && !state.stoppedForPickup) {
        state.stoppedForPickup = true;
        state.simulationPaused = true;
        renderUI();

        setTimeout(() => {
            state.simulationPaused = false;
        }, 5000);
        return;
    }

    if (state.citizenDistance > 60) {
        state.stoppedForPickup = false;
    }

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

// STEP 1: GREEN BUTTON (Only confirms collection notice - NO CREDITS YET)
function handleGarbagePickup() {
    alert("✅ Garbage Picked Up!\n\nStatus: Pending Helper AI Camera Scan.\nCredits will be added once AI verifies waste separation.");
}

// STEP 2: HELPER AI CAMERA SCAN (Grants Credits IF Separated)
function scanWasteWithHopperAI() {
    const scanResultEl = document.getElementById('aiScanResult');
    if (scanResultEl) {
        scanResultEl.innerText = "📷 Scanning Hopper Garbage via AI Camera...";
        
        setTimeout(() => {
            const isSegregated = Math.random() > 0.3; // 70% chance of segregated waste
            
            if (isSegregated) {
                state.greenCredits += 20; // ADD CREDITS HERE ONLY
                state.verifiedCollections += 1;
                scanResultEl.innerText = "✅ AI Scan Status: SEPARATED (Soohka/Geela Alag Hai).\n🎉 +20 Green Credits Rewarded to Citizen!";
                scanResultEl.style.color = "#27ae60";
            } else {
                scanResultEl.innerText = "❌ AI Scan Status: UNSEGREGATED (Kachra Mix Hai).\n⚠️ 0 Credits Rewarded.";
                scanResultEl.style.color = "#c0392b";
            }
            renderUI();
        }, 2000);
    }
}

// RED BUTTON: Complaint Registration & Mini-EV Dispatch
function handleMissedPickup() {
    const userLocation = prompt("⚠️ Missed Pickup Complaint\n\nEnter Location / Landmark to register complaint:", "Bajaj Nagar, House #42");
    
    if (userLocation !== null && userLocation.trim() !== "") {
        state.activeComplaintsCount += 1;

        alert(`✅ Complaint Registered Successfully!\n\nTarget Location: ${userLocation}\nStatus: Dispatching NMC Express Mini-EV Auto...`);

        // Hide Truck, Show Mini-EV Auto
        if (map) {
            if (truckMarker) map.removeLayer(truckMarker);
            if (evMarker) evMarker.addTo(map);
        }

        // Switch active tracker to Mini Auto
        state.activeVehicleType = 'ev_auto';
        state.activeRoute = evAutoRoute;
        state.routeIndex = 0;
        state.stoppedForPickup = false;
        state.simulationPaused = false;

        renderUI();
    }
}

// Top Dashboard Tab Switcher Fix
function setupDashboardTabs() {
    const tabs = document.querySelectorAll('.dashboard-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-target');
            if (!targetId) return;

            document.querySelectorAll('.dashboard-view').forEach(view => {
                view.style.display = 'none';
            });
            tabs.forEach(t => t.classList.remove('active'));

            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.style.display = 'block';
                tab.classList.add('active');
            }

            if (targetId === 'citizenView' && map) {
                setTimeout(() => map.invalidateSize(), 200);
            }
        });
    });
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    setupDashboardTabs();
    setInterval(simulationTick, DEMO_SEGMENT_DURATION);

    // Citizen Green Button
    const greenBtn = document.getElementById('handoverBtn') || document.getElementById('pickupBtn');
    if (greenBtn) greenBtn.addEventListener('click', handleGarbagePickup);

    // Citizen Red Button
    const redBtn = document.getElementById('complainBtn') || document.getElementById('missedBtn');
    if (redBtn) redBtn.addEventListener('click', handleMissedPickup);

    // Helper AI Scan Button
    const aiScanBtn = document.getElementById('aiScanBtn');
    if (aiScanBtn) aiScanBtn.addEventListener('click', scanWasteWithHopperAI);
});

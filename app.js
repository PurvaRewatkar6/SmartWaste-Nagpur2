// SmartWaste Nagpur - Core Application Logic

// Predefined Coordinates & Routes
const citizenLat = 21.1290;
const citizenLng = 79.0565;
const DEMO_MISSED_PICKUP_TIMEOUT = 7000;
const DEMO_SEGMENT_DURATION = 1200;

const truckRoute = [
    [21.1270, 79.0528], [21.1270, 79.0540], [21.1278, 79.0540], [21.1278, 79.0554],
    [21.1290, 79.0565], // 4: Area 1 citizen collection
    [21.1302, 79.0565], [21.1302, 79.0582], [21.1315, 79.0582],
    [21.1315, 79.0568], // 8: Area 2 collection, different route shape
    [21.1324, 79.0568], [21.1324, 79.0550], [21.1311, 79.0550],
    [21.1311, 79.0537], // 12: Area 3 collection
    [21.1294, 79.0537], [21.1294, 79.0521], [21.1278, 79.0521],
    [21.1278, 79.0534], // 16: Area 4 collection
    [21.1270, 79.0528]
];

const evAutoRoute = [
    [21.1210, 79.0480], // 0: Depot
    [21.1210, 79.0510], // 1
    [21.1210, 79.0535], // 2
    [21.1235, 79.0535], // 3
    [21.1260, 79.0535], // 4
    [21.1260, 79.0565], // 5
    [21.1275, 79.0565], // 6
    [21.1290, 79.0565], // 7: Arrived at Citizen House / Complaint Spot!
    [21.1305, 79.0565], // 8
    [21.1320, 79.0565]  // 9: End
];

// App State Management
const state = {
    greenCredits: 120,
    verifiedCollections: 128,
    activeComplaintsCount: 0,
    complaints: [], // Array of { id, location, status }
    activeRequest: null, // "doorstep" or "missed_pickup"
    
    // Simulation state
    activeRoute: truckRoute,
    activeVehicleType: 'truck', // 'truck' or 'ev_auto'
    routeIndex: 0,
    citizenDistance: 9999,
    citizenRemainingRouteMeters: 0,
    collectionStopDistance: 9999,
    remainingRouteMeters: 0,
    simulationPaused: false,
    wasAtCitizen: false, // Citizen-arrival sound transition flag
    activeComplaintId: null,
    assignedVehicleId: null,
    
    // Sequential collection stops
    collectionPoints: [
        { name: "VNIT Chowk (Area 1)", routeIndex: 3, status: "pending" },
        { name: "Bajaj Nagar (Area 2 - Citizen)", routeIndex: 8, status: "pending" },
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

// Initialize Web Audio API
function initAudioOnInteraction() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
}

// Play arrival chime
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
    const R = 6371000; // Earth radius in meters
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
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('customAlertModal').style.display = 'flex';
    alertModalCallback = callback;
}

function closeAlertModal() {
    document.getElementById('customAlertModal').style.display = 'none';
    if (alertModalCallback) {
        alertModalCallback();
        alertModalCallback = null;
    }
}

function showCustomPrompt(title, message, placeholder, callback) {
    document.getElementById('promptTitle').innerText = title;
    document.getElementById('promptMessage').innerText = message;
    const input = document.getElementById('promptInput');
    input.value = '';
    input.placeholder = placeholder;
    document.getElementById('customPromptModal').style.display = 'flex';
    promptModalCallback = callback;
    setTimeout(() => input.focus(), 100);
}

function closePromptModal(isConfirm) {
    document.getElementById('customPromptModal').style.display = 'none';
    if (promptModalCallback) {
        const value = document.getElementById('promptInput').value.trim();
        promptModalCallback(isConfirm ? value : null);
        promptModalCallback = null;
    }
}

function showCustomConfirm(title, message, callback) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    document.getElementById('customConfirmModal').style.display = 'flex';
    confirmModalCallback = callback;
}

function closeConfirmModal(isConfirm) {
    document.getElementById('customConfirmModal').style.display = 'none';
    if (confirmModalCallback) {
        confirmModalCallback(isConfirm);
        confirmModalCallback = null;
    }
}

// Initialize Map
function initMap() {
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

function getRemainingRouteMeters(route, fromIndex, targetIndex) {
    if (targetIndex < fromIndex) return 0;
    let metres = 0;
    for (let i = fromIndex; i < targetIndex; i++) {
        metres += getDistanceMeters(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
    }
    return metres;
}

function isAtActiveTarget(target = getActiveTarget()) {
    return Boolean(target && state.collectionStopDistance <= 60);
}

function getCitizenRouteIndex(route) {
    return route.findIndex(point => point[0] === citizenLat && point[1] === citizenLng);
}

function getActiveMarker() {
    return state.activeVehicleType === 'ev_auto' ? evMarker : truckMarker;
}

// Render Stats & States across views
function renderUI() {
    // 1. Citizen Dashboard elements
    document.getElementById('citizenPoints').innerText = state.greenCredits;
    document.getElementById('verifiedCount').innerText = state.verifiedCollections + " Houses";
    document.getElementById('complaintCount').innerText = state.activeComplaintsCount;
    
    // Status text in Citizen View
    const collectionStatusEl = document.getElementById('collectionStatus');
    const creditBadgeEl = document.getElementById('creditBadge');

    // Citizen tracking and collection-stop readiness intentionally use separate distances.
    const currentPos = state.activeRoute[state.routeIndex];
    const activeTarget = getActiveTarget();
    state.citizenDistance = getDistanceMeters(currentPos[0], currentPos[1], citizenLat, citizenLng);
    state.collectionStopDistance = activeTarget
        ? getDistanceMeters(currentPos[0], currentPos[1], activeTarget.coordinates[0], activeTarget.coordinates[1])
        : 0;
    state.remainingRouteMeters = activeTarget
        ? getRemainingRouteMeters(state.activeRoute, state.routeIndex, activeTarget.routeIndex)
        : 0;
    const citizenRouteIndex = getCitizenRouteIndex(state.activeRoute);
    state.citizenRemainingRouteMeters = citizenRouteIndex >= state.routeIndex
        ? getRemainingRouteMeters(state.activeRoute, state.routeIndex, citizenRouteIndex)
        : 0;
    
    // Distance formatting (m and km)
    let distanceStr = "";
    const displayDistance = state.citizenDistance;
    if (displayDistance >= 1000) {
        distanceStr = (displayDistance / 1000).toFixed(2) + " km";
    } else {
        distanceStr = Math.round(displayDistance) + " m";
    }
    document.getElementById('distanceVal').innerText = distanceStr;

    // Reset completed status when vehicle moves away from citizen house
    if (state.activeRequest && state.activeRequest.startsWith("completed") && state.citizenDistance > 60) {
        state.activeRequest = null;
    }

    // Citizen ETA follows the citizen house, never the scheduled collection target.
    let etaText = "Checking...";
    if (state.citizenDistance <= 60) {
        etaText = "ARRIVED";
    } else if (citizenRouteIndex < 0) {
        etaText = "Checking...";
    } else if (state.routeIndex > citizenRouteIndex) {
        etaText = "Moving Away";
    } else {
        const mins = Math.max(1, Math.ceil(state.citizenRemainingRouteMeters / 120));
        etaText = mins + (mins === 1 ? " Min" : " Mins");
    }
    document.getElementById('eta').innerText = etaText;

    // Alert only on the transition into the citizen's geo-fence.
    if (etaText === "ARRIVED") {
        const audioBanner = document.getElementById('audioBanner');
        audioBanner.innerText = `${state.activeVehicleType === 'truck' ? 'VEHICLE' : 'MINI-EV'} ARRIVED AT YOUR DOORSTEP!`;
        audioBanner.style.display = 'block';

        if (!state.wasAtCitizen) {
            playAutoSound();
        }
        state.wasAtCitizen = true;
    } else {
        document.getElementById('audioBanner').style.display = 'none';
        state.wasAtCitizen = false;
    }

    // Logic for pickup status values
    if (state.activeRequest === null) {
        collectionStatusEl.innerText = "⏳ Pending Pickup";
        collectionStatusEl.style.color = "#e67e22";
        creditBadgeEl.innerText = "";
    } else if (state.activeRequest === "collection" || state.activeRequest === "doorstep" || state.activeRequest === "missed_pickup") {
        if (isAtActiveTarget(activeTarget)) {
            collectionStatusEl.innerText = "⏳ Vehicle Nearby - AI Hopper Ready";
            collectionStatusEl.style.color = "#f39c12";
        } else {
            if (state.activeVehicleType === 'ev_auto' && getActiveComplaint() && getActiveComplaint().status === 'enroute') {
                collectionStatusEl.innerText = "EV Auto En Route (Emergency Dispatch)";
                collectionStatusEl.style.color = "#d35400";
            } else if (state.activeRequest === "missed_pickup") {
                // Find if dispatched
                const activeComplaint = getActiveComplaint();
                if (activeComplaint) {
                    collectionStatusEl.innerText = "🚨 EV Auto En Route (Emergency Dispatch)";
                    collectionStatusEl.style.color = "#d35400";
                } else {
                    collectionStatusEl.innerText = "⚠️ Missed Pickup Logged (Pending Dispatch)";
                    collectionStatusEl.style.color = "#e74c3c";
                }
            } else {
                collectionStatusEl.innerText = "⏳ Doorstep Request Logged";
                collectionStatusEl.style.color = "#3498db";
            }
        }
    } else if (state.activeRequest === "completed_segregated") {
        collectionStatusEl.innerText = "✅ Picked Up (+20 Green Credits)";
        collectionStatusEl.style.color = "#27ae60";
        creditBadgeEl.innerText = "(+20 Pts Added 🎉)";
        creditBadgeEl.style.color = "#27ae60";
    } else if (state.activeRequest === "completed_mixed") {
        collectionStatusEl.innerText = "❌ Picked Up (0 Credits - Mixed Waste)";
        collectionStatusEl.style.color = "#e74c3c";
        creditBadgeEl.innerText = "(0 Points - Mixed Waste ⚠️)";
        creditBadgeEl.style.color = "#e74c3c";
    }

    // 2. Worker / Hopper AI Dashboard elements
    const aiScanStatusEl = document.getElementById('aiScanStatus');
    const workerInstructionEl = document.getElementById('workerInstruction');

    if ((state.activeRequest === "collection" || state.activeRequest === "doorstep") && isAtActiveTarget(activeTarget)) {
        aiScanStatusEl.innerText = "Ready (Standard Doorstep)";
        aiScanStatusEl.style.color = "#f39c12";
        workerInstructionEl.innerHTML = "<b>Standard Pickup at House Spot:</b> Dump waste into hopper and trigger camera scan.";
    } else if (state.activeRequest === "missed_pickup" && isAtActiveTarget(activeTarget) && state.activeVehicleType === 'ev_auto') {
        aiScanStatusEl.innerText = "Ready (Emergency Mini-EV)";
        aiScanStatusEl.style.color = "#d35400";
        workerInstructionEl.innerHTML = "<b>Emergency Pickup at Complaint Spot:</b> Dump waste and trigger camera scan.";
    } else {
        if (state.activeRequest === "completed_segregated") {
            aiScanStatusEl.innerText = "✅ Segregated (+20 Pts)";
            aiScanStatusEl.style.color = "#27ae60";
        } else if (state.activeRequest === "completed_mixed") {
            aiScanStatusEl.innerText = "❌ Mixed Waste (0 Pts)";
            aiScanStatusEl.style.color = "#e74c3c";
        } else {
            aiScanStatusEl.innerText = "Waiting Hopper Dump...";
            aiScanStatusEl.style.color = "#8e44ad";
            workerInstructionEl.innerText = "The wide-angle overhead camera automatically snaps waste images as the driver tips bins into the truck.";
        }
    }

    // 3. NMC Admin List update
    const incidentListEl = document.getElementById('incidentList');
    if (state.complaints.length === 0) {
        incidentListEl.innerHTML = "<p><i>No pending missed pickup requests.</i></p>";
    } else {
        incidentListEl.innerHTML = "";
        state.complaints.forEach(complaint => {
            const li = document.createElement('li');
            let statusBadge = '';
            let actionBtn = '';

            if (complaint.status === 'pending') {
                statusBadge = `<span class="dispatch-status status-pending">Pending Dispatch</span>`;
                actionBtn = `<button class="dispatch-btn" onclick="adminDispatchEV(${complaint.id})">Dispatch Eco Mini-EV</button>`;
            } else if (complaint.status === 'enroute') {
                statusBadge = `<span class="dispatch-status status-enroute">Mini-EV En Route</span>`;
            } else if (complaint.status === 'resolved') {
                statusBadge = `<span class="dispatch-status status-resolved">Resolved</span>`;
            }

            li.innerHTML = `
                <div>
                    <b>Complaint #${complaint.id}</b> - Loc: <i>${complaint.location}</i>
                    <div style="margin-top: 4px;">Status: ${statusBadge}</div>
                </div>
                <div>${actionBtn}</div>
            `;
            incidentListEl.appendChild(li);
        });
    }

    // Active Complaint Panel in Citizen View
    const activeComplaintPanel = document.getElementById('activeComplaintPanel');
    if (state.complaints.length > 0) {
        const complaint = getActiveComplaint() || state.complaints[state.complaints.length - 1];
        activeComplaintPanel.style.display = 'block';
        document.getElementById('complaintIdVal').innerText = "#" + complaint.id;
        document.getElementById('complaintLocationVal').innerText = complaint.location;

        const statusValEl = document.getElementById('complaintStatusVal');
        const headerEl = document.getElementById('complaintHeader');

        if (complaint.status === 'pending') {
            statusValEl.innerText = "Pending Dispatch";
            statusValEl.className = "dispatch-status status-pending";
            headerEl.innerText = "✓ Complaint Registered Successfully";
            headerEl.style.color = "#856404";
            activeComplaintPanel.style.background = "#fff3cd";
            activeComplaintPanel.style.borderColor = "#ffeeba";
        } else if (complaint.status === 'enroute') {
            statusValEl.innerText = "En Route — Emergency Dispatch";
            statusValEl.className = "dispatch-status status-enroute";
            headerEl.innerText = "✓ Eco Mini-EV #EV-02 Assigned";
            headerEl.style.color = "#a04000";
            activeComplaintPanel.style.background = "#fdebd0";
            activeComplaintPanel.style.borderColor = "#fadbd8";
        } else if (complaint.status === 'resolved') {
            statusValEl.innerText = "Completed";
            statusValEl.className = "dispatch-status status-resolved";
            headerEl.innerText = "✓ Complaint Resolved Successfully";
            headerEl.style.color = "#1e8449";
            activeComplaintPanel.style.background = "#d4efdf";
            activeComplaintPanel.style.borderColor = "#c3e6cb";
        }
    } else {
        activeComplaintPanel.style.display = 'none';
    }

    // 4. Update Simulation Tracking Info Panels (Unified NMC states)
    let statusVal = "En Route";
    let targetAreaVal = "None";
    let nextAreaVal = "None";
    let completedAreasVal = "None";

    if (state.activeVehicleType === 'ev_auto') {
        const activeComplaint = getActiveComplaint();
        if (state.activeRequest === "completed_segregated" || state.activeRequest === "completed_mixed") {
            statusVal = "Completed";
        } else if (state.simulationPaused && isAtActiveTarget(activeTarget)) {
            statusVal = "ARRIVED / Ready for Collection";
        } else if (state.collectionStopDistance <= 200) {
            statusVal = "Approaching / Near Pickup";
        } else {
            statusVal = "En Route";
        }
        targetAreaVal = activeComplaint ? `${activeComplaint.location} (Complaint)` : "Citizen Spot (Emergency)";
        nextAreaVal = "Depot (Route End)";
        completedAreasVal = "None (Emergency Route)";
    } else {
        // Standard Truck
        if (state.activeRequest === "completed_segregated" || state.activeRequest === "completed_mixed") {
            statusVal = "Collected";
        } else if (state.simulationPaused && isAtActiveTarget(activeTarget)) {
            statusVal = "ARRIVED / Ready for Collection";
        } else {
            // Check if near destination (any pending stop)
            const nextPendingStop = activeTarget && activeTarget.stop;
            if (nextPendingStop) {
                const stopLatLng = truckRoute[nextPendingStop.routeIndex];
                const distToStop = getDistanceMeters(currentPos[0], currentPos[1], stopLatLng[0], stopLatLng[1]);
                if (distToStop <= 200) {
                    statusVal = "Approaching / Near Pickup";
                } else {
                    statusVal = "En Route";
                }
            } else {
                statusVal = "En Route";
            }
        }

        // Find completed stops
        const completedStops = state.collectionPoints.filter(pt => pt.status === 'completed');
        if (completedStops.length > 0) {
            completedAreasVal = completedStops.map(pt => pt.name).join(", ");
        } else {
            completedAreasVal = "None";
        }

        // Find current target stop (first pending)
        const currentTargetStop = state.collectionPoints.find(pt => pt.status === 'pending');
        if (currentTargetStop) {
            targetAreaVal = currentTargetStop.name;
            
            // Find next stop (second pending)
            const pendingStops = state.collectionPoints.filter(pt => pt.status === 'pending');
            if (pendingStops.length > 1) {
                nextAreaVal = pendingStops[1].name;
            } else {
                nextAreaVal = "Returning to Depot";
            }
        } else {
            targetAreaVal = "Returning to Depot";
            nextAreaVal = "VNIT Chowk (Area 1) (New Cycle)";
        }
    }

    // Write to DOM (Citizen View)
    document.getElementById('trackStatus').innerText = statusVal;
    document.getElementById('trackStatus').style.color = state.simulationPaused ? "#e74c3c" : "#2980b9";
    document.getElementById('trackCurrentArea').innerText = targetAreaVal;
    document.getElementById('trackNextArea').innerText = nextAreaVal;
    document.getElementById('trackCompletedAreas').innerText = completedAreasVal;

    // Write to DOM (Admin View)
    document.getElementById('adminTrackStatus').innerText = statusVal;
    document.getElementById('adminTrackStatus').style.color = state.simulationPaused ? "#e74c3c" : "#2980b9";
    document.getElementById('adminTrackCurrentArea').innerText = targetAreaVal;
    document.getElementById('adminTrackNextArea').innerText = nextAreaVal;
    document.getElementById('adminTrackCompletedAreas').innerText = completedAreasVal;
}

// Map movement simulation tick
function simulationTick() {
    if (state.simulationPaused) return;

    state.routeIndex = (state.routeIndex + 1) % state.activeRoute.length;
    
    // Update marker on map
    const newLatLng = state.activeRoute[state.routeIndex];
    getActiveMarker().setLatLng(newLatLng);
    map.panTo(newLatLng);

    // Reset collection points when truck loops back to index 0
    if (state.activeVehicleType === 'truck' && state.routeIndex === 0) {
        state.collectionPoints.forEach(pt => pt.status = "pending");
        state.activeRequest = null;
    }

    // If EV auto finishes its route (loops back to index 0), switch back to standard truck route to reset the simulation
    if (state.activeVehicleType === 'ev_auto' && state.routeIndex === 0) {
        switchToVehicle('truck');
        return;
    }

    // Check if standard truck landed on a pending stop coordinate
    if (state.activeVehicleType === 'truck') {
        const currentStop = state.collectionPoints.find(pt => pt.routeIndex === state.routeIndex);
        if (currentStop && currentStop.status === "pending") {
            state.simulationPaused = true;
            state.activeRequest = "collection";
        }
    }

    // Check if EV Auto landed on the arrival spot
    if (state.activeVehicleType === 'ev_auto' && state.routeIndex === 7) {
        const activeComplaint = getActiveComplaint();
        if (activeComplaint) {
            state.simulationPaused = true;
            state.activeRequest = "missed_pickup";
        }
    }

    renderUI();
}

// Switch between Truck and EV Auto map routing
function switchToVehicle(vehicleType) {
    state.activeVehicleType = vehicleType;
    state.routeIndex = 0;
    state.simulationPaused = false; // Ensure simulation resumes
    state.wasAtCitizen = false; // Reset citizen arrival transition
    
    if (vehicleType === 'truck') {
        state.activeRoute = truckRoute;
    } else if (vehicleType === 'ev_auto') {
        state.activeRoute = evAutoRoute;
    }
    
    // Immediately snap marker and center map
    const startLatLng = state.activeRoute[0];
    const activeMarker = getActiveMarker();
    if (activeMarker) {
        activeMarker.setLatLng(startLatLng);
    }
    if (map) {
        map.panTo(startLatLng);
    }
    
    if (vehicleType === 'truck') {
        if (evMarker && map.hasLayer(evMarker)) map.removeLayer(evMarker);
        if (truckMarker && !map.hasLayer(truckMarker)) truckMarker.addTo(map);
        truckMarker.setLatLng(startLatLng).bindPopup("Main Truck #04");
        
        map.removeLayer(routePolyline);
        routePolyline = L.polyline(truckRoute, { color: '#27ae60', weight: 4, dashArray: '5, 5' }).addTo(map);
        
        document.getElementById('activeVehicleLabel').innerHTML = "📡 Active Tracking: Standard Garbage Truck #04";
        document.getElementById('activeVehicleLabel').style.background = "#ebf5fb";
        document.getElementById('activeVehicleLabel').style.color = "#2980b9";
    } else if (vehicleType === 'ev_auto') {
        if (truckMarker && map.hasLayer(truckMarker)) map.removeLayer(truckMarker);
        if (evMarker && !map.hasLayer(evMarker)) evMarker.addTo(map);
        evMarker.setLatLng(startLatLng).bindPopup("<b>Eco Mini-EV Auto #EV-02</b><br>Express Missed Pickup Unit");
        
        map.removeLayer(routePolyline);
        routePolyline = L.polyline(evAutoRoute, { color: '#e74c3c', weight: 4, dashArray: '5, 5' }).addTo(map);
        
        document.getElementById('activeVehicleLabel').innerHTML = "🚨 <b>Express Tracking:</b> Eco Mini-EV Auto #EV-02 (Emergency Dispatch)";
        document.getElementById('activeVehicleLabel').style.background = "#fdebd0";
        document.getElementById('activeVehicleLabel').style.color = "#d35400";
    }
    
    renderUI();
}

// Citizen requests doorstep pickup (Geo-Check)
function citizenMarkHandover() {
    if (state.citizenDistance <= 60) {
        state.activeRequest = "doorstep";
        renderUI();
        showCustomAlert("🛡️ Geo-Fence Verified", `Geo-fence verified successfully (${state.citizenDistance}m)! Pickup request is active. Please dump waste into the vehicle hopper.`);
    } else {
        showCustomAlert("🚫 Geo-Fence Restriction", `Vehicle is too far away (${state.citizenDistance}m). You must stand near the vehicle (< 60m) when it arrives to log a pickup.`);
    }
}

// Citizen files a Missed Pickup Complaint
function reportMissedGarbage() {
    showCustomPrompt(
        "Report Missed Pickup", 
        "Enter your Street / House Number in Bajaj Nagar:", 
        "e.g. Plot 42, West High Court Road", 
        (location) => {
            if (!location) return; // User cancelled
            
            // Create complaint object
            const newComplaintId = state.complaints.length + 1;
            const newComplaint = {
                id: newComplaintId,
                location: location,
                status: 'pending'
            };
            
            state.complaints.push(newComplaint);
            state.activeComplaintsCount++;
            state.activeComplaintId = newComplaint.id;
            
            // Citizen active request updates to missed pickup state
            state.activeRequest = "missed_pickup";
            
            renderUI();
            showCustomAlert("📩 Request Registered", `Complaint registered for "${location}". NMC dispatch notified.`);
        }
    );
}

// Admin dispatches Emergency EV Auto
function adminDispatchEV(complaintId) {
    const complaint = state.complaints.find(c => c.id === complaintId);
    if (!complaint || complaint.status !== 'pending') return;

    showCustomConfirm(
        "Dispatch Emergency EV",
        `Do you want to dispatch Eco Mini-EV Auto #EV-02 dynamically to "${complaint.location}"?`,
        (confirmed) => {
            if (!confirmed) return;

            complaint.status = 'enroute';
            state.activeComplaintId = complaint.id;
            state.assignedVehicleId = 'EV-02';
            
            // Switch tracking to Mini-EV
            switchToVehicle('ev_auto');
            
            showCustomAlert("✓ Eco Mini-EV #EV-02 Assigned", `Status: En Route — Emergency Dispatch\n\nEco Mini-EV #EV-02 has been dispatched dynamically to "${complaint.location}".`);
        }
    );
}

// Automated Hopper AI classification logic
function triggerHopperAI(type) {
    if (state.activeRequest !== "collection" && state.activeRequest !== "doorstep" && state.activeRequest !== "missed_pickup") {
        showCustomAlert("Standby", "Overhead AI camera ready. Waiting for a waste dump request to trigger auto-detection.");
        return;
    }

    if (!isAtActiveTarget()) {
        showCustomAlert("AI Camera Error", "Overhead scan failed. Vehicle is not stopped at a pickup spot.");
        return;
    }

    const camFeed = document.getElementById('camFeedText');
    const camSub = document.getElementById('camSubText');

    camFeed.innerText = "[ 📸 SNAPSHOT CAPTURED BY VEHICLE CAMERA ]";
    camSub.innerText = "Processing YOLOv8 Neural Network Analysis...";

    setTimeout(() => {
        const isCitizenSpot = (state.activeVehicleType === 'truck' && state.routeIndex === 8) || 
                              (state.activeVehicleType === 'ev_auto' && state.routeIndex === 7);
        
        // Resolve standard truck collection point
        if (state.activeVehicleType === 'truck') {
            const currentStop = state.collectionPoints.find(pt => pt.routeIndex === state.routeIndex);
            if (currentStop) {
                currentStop.status = "completed";
            }
        }

        // If it was an active missed pickup route, resolve it
        const activeComplaint = getActiveComplaint();
        if (activeComplaint) {
            activeComplaint.status = 'resolved';
            if (state.activeComplaintsCount > 0) state.activeComplaintsCount--;
        }

        // Resume simulation
        state.simulationPaused = false;
        const wasEmergencyCollection = state.activeVehicleType === 'ev_auto';
        
        if (type === 'segregated') {
            if (isCitizenSpot) {
                state.greenCredits += 20;
                state.activeRequest = "completed_segregated";
            } else {
                state.activeRequest = null;
            }
            state.verifiedCollections++;

            camFeed.innerText = "[ ✅ AI CONFIRMED: CLEAN WET/DRY SEGREGATION ]";
            camSub.innerText = "Confidence: 96.8% | Auto-Processed";

            renderUI();
            if (wasEmergencyCollection) setTimeout(() => switchToVehicle('truck'), 1000);
            if (isCitizenSpot) {
                showCustomAlert("🎉 AI Detection Complete", "Overhead camera detected clean segregated waste!\n\n+20 Green Credits credited to the citizen instantly. Simulation resuming.");
            } else {
                showCustomAlert("🎉 AI Detection Complete", "Overhead camera detected clean segregated waste!\n\nCollection recorded. Simulation resuming.");
            }
        } else {
            if (isCitizenSpot) {
                state.activeRequest = "completed_mixed";
            } else {
                state.activeRequest = null;
            }
            state.verifiedCollections++;

            camFeed.innerText = "[ ❌ AI CONFIRMED: MIXED GARBAGE DETECTED ]";
            camSub.innerText = "Confidence: 92.1% | Logged With 0 Green Points";

            renderUI();
            if (wasEmergencyCollection) setTimeout(() => switchToVehicle('truck'), 1000);
            if (isCitizenSpot) {
                showCustomAlert("⚠️ AI Detection Complete", "Overhead camera detected mixed garbage!\n\n0 Green Credits awarded. Logged in NMC compliance system. Simulation resuming.");
            } else {
                showCustomAlert("⚠️ AI Detection Complete", "Overhead camera detected mixed garbage!\n\nCollection recorded as mixed. Simulation resuming.");
            }
        }
    }, 800);
}

// Reset/Restart Demo simulation cycle manually (useful for testing)
function resetDemoSimulation() {
    state.greenCredits = 120;
    state.verifiedCollections = 128;
    state.activeRequest = null;
    state.complaints = [];
    state.activeComplaintsCount = 0;
    state.activeComplaintId = null;
    state.assignedVehicleId = null;
    state.simulationPaused = false;
    
    // Reset collection points
    state.collectionPoints.forEach(pt => pt.status = "pending");
    
    switchToVehicle('truck');
    renderUI();
    showCustomAlert("System Reset", "Demo state and vehicles have been reset to default values.");
}

// View Switcher logic
function switchView(view) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    document.getElementById(view + 'View').classList.add('active');
    
    // Find matching button to apply active class
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        if (view === 'citizen' && btn.innerText.includes('Citizen')) btn.classList.add('active');
        if (view === 'worker' && btn.innerText.includes('Vehicle AI')) btn.classList.add('active');
        if (view === 'admin' && btn.innerText.includes('NMC Control')) btn.classList.add('active');
    });

    renderUI();
    if (view === 'citizen' && map) {
        setTimeout(() => map.invalidateSize(), 0);
    }
}

// Initialization on DOM Load
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    renderUI();
    
    // Start simulation ticks every 3 seconds
    setInterval(simulationTick, 3000);
});

console.log("Combined script loaded!");

// Configuration for WebSocket endpoints
const imageServerUrl = "wss://node-red.xyz/ws/image"; // Adjust to your image WebSocket endpoint
const sensorServerUrl = "wss://node-red.xyz/ws/sensorData"; // Adjust to your Node-RED WebSocket endpoint

// WebSocket instances
let imageSocket;
let sensorSocket;

// Image-related variables
let currentImageMetadata = null;

// Sensor-related variables
let pingInterval;
let intervalId = null;
let heartbeatTimeout;
let soilMoisture;
let timestamp;
let interval;




function displayImage(imageDataOrUrl, contentTypeFromArgs, filenameFromArgs, isUrl = false) {
    const imgElement = document.getElementById('myImageElement'); 
    const captionElement = document.getElementById('imageCaption');
    const errorElement = document.getElementById('imageError');

    if (errorElement) errorElement.textContent = ""; 
    if (!imgElement) {
        console.error("Element #myImageElement niet gevonden!");
        if (errorElement) errorElement.textContent = "Fout: HTML element #myImageElement ontbreekt.";
        return;
    }
    imgElement.src = ""; // Wis direct

    if (isUrl) { // Voor de "laatste afbeelding" die via URL komt
        imgElement.src = imageDataOrUrl; 
        imgElement.alt = filenameFromArgs || "Geladen afbeelding";
        imgElement.onerror = () => { 
            console.error(`Fout bij laden afbeelding van URL: ${imageDataOrUrl}`);
            if (captionElement) captionElement.textContent = `Fout bij laden: ${filenameFromArgs || 'onbekende afbeelding'}`;
            if (errorElement) errorElement.textContent = `Fout: Kon afbeelding niet laden van ${imageDataOrUrl}`;
            imgElement.src = "";
        };

        // Update caption specifiek voor de URL-geladen afbeelding
        if (captionElement && lastRequestedImageDetails) {
            let meta = lastRequestedImageDetails; // Gebruik de opgeslagen details
            let displayFilename = meta.filename || 'N/A';
            let displaySize = meta.size || 0;
            let displayMac = meta.mac || 'N/A';
            // Bepaal timestamp: prioriteit aan client-side event, dan server opslagtijd, dan browser tijd
            let tsSource = meta.timestamp_event ? meta.timestamp_event * 1000 : (meta.server_stored_at ? new Date(meta.server_stored_at.replace(" ", "T") + "Z").getTime() : meta.timestamp);
            if (!tsSource) tsSource = Date.now();
            let displayTimestamp = new Date(tsSource);

            captionElement.innerHTML = `
                <strong>Bestand:</strong> ${displayFilename}<br>
                <strong>Grootte:</strong> ${(displaySize / 1024).toFixed(2)} KB<br>
                <strong>MAC:</strong> ${displayMac}<br>
                <strong>Tijdstip (event/opslag):</strong> ${displayTimestamp.toLocaleString("nl-NL", { dateStyle: 'short', timeStyle: 'medium' })}
            `;
        } else if (captionElement) {
            captionElement.textContent = `Laden: ${filenameFromArgs || 'afbeelding'}...`;
        }

    } else { // Voor LIVE binaire afbeeldingen
        try {
            const imageBlob = new Blob([imageDataOrUrl], { type: contentTypeFromArgs || 'image/jpeg' });
            const imageUrlFromBlob = URL.createObjectURL(imageBlob);
            imgElement.src = imageUrlFromBlob;
            imgElement.alt = filenameFromArgs || "Ontvangen afbeelding";
            imgElement.onload = () => { URL.revokeObjectURL(imageUrlFromBlob); };
            imgElement.onerror = () => { /* ... error handling ... */ };

            // Update caption specifiek voor de live binaire afbeelding
            if (captionElement && currentLiveImageMetadata) {
                let meta = currentLiveImageMetadata;
                let displayFilename = meta.filename || 'N/A';
                let displaySize = meta.size || (imageDataOrUrl instanceof ArrayBuffer ? imageDataOrUrl.byteLength : 0);
                let displayMac = meta.mac || 'N/A';
                let displayTimestamp = new Date(meta.timestamp || Date.now()); // Gebruik Node-RED timestamp

                captionElement.innerHTML = `
                    <strong>Bestand (Live):</strong> ${displayFilename}<br>
                    <strong>Grootte:</strong> ${(displaySize / 1024).toFixed(2)} KB<br>
                    <strong>MAC:</strong> ${displayMac}<br>
                    <strong>Tijdstip (ontvangst):</strong> ${displayTimestamp.toLocaleString("nl-NL", { dateStyle: 'short', timeStyle: 'medium' })}
                `;
            } else if (captionElement) {
                captionElement.textContent = `Live afbeelding geladen (details onbekend).`;
            }

        } catch (e) { /* ... error handling ... */ return; }
    }
}

// --- WebSocket Functies (blijven grotendeels hetzelfde) ---
function connectImageWebSocket() {
    imageSocket = new WebSocket(imageServerUrl);
    imageSocket.binaryType = 'arraybuffer';

    imageSocket.onopen = () => {
        console.log("Verbonden met Image WebSocket server: " + imageServerUrl);
        currentLiveImageMetadata = null; 
        lastRequestedImageDetails = null; 

        const captionElement = document.getElementById('imageCaption');
        if(captionElement) captionElement.textContent = "Opvragen laatste afbeelding...";
        // ... (setTimeout voor request_last_image zoals voorheen) ...
        setTimeout(() => {
            if (imageSocket && imageSocket.readyState === WebSocket.OPEN) {
                try {
                    imageSocket.send(JSON.stringify({ type: "request_last_image" }));
                    console.log("Request 'request_last_image' verzonden.");
                } catch (e_send) { /* ... */ }
            } else { /* ... */ }
        }, 100); 
    };

    imageSocket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) { // Voor LIVE image binaire data
            console.log(`WebSocket: Binaire data (LIVE image) ontvangen (${event.data.byteLength} bytes)`);
            if (currentLiveImageMetadata) { 
                displayImage(event.data, currentLiveImageMetadata.contentType, currentLiveImageMetadata.filename, false);
                currentLiveImageMetadata = null; 
            } else { /* ... */ }
        } else if (typeof event.data === 'string') {
            try {
                const data = JSON.parse(event.data);
                console.log("WebSocket JSON data ontvangen:", data);

                if (data.type === "image_metadata_ws") { // Voor LIVE image metadata
                    console.log("WebSocket: LIVE Afbeelding metadata ontvangen:", data.filename);
                    currentLiveImageMetadata = data; // Sla ALLE live metadata op
                    // ... (UI update voor laden live image) ...
                } else if (data.type === "last_image_details_ws") { 
                    console.log(`WebSocket: Details voor LAATSTE afbeelding (${data.filename}). URL: ${data.imageUrl}`);
                    // Sla ALLE details van de laatste afbeelding op
                    lastRequestedImageDetails = data; 
                    if (data.imageUrl) {
                        // De displayImage functie gebruikt nu lastRequestedImageDetails voor de caption
                        displayImage(data.imageUrl, data.contentType, data.filename, true); 
                    } else { /* ... error handling ... */ }
                } else if (data.type === "image_error_ws" || data.type === "last_image_error_ws" || data.type === "last_image_none_ws") {
                    // ... (error handling, reset beide metadata objecten) ...
                    currentLiveImageMetadata = null; 
                    lastRequestedImageDetails = null;
                } // ...
            } catch (error) { /* ... */ }
        } // ...
    };

    imageSocket.onclose = (event) => { 
        console.log("Image WebSocket verbinding verbroken.");
        currentLiveImageMetadata = null;
        lastRequestedImageDetails = null;
        setTimeout(connectImageWebSocket, 5000); 
    };
    imageSocket.onerror = (error) => { /* ... */ };
}


// Functie om expliciet de laatste afbeelding op te vragen (kan aan een knop gekoppeld worden)
function requestLastImageManually() {
    if (imageSocket && imageSocket.readyState === WebSocket.OPEN) {
        console.log("Handmatig verzoek voor laatste afbeelding versturen...");
        imageSocket.send(JSON.stringify({ type: "request_last_image" }));
        
        const imgElement = document.getElementById('myImageElement');
        if(imgElement) imgElement.src = ""; 
        const captionElement = document.getElementById('imageCaption');
        if(captionElement) captionElement.textContent = "Opvragen laatste afbeelding...";
        const errorElement = document.getElementById('imageError');
        if(errorElement) errorElement.textContent = "";
    } else {
        console.warn("Kan laatste afbeelding niet handmatig opvragen, WebSocket niet open. Probeer te verbinden...");
        // Roep connectImageWebSocket aan; die zal bij onopen de request sturen.
        connectImageWebSocket(); 
    }
}

// Start de WebSocket verbinding wanneer de pagina laadt
window.addEventListener('load', connectImageWebSocket);

// Voorbeeld HTML:
/*
<button onclick="requestLastImageManually()">Laad Laatste Afbeelding (Handmatig)</button>
<div>
    <img id="myImageElement" alt="Wachten op afbeelding..." style="max-width: 80%; max-height: 70vh; display: block; margin: auto;">
    <div id="imageCaption" style="text-align: center; margin-top: 10px;"></div>
    <div id="imageError" style="color: red; text-align: center; margin-top: 10px;"></div>
</div>
*/

// --- Sensor Handling Functions ---
function connectSensorWebSocket() {
    sensorSocket = new WebSocket(sensorServerUrl);

    sensorSocket.onopen = () => {
        console.log("Connected to Node-RED WebSocket server!");
        sensorSocket.send(JSON.stringify({ type: "get_latest_data" }));
        console.log("Request for latest data sent");

        pingInterval = setInterval(() => {
            if (sensorSocket.readyState === WebSocket.OPEN) {
                sensorSocket.send(JSON.stringify({ type: "ping" }));
                console.log("Ping sent");
            }
        }, 30000);
    };

    sensorSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === "pong") {
                console.log("Pong received from server");
                return;
            }

            if (data.type === "node-red: message recieved") {
                console.log("Node-RED: irrigation start message received");
                return;
            }

            if (data.status) {
                console.log("ESP DataHub online");
                document.getElementById("esp-datahub").innerText = "ESP-DataHub Online...";
                resetHeartbeatTimeout();
                return;
            }

            console.log("Received sensor data:", data);

            if (data.sensor_data) {
                const device = data.sensor_data.device;
                const readableTimestamp = new Date(data.sensor_data.timestamp).toLocaleString("nl-NL");
                timestamp = data.sensor_data.timestamp;
                soilMoisture = data.sensor_data.soil.moisture;
                const soilTemperature = data.sensor_data.soil.temperature;
                const batteryStatus = data.sensor_data.battery.status;
                const batteryVoltage = data.sensor_data.battery.voltage;
                const temperature = data.sensor_data.temperature;
                const readableInterval = Math.round(data.sensor_data.deepsleep / 60);
                interval = data.sensor_data.deepsleep + 15;

                console.log("Device:", device);
                console.log("Timestamp:", timestamp);
                console.log("Soil Moisture:", soilMoisture, "Type:", typeof soilMoisture);
                console.log("Soil Temperature:", soilTemperature);
                console.log("Outside Temperature:", temperature);
                console.log("Battery Status:", batteryStatus);
                console.log("Battery Voltage:", batteryVoltage);
                console.log("Interval:", interval, "seconds");
                console.log("Interval in minutes:", readableInterval, "minutes");

                document.getElementById("soil-moisture").innerText = `Soil moisture: ${soilMoisture}%`;
                document.getElementById("soil-temperature").innerText = `Soil temperature: ${soilTemperature}°C`;
                document.getElementById("temperature").innerText = `Outside temperature: ${temperature}°C`;
                document.getElementById("battery-status").innerText = `Battery status: ${batteryStatus}`;
                document.getElementById("battery-voltage").innerText = `Battery voltage: ${batteryVoltage}V`;
                document.getElementById("soil-node").innerText = `Device: ${device}`;
                document.getElementById("time").innerText = readableTimestamp;
                document.getElementById("readable-interval").innerText = `Message interval: ${readableInterval} min`;

                showImageBasedOnValue(soilMoisture);
                startProgressRing(interval);
            } else {
                console.log("Unknown message format, no sensor_data present.");
            }
        } catch (error) {
            console.error("Error processing sensor data:", error);
        }
    };

    sensorSocket.onclose = () => {
        console.log("Sensor WebSocket connection closed. Reconnecting...");
        clearInterval(pingInterval);
        setTimeout(connectSensorWebSocket, 5000);
    };

    sensorSocket.onerror = (error) => {
        console.error("Sensor WebSocket error:", error);
    };
}

function resetHeartbeatTimeout() {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = setTimeout(() => {
        console.error("No ESP-DataHub heartbeat confirmation within 70 seconds.");
        document.getElementById("esp-datahub").innerText = "ESP-DataHub Offline...";
    }, 70000);
}

function showImageBasedOnValue(value) {
    const imageContainer = document.getElementById('image-container');
    imageContainer.innerHTML = '';

    let imagePath = '';
    let message = '';
    const answerElement = document.getElementById("answer");

    if (value >= 75) {
        message = "No, too much water!";
        imagePath = 'images/06-veggies-drunk.png';
    } else if (value > 60 && value <= 75) {
        message = "No, we are happy!";
        imagePath = 'images/01-veggies-excited-very-wet.png';
    } else if (value > 50 && value <= 60) {
        message = "No, we are okay!";
        imagePath = 'images/02-veggies-happy-wet.png';
    } else if (value >= 35 && value <= 50) {
        message = "Man, we are thirsty!";
        imagePath = 'images/04-veggies-thirsty-dry.png';
    } else if (value <= 35) {
        message = "Man, we are dying!";
        imagePath = 'images/05-veggies-dieing-very-dry.png';
    } else {
        message = "Invalid measurement";
        imagePath = 'images/white.png';
    }

    answerElement.innerText = message;
    answerElement.style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000";

    const img = document.createElement('img');
    img.src = imagePath;
    img.alt = 'Soil moisture level';
    imageContainer.appendChild(img);
}

function startIrrigation() {
    if (sensorSocket && sensorSocket.readyState === WebSocket.OPEN) {
        const message = {
            type: "irrigation_command",
            action: "start",
            timestamp: new Date().toISOString()
        };
        sensorSocket.send(JSON.stringify(message));
        console.log("Irrigation command sent:", message);
    } else {
        console.warn("Sensor WebSocket is not open. Cannot send message.");
    }
}

function startProgressRing(interval) {
    let elapsedTime = compareTimestamp(timestamp);

    const progressRing = document.querySelector('.progress-ring');
    const offlineMessage = document.querySelector('.offline-message');

    if (!progressRing || !offlineMessage) {
        console.error("Progress ring or offline message element not found!");
        return;
    }

    if (elapsedTime > interval) {
        console.log("Elapsed time exceeds interval, showing offline message");
        progressRing.style.display = 'none';
        offlineMessage.style.display = 'block';
        return;
    }

    progressRing.style.display = 'block';
    offlineMessage.style.display = 'none';

    const circle = document.querySelector('.progress-ring-circle');
    if (!circle) {
        console.error("Circle element not found!");
        return;
    }

    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;

    const startTime = Date.now();

    if (intervalId !== null) {
        clearInterval(intervalId);
    }

    function updateProgress() {
        const now = Date.now();
        const elapsedSeconds = (now - startTime) / 1000;
        const totalElapsed = elapsedSeconds + elapsedTime;
        const progress = Math.min(totalElapsed / interval, 1);
        const offset = circumference * (1 - progress);
        circle.style.strokeDashoffset = offset;

        //console.log(`Elapsed: ${totalElapsed.toFixed(2)}s, Progress: ${(progress * 100).toFixed(1)}%`);

        if (progress >= 1) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    intervalId = setInterval(updateProgress, 1000);
}

function compareTimestamp(timestamp) {
    const currentTime = new Date();
    let givenTime;

    if (typeof timestamp === 'string') {
        givenTime = new Date(timestamp);
        if (isNaN(givenTime)) {
            throw new Error('Invalid date string');
        }
    } else if (typeof timestamp === 'number') {
        givenTime = new Date(timestamp);
    } else if (timestamp instanceof Date) {
        givenTime = timestamp;
    } else {
        throw new Error('Timestamp must be a Unix timestamp, Date object, or valid date string');
    }

    const differenceSeconds = Math.round((currentTime - givenTime) / 1000);
    console.log("Time difference (seconds):", differenceSeconds);
    return differenceSeconds;
}

// Initialize both WebSocket connections on page load
window.addEventListener('load', () => {
    connectImageWebSocket();
    connectSensorWebSocket();
});
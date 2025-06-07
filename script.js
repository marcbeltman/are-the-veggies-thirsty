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

// --- Image Handling Functions ---
function displayImage(arrayBuffer, contentType, filename) {
    const imageBlob = new Blob([arrayBuffer], { type: contentType || 'image/jpeg' });
    const imageUrl = URL.createObjectURL(imageBlob);
    
    const imgElement = document.getElementById('myImageElement');
    const captionElement = document.getElementById('imageCaption');

    if (imgElement) {
        imgElement.src = imageUrl;
        imgElement.alt = filename || "Received image";
        imgElement.onload = () => {
            URL.revokeObjectURL(imageUrl);
        };
        if (captionElement) {
            captionElement.textContent = `File: ${filename || 'N/A'}, Size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`;
        }
    } else {
        console.error("Image element #myImageElement not found!");
    }
}

function connectImageWebSocket() {
    imageSocket = new WebSocket(imageServerUrl);
    imageSocket.binaryType = 'arraybuffer';

    imageSocket.onopen = () => {
        console.log("Connected to Image WebSocket server");
        currentImageMetadata = null;
    };

    imageSocket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            console.log(`Binary data received (${event.data.byteLength} bytes)`);
            if (currentImageMetadata) {
                displayImage(event.data, currentImageMetadata.contentType, currentImageMetadata.filename);
                currentImageMetadata = null;
            } else {
                console.warn("Binary data received without prior metadata. Displaying as JPEG.");
                displayImage(event.data, 'image/jpeg', 'Image_without_metadata.jpg');
            }
        } else if (typeof event.data === 'string') {
            try {
                const data = JSON.parse(event.data);
                console.log("Image JSON data received:", data);

                if (data.type === "image_metadata_ws") {
                    console.log("Image metadata received:", data.filename);
                    currentImageMetadata = {
                        filename: data.filename,
                        contentType: data.contentType,
                        size: data.size
                    };
                } else if (data.type === "image_error_ws") {
                    console.error("Image transfer error:", data.error, data.details);
                    const errorElement = document.getElementById('imageError');
                    if (errorElement) errorElement.textContent = `Error: ${data.error.details || data.error}`;
                    currentImageMetadata = null;
                } else {
                    console.log("Other JSON message type:", data);
                }
            } catch (error) {
                console.error("Error parsing image JSON data:", error, "Received data:", event.data);
            }
        } else {
            console.warn("Unknown data type received via Image WebSocket:", event.data);
        }
    };

    imageSocket.onclose = (event) => {
        console.log("Image WebSocket connection closed. Reason:", event.reason, "Code:", event.code);
        currentImageMetadata = null;
        setTimeout(connectImageWebSocket, 5000);
    };

    imageSocket.onerror = (error) => {
        console.error("Image WebSocket error:", error);
    };
}

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

        console.log(`Elapsed: ${totalElapsed.toFixed(2)}s, Progress: ${(progress * 100).toFixed(1)}%`);

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
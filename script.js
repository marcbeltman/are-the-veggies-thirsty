console.log("Sensor script loaded");

// WebSocket en timer configuratie
const SENSOR_SERVER_URL = "wss://node-red.xyz/ws/sensorData";
const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 5000;
const RECONNECT_DELAY_MS = 5000;
const PROGRESS_TICK_MS = 1000;
const ANSWER_TEXT_SHADOW = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000";
const DEFAULT_DUMMY_IMAGE_PATH = "images/00-veggies-under_construction.png";

// Gedeelde runtime state
const state = {
    sensorSocket: null,
    pingIntervalId: null,
    pongTimeoutId: null,
    progressIntervalId: null
};

// Centrale referenties naar DOM elementen (één keer ophalen)
const ui = {
    soilMoisture: document.getElementById("soil-moisture"),
    soilTemperature: document.getElementById("soil-temperature"),
    temperature: document.getElementById("temperature"),
    batteryStatus: document.getElementById("battery-status"),
    batteryVoltage: document.getElementById("battery-voltage"),
    soilNode: document.getElementById("soil-node"),
    time: document.getElementById("time"),
    readableInterval: document.getElementById("readable-interval"),
    imageContainer: document.getElementById("image-container"),
    answer: document.getElementById("answer"),
    progressRing: document.querySelector(".progress-ring"),
    progressCircle: document.querySelector(".progress-ring-circle"),
    offlineMessage: document.querySelector(".offline-message"),
    connectionStatus: document.getElementById("connection-status")
};

// Regels voor vochtigheid -> tekst + afbeelding
const moistureRules = [
    { matches: (value) => value >= 75, message: "No, too much water!", imagePath: "images/06-veggies-drunk.png" },
    { matches: (value) => value > 60 && value <= 75, message: "No, we are happy!", imagePath: "images/01-veggies-excited-very-wet.png" },
    { matches: (value) => value > 50 && value <= 60, message: "No, we are okay!", imagePath: "images/02-veggies-happy-wet.png" },
    { matches: (value) => value >= 35 && value <= 50, message: "Man, we are thirsty!", imagePath: "images/04-veggies-thirsty-dry.png" },
    { matches: (value) => value <= 35, message: "Man, we are dying!", imagePath: "images/05-veggies-dieing-very-dry.png" }
];

function connectSensorWebSocket() {
    state.sensorSocket = new WebSocket(SENSOR_SERVER_URL);

    state.sensorSocket.onopen = () => {
        console.log("Connected to Node-RED WebSocket server");
        clearTimeout(state.pongTimeoutId);
        if (ui.connectionStatus) {
            ui.connectionStatus.style.display = "none";
        }
        console.log("📤 Requesting latest sensor data...");
        sendSocketMessage({ type: "get_latest_data" });

        clearInterval(state.pingIntervalId);
        state.pingIntervalId = setInterval(() => {
            if (state.sensorSocket && state.sensorSocket.readyState === WebSocket.OPEN) {
                console.log("📤 Ping sent");
                sendSocketMessage({ type: "ping" });
                
                // Zet timeout voor pong respons
                clearTimeout(state.pongTimeoutId);
                state.pongTimeoutId = setTimeout(() => {
                    console.warn("No pong received within timeout");
                    if (ui.connectionStatus) {
                        ui.connectionStatus.style.display = "block";
                    }
                }, PONG_TIMEOUT_MS);
            }
        }, PING_INTERVAL_MS);
    };

    state.sensorSocket.onmessage = (event) => {
        console.log("📥 RAW WEBSOCKET EVENT DATA:", event.data);
        try {
            const data = JSON.parse(event.data);
            // console.log("📥 Parsed JSON data:", data); // Even uitgezet om de raw data focus te geven

            if (data.type === "pong") {
                console.log("📥 Pong received");
                clearTimeout(state.pongTimeoutId);
                state.pongTimeoutId = null;
                if (ui.connectionStatus) {
                    ui.connectionStatus.style.display = "none";
                }
                return;
            }

            if (data.type === "error") {
                console.error("❌ Server Error:", data.message);
                if (ui.connectionStatus) {
                    ui.connectionStatus.innerText = `⚠️ ${data.message}`;
                    ui.connectionStatus.style.display = "block";
                }
                return;
            }

            // Check common Node-RED patterns
            const sensorData = data.sensor_data || 
                               (data.payload && data.payload.sensor_data) || 
                               (data.device ? data : null) || 
                               (data.payload && data.payload.device ? data.payload : null);

            if (sensorData && (sensorData.device || sensorData.sensor_data)) {
                const finalData = sensorData.sensor_data || sensorData;
                handleSensorData(finalData);
                return;
            }

            console.warn("⚠️ Unknown message format. Raw data was:", event.data);
        } catch (error) {
            console.error("❌ Error parsing WebSocket message:", error, "Raw data was:", event.data);
        }
    };

    state.sensorSocket.onclose = () => {
        console.log("Sensor WebSocket closed. Reconnecting...");
        clearTimeout(state.pongTimeoutId);
        if (ui.connectionStatus) {
            ui.connectionStatus.style.display = "block";
        }
        clearInterval(state.pingIntervalId);
        setTimeout(connectSensorWebSocket, RECONNECT_DELAY_MS);
    };

    state.sensorSocket.onerror = (error) => {
        console.error("Sensor WebSocket error:", error);
    };
}

// Verwerkt één volledig sensorbericht en werkt daarna UI + visuals bij
function handleSensorData(sensorData) {
    const soilMoisture = sensorData.soil.moisture;
    const soilTemperature = sensorData.soil.temperature;
    const outsideTemperature = sensorData.temperature;
    const batteryStatus = sensorData.battery.status;
    const batteryVoltage = sensorData.battery.voltage;
    const device = sensorData.device;
    const timestamp = sensorData.timestamp;
    const intervalSeconds = sensorData.deepsleep + 15;
    const intervalMinutes = Math.round(sensorData.deepsleep / 60);

    const readableTimestamp = new Date(timestamp).toLocaleString("nl-NL");

    setText(ui.soilMoisture, `Soil moisture: ${soilMoisture}%`);
    setText(ui.soilTemperature, `Soil temperature: ${soilTemperature}°C`);
    setText(ui.temperature, `Outside temperature: ${outsideTemperature}°C`);
    setText(ui.batteryStatus, `Battery status: ${batteryStatus}`);
    setText(ui.batteryVoltage, `Battery voltage: ${batteryVoltage}V`);
    setText(ui.soilNode, `Device: ${device}`);
    setText(ui.time, readableTimestamp);
    setText(ui.readableInterval, `Message interval: ${intervalMinutes} min`);

    updateVeggieImage(soilMoisture);
    startProgressRing(intervalSeconds, timestamp);
}

// Kiest tekst + afbeelding op basis van vochtigheid
function updateVeggieImage(value) {
    if (!ui.imageContainer || !ui.answer) {
        return;
    }

    const matchedRule = moistureRules.find((rule) => rule.matches(value));
    const fallbackRule = {
        message: "Invalid measurement",
        imagePath: "images/white.png"
    };
    const activeRule = matchedRule || fallbackRule;

    ui.imageContainer.innerHTML = "";
    ui.answer.innerText = activeRule.message;
    ui.answer.style.textShadow = ANSWER_TEXT_SHADOW;

    const img = document.createElement("img");
    img.src = activeRule.imagePath;
    img.alt = "Soil moisture level";
    ui.imageContainer.appendChild(img);
}

// Werkt de cirkel-progressbar bij richting de volgende meting
function startProgressRing(intervalSeconds, timestamp) {
    if (!ui.progressRing || !ui.offlineMessage || !ui.progressCircle) {
        console.error("Progress ring elements not found!");
        return;
    }

    const elapsedSecondsAtStart = getElapsedSeconds(timestamp);

    if (elapsedSecondsAtStart > intervalSeconds) {
        ui.progressRing.style.display = "none";
        ui.offlineMessage.style.display = "block";
        return;
    }

    ui.progressRing.style.display = "block";
    ui.offlineMessage.style.display = "none";

    const radius = ui.progressCircle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    ui.progressCircle.style.strokeDasharray = `${circumference}`;

    clearInterval(state.progressIntervalId);

    const startTime = Date.now();
    state.progressIntervalId = setInterval(() => {
        const elapsedSinceRender = (Date.now() - startTime) / 1000;
        const totalElapsed = elapsedSecondsAtStart + elapsedSinceRender;
        const progress = Math.min(totalElapsed / intervalSeconds, 1);
        const offset = circumference * (1 - progress);

        ui.progressCircle.style.strokeDashoffset = `${offset}`;

        if (progress >= 1) {
            clearInterval(state.progressIntervalId);
            state.progressIntervalId = null;
        }
    }, PROGRESS_TICK_MS);
}

// Zet een timestamp om naar verstreken seconden t.o.v. nu
function getElapsedSeconds(rawTimestamp) {
    let parsedTime;

    if (typeof rawTimestamp === "string" || typeof rawTimestamp === "number") {
        parsedTime = new Date(rawTimestamp);
    } else if (rawTimestamp instanceof Date) {
        parsedTime = rawTimestamp;
    } else {
        throw new Error("Timestamp must be a Unix timestamp, Date object, or valid date string");
    }

    if (isNaN(parsedTime)) {
        throw new Error("Invalid date value in timestamp");
    }

    return Math.round((Date.now() - parsedTime.getTime()) / 1000);
}

function sendSocketMessage(payload) {
    if (state.sensorSocket && state.sensorSocket.readyState === WebSocket.OPEN) {
        state.sensorSocket.send(JSON.stringify(payload));
    }
}

function setText(element, text) {
    if (element) {
        element.innerText = text;
    }
}

function renderDefaultDummyImage() {
    if (!ui.imageContainer) {
        return;
    }

    ui.imageContainer.innerHTML = "";

    const img = document.createElement("img");
    img.src = DEFAULT_DUMMY_IMAGE_PATH;
    img.alt = "Waiting for sensor data";
    ui.imageContainer.appendChild(img);

    // Verberg de answer tekst bij dummy afbeelding
    if (ui.answer) {
        ui.answer.innerText = "";
    }
}

window.addEventListener("load", () => {
    renderDefaultDummyImage();
    connectSensorWebSocket();
});
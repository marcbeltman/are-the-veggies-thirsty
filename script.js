console.log("Script geladen!");




// WebSocket verbinding met Node-RED server
let socket;
let pingInterval;
let intervalId = null; // Houdt bij of er al een interval loopt

//ESP DataHub heartbeat
let heartbeatTimeout;

const serverUrl = "wss://node-red.xyz/ws/sensorData";

// Globale variabele voor bodemvochtigheid uit de message 
let soilMoisture; 
// Globale variabele voor de timestamp uit de message
let timestamp;
// Globale variabele voor tijdsinterval in seconden (deepsleep) uit de message
let interval;


function connectWebSocket() {
    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        console.log("Verbonden met Node-RED WebSocket server!");

        // Verstuur een eenmalig signaal om de laatste data op te vragen
        socket.send(JSON.stringify({ type: "get_latest_data" }));
        console.log("Verzoek voor laatste data verzonden");

        // Start de ping-pong heartbeat
        pingInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "ping" }));
                console.log("Ping verzonden");
            }
        }, 30000);
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data); // Converteer ontvangen JSON-string naar object
    
            if (data.type === "pong") {
                console.log("Pong ontvangen van server");
                return; // Stop hier, geen verdere verwerking nodig
            }
    
            if (data.type === "node-red: message recieved") {
                console.log("node-red: bericht irrigatie start ontvangen");
                return; // Stop hier, geen verdere verwerking nodig
            }

            if (data.status) {
                console.log("ESP DataHub online");
                document.getElementById("esp-datahub").innerText = "ESP-DataHub Online..."
                resetHeartbeatTimeout(); // <-- voeg dit toe
                return; // Stop hier, geen verdere verwerking nodig
            }

            console.log("Ontvangen data:", data); // Log de ontvangen data

            if (data.sensor_data) {

               

                const device = data.sensor_data.device;
                const readableTimestamp = new Date(data.sensor_data.timestamp).toLocaleString("nl-NL"); 
                timestamp = data.sensor_data.timestamp
                // global variable for soil moisture
                soilMoisture = data.sensor_data.soil.moisture;
                const temperature = data.sensor_data.soil.temperature;
                const batteryStatus = data.sensor_data.battery.status;
                const batteryVoltage = data.sensor_data.battery.voltage;
                interval = data.sensor_data.deepsleep; // Dit is de tijdsinterval tussen metingen
        
                console.log("Device:", device);
                console.log("Timestamp:", timestamp);
                console.log("Soil Moisture:", soilMoisture, "Datatype:", typeof soilMoisture); // Zorg ervoor dat de tekst duidelijker is
                console.log("Soil Temperature:", temperature);
                console.log("Battery Status:", batteryStatus);
                console.log("Battery Voltage:", batteryVoltage);
                console.log("Interval:", interval, "seconds");

                document.getElementById("soil-moisture").innerText = 
                    "Soil moisture: " + soilMoisture + "%";
                document.getElementById("soil-temperature").innerText =
                    "Soil temperature: " + temperature + "°C";
                document.getElementById("battery-status").innerText =       
                    "Battery status: " + batteryStatus;
                document.getElementById("battery-voltage").innerText =                  
                    "Battery voltage: " + batteryVoltage + "V";
                document.getElementById("soil-node").innerText =
                    "Device: " + device;        
                document.getElementById("time").innerText =
                    "Time last measurement: " + readableTimestamp

            } else {
                console.log("Onbekend berichtformaat, geen sensor_data aanwezig.");
            }

            showImageBasedOnValue(soilMoisture) // Toon de afbeelding op basis van de bodemvochtigheid

            // Roep de voortgangsbalkfunctie aan bij elk bericht
            startProgressRing(interval);

        } catch (error) {
            console.error("Fout bij het verwerken van de ontvangen data:", error);
        }
    };

    socket.onclose = () => {
        console.log("Verbinding met WebSocket server verbroken. Opnieuw verbinden...");
        clearInterval(pingInterval);
        setTimeout(connectWebSocket, 5000);
    };

    socket.onerror = (error) => {
        console.error("WebSocket fout:", error);
    };
}

// Verbind met de WebSocket server
connectWebSocket();




// functie om de ESP DataHub heartbeat te resetten
function resetHeartbeatTimeout() {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = setTimeout(() => {
      console.error("Geen bevestiging van ESP-DataHub heartbeat binnen 70 seconden.");
      document.getElementById("esp-datahub").innerText = "ESP-DataHub Offline..."
    }, 70000);
  }



function showImageBasedOnValue(value) {
    const imageContainer = document.getElementById('image-container');
    imageContainer.innerHTML = ''; // Clear previous image

    let imagePath = '';

    if (value >= 80) {
        document.getElementById("answer").innerText = "No, we are excited!" 
        document.getElementById("answer").style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000"; 
        imagePath = 'images/01-veggies-excited-very-wet.png';
    } else if (value >= 60) {
        document.getElementById("answer").innerText = "No, we are happy!"  
        document.getElementById("answer").style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000";
        imagePath = 'images/02-veggies-happy-wet.png';
    } else if (value >= 40) {
        document.getElementById("answer").innerText = "No, we are oke!" 
        document.getElementById("answer").style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000";
        imagePath = 'images/03-veggies-neutral-normal.png';
    } else if (value >= 20) {
        document.getElementById("answer").innerText = "Yes, we are thirsty!" 
        document.getElementById("answer").style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000";
        imagePath = 'images/04-veggies-thirsty-dry.png';
    } else {
        document.getElementById("answer").innerText = "Man, we are dying!" 
        document.getElementById("answer").style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000";
        imagePath = 'images/05-veggies-dieing-very-dry.png';
    }

    const img = document.createElement('img');
    img.src = imagePath;
    img.alt = 'Soil moisture level';
    imageContainer.appendChild(img);
}


function startIrrigation() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const message = {
            type: "irrigation_command",
            action: "start",
            timestamp: new Date().toISOString()
        };
        socket.send(JSON.stringify(message));
        console.log("Irrigatiecommando verzonden:", message);
    } else {
        console.warn("WebSocket is niet open. Kan geen bericht verzenden.");
    }
}




function startProgressRing(interval) {
    let elapsedTime = compareTimestamp(timestamp);

    const progressRing = document.querySelector('.progress-ring');
    const offlineMessage = document.querySelector('.offline-message');

    if (!progressRing) {
        console.error("Kan het progress ring element niet vinden!");
        return;
    }

    if (!offlineMessage) {
        console.error("Kan het offline bericht element niet vinden!");
        return;
    }

    // Controleer of elapsedTime groter is dan interval
    if (elapsedTime > interval) {
        console.log("Verstreken tijd is groter dan interval, toon offline bericht");
        progressRing.style.display = 'none';
        offlineMessage.style.display = 'block';
        return;
    }

    // Toon voortgangsbalk en verberg offline bericht
    progressRing.style.display = 'block';
    offlineMessage.style.display = 'none';

    const circle = document.querySelector('.progress-ring-circle');
    if (!circle) {
        console.error("Kan het cirkelelement niet vinden!");
        return;
    }

    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;

    const startTime = Date.now();

    // Stop vorige interval als die nog loopt
    if (intervalId !== null) {
        clearInterval(intervalId);
    }

    function updateProgress() {
        const now = Date.now();
        const elapsedSeconds = (now - startTime) / 1000;
        // Voeg elapsedTime toe aan elapsedSeconds voor de voortgangsberekening
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


// HelperFunctie voor functie startProgressRing() om de tijdstempel te vergelijken met de huidige tijd
  function compareTimestamp(timestamp) {
    const currentTime = new Date();
    console.log("current time: ", currentTime);
    let givenTime;

    if (typeof timestamp === 'string') {
        givenTime = new Date(timestamp);
        console.log("given time: ", givenTime);
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

    // rond het verschil af in hele seconden
    const differenceSeconds = Math.round((currentTime - givenTime) / 1000);

    
    console.log("difference time message and realtime: ", differenceSeconds);
    // if (differenceSeconds > interval) {
    //     isLessThanInterval = true;
    // }

    return differenceSeconds
}
console.log("Script geladen!");




// WebSocket verbinding met Node-RED server
let socket;
let pingInterval;

//ESP DataHub heartbeat
let heartbeatTimeout;

const serverUrl = "wss://node-red.xyz/ws/sensorData";

// Globale variabele voor bodemvochtigheid
let soilMoisture; 

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

   
            if (data.sensor_data) {
                const device = data.sensor_data.device;
                const timestamp = new Date(data.sensor_data.timestamp).toLocaleString("nl-NL"); 
                // global variable for soil moisture
                soilMoisture = data.sensor_data.soil.moisture;
                const temperature = data.sensor_data.soil.temperature;
                const batteryStatus = data.sensor_data.battery.status;
                const batteryVoltage = data.sensor_data.battery.voltage;
        
                console.log("Device:", device);
                console.log("Timestamp:", timestamp);
                console.log("Soil Moisture:", soilMoisture, "Datatype:", typeof soilMoisture); // Zorg ervoor dat de tekst duidelijker is
                console.log("Soil Temperature:", temperature);
                console.log("Battery Status:", batteryStatus);
                console.log("Battery Voltage:", batteryVoltage);

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
                    "Time last measurement: " + timestamp

            } else {
                console.log("Onbekend berichtformaat, geen sensor_data aanwezig.");
            }

            showImageBasedOnValue(soilMoisture) // Toon de afbeelding op basis van de bodemvochtigheid

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
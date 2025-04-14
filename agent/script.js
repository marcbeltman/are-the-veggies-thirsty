console.log("Script geladen!");

// WebSocket verbinding met Node-RED server
let socket;
let pingInterval;
const serverUrl = "wss://node-red.xyz/ws/sensorData";


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
    
            console.log("Ontvangen data:", data);
    
            // Controleer of "sensor" en "time" bestaan voordat je ze gebruikt
            if (data.sensor && "time" in data.sensor) {
                let readableTime = new Date(data.sensor.time).toLocaleString("nl-NL");
                console.log("Laatste meting ontvangen:", readableTime);
                document.getElementById("time").innerText = "Time last measurment: " + readableTime;
            } else {
                console.warn("Geen tijdsaanduiding in bericht:", data);
            }

            // Controleer of "sensor" en "temperature" bestaan voordat je ze gebruikt
            if (data.sensor && "temperature" in data.sensor) {
                document.getElementById("sensorData").innerText = 
                    "Temperature: " + data.sensor.temperature + "°C";
            } else {
                console.warn("Geen sensordata in bericht:", data);
            }

           // Controleer of "sensor" en "soil_moisture" bestaan voordat je ze gebruikt
            if (data.sensor && "soil_moisture" in data.sensor) {
                document.getElementById("soil-moisture").innerText = 
                    "Soil moisture: " + data.sensor.soil_moisture;
            } else {
                console.warn("Geen soil_moisture in bericht:", data);
            }

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













function showImageBasedOnValue(value) {
    const imageContainer = document.getElementById('image-container');
    imageContainer.innerHTML = ''; // Clear previous image

    let imagePath = '';

    if (value >= 80) {
        imagePath = 'images/01-veggies-excited-very-wet.png';
    } else if (value >= 60) {
        imagePath = 'images/02-veggies-happy-wet.png';
    } else if (value >= 40) {
        imagePath = 'images/03-veggies-neutral-normal.png';
    } else if (value >= 20) {
        imagePath = 'images/04-veggies-thirsty-dry.png';
    } else {
        imagePath = 'images/05-veggies-dieing-very-dry.png';
    }

    const img = document.createElement('img');
    img.src = imagePath;
    img.alt = 'Soil moisture level';
    imageContainer.appendChild(img);
}


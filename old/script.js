console.log("Hello, World!");

let socket;
let pingInterval;
const serverUrl = "wss://node-red.xyz/ws/sensorData";

// PROGRES CIRCLE Stel het interval van metingen in (in milliseconden)
const MEASUREMENT_INTERVAL = 51 * 1000; // 60 seconden
let lastMeasurementTime = null;
let currentTime = null;

//let messageCount = 0; // Houdt bij hoeveel geldige berichten zijn ontvangen

//let lastMeasurementTimeReadable = null; // Leesbare tijd

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
                lastMeasurementTime = new Date(data.sensor.time).getTime();
                let readableTime = new Date(data.sensor.time).toLocaleString("nl-NL");
                document.getElementById("time").innerText = "Time last measurement: " + readableTime;
    
                console.log("Laatste meting ontvangen:", lastMeasurementTime);

               
                currentTime = Date.now();
                let elapsedTime = currentTime - lastMeasurementTime;
                console.log("verstreken seconden na laatste meting:", elapsedTime / 1000)

                if (elapsedTime > MEASUREMENT_INTERVAL) {
                    console.log("verstreken tijd tussen de laatste meting en nu is groter dan de interval melding not connected")
                    showNotConnected()
                }else {
                    console.log("verstreken tijd tussen de laatste meting en nu is kleiner dan de interval progresbar")
                    updateProgressFromFirstMeasurement()
                }



    
                // if (lastMeasurementTime === null) {
                //     // Eerste meting: sla tijd op, maar toon nog geen progress-bar
                //     console.log("Laatste meting ontvangen:", readableTime);
                //     lastMeasurementTime = newMeasurementTime; // Sla tijd van de eerste meting op
                //     lastMeasurementTimeReadable = readableTime; // Optioneel: sla de leesbare tijd op
                //     return; // Stop hier, de rest van de code wordt niet uitgevoerd
                // }
    
                // // Bereken het verschil in tijd tussen de huidige tijd en de eerste meting
                // const elapsedSinceFirst = newMeasurementTime - lastMeasurementTime;
    
                // if (elapsedSinceFirst < MEASUREMENT_INTERVAL) {
                //     // Als de verstreken tijd binnen het interval is, toon progress-bar
                //     console.log(`Nieuwe meting binnen interval (${elapsedSinceFirst} ms), progress starten.`);
                    
                //     // Bereken het percentage progress (verstreken tijd / interval)
                //     const progressPercentage = (elapsedSinceFirst / MEASUREMENT_INTERVAL) * 100;
    
                //     // Toon de progress-bar (update de progress bar met percentage)
                //     updateProgress(progressPercentage);
                // } else {
                //     // Als de verstreken tijd groter is dan het interval, log een melding
                //     console.log(`Nieuwe meting buiten interval (${elapsedSinceFirst} ms), geen progress, opnieuw beginnen.`);
                    
                //     // Optioneel: reset de eerste meting
                //     lastMeasurementTime = newMeasurementTime;
                //     lastMeasurementTimeReadable = readableTime;
                // }








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

//////////////////////////////////////////////////////////////////////////////////////////////////////

// PROGRESS CIRCLE

//////////////////////////////////////////////////////////////////////////////////////////////////////

function setProgress(percent) {
    const circle = document.querySelector('.circle-progress');
    const percentageText = document.querySelector('.percentage');
    
    const radius = circle.getAttribute('r');
    const circumference = 2 * Math.PI * radius;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    percentageText.textContent = `${Math.round(percent)}%`;
}

function updateProgress() {
    // if (!lastMeasurementTime) {
    //     setProgress(0); // Geen meting beschikbaar
    //     return;
    // }

    const currentTime = Date.now();
    const elapsedSinceLast = currentTime - lastMeasurementTime;
    const timeUntilNext = MEASUREMENT_INTERVAL - (elapsedSinceLast % MEASUREMENT_INTERVAL);
    const progress = (elapsedSinceLast % MEASUREMENT_INTERVAL) / MEASUREMENT_INTERVAL * 100;

    setProgress(progress);

    // Blijf updaten
    requestAnimationFrame(updateProgress);
}





function updateProgressFromFirstMeasurement() {
    //if (!lastMeasurementTime) return;

    // const currentTime = Date.now();
    // const elapsedSinceFirst = currentTime - lastMeasurementTime;
    // const progress = (elapsedSinceFirst / MEASUREMENT_INTERVAL) * 100;

    maxTime = currentTime + MEASUREMENT_INTERVAL
    let elapsedTimeInterval = maxTime - currentTime
    const progress = (elapsedTimeInterval / MEASUREMENT_INTERVAL) * 100;

    setProgress(progress); // Update de progress bar

    // Blijf progress bijwerken totdat de volgende meting komt
    requestAnimationFrame(updateProgressFromFirstMeasurement);
}



// Start bij het laden van de pagina
window.onload = () => {

    
    // Start progress update
    //updateProgress();
};


function showNotConnected() {
    // Selecteer het progress-circle element
    let progressCircle = document.querySelector('.progress-circle');
    
    // Verberg het progress-circle element
    progressCircle.style.display = 'none';
    
    // Maak een nieuw div-element met de tekst "Not connected"
    let notConnectedText = document.createElement('div');
    notConnectedText.className = 'not-connected-text'; // Geef het een klasse voor styling
    notConnectedText.innerText = 'Not connected';

    // Voeg de nieuwe tekst toe op dezelfde plek (aan de parent van progress-circle)
    progressCircle.parentElement.appendChild(notConnectedText);
}

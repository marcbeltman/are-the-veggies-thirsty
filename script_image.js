// Frontend JavaScript

let serverUrl = "wss://node-red.xyz/ws/image"; // Pas aan naar je WebSocket endpoint
let socket;
let currentImageMetadata = null; // Om metadata op te slaan tussen berichten

function displayImage(arrayBuffer, contentType, filename) {
    const imageBlob = new Blob([arrayBuffer], { type: contentType || 'image/jpeg' });
    const imageUrl = URL.createObjectURL(imageBlob);
    
    const imgElement = document.getElementById('myImageElement'); // Zorg dat dit element bestaat
    const captionElement = document.getElementById('imageCaption'); // Optioneel

    if (imgElement) {
        imgElement.src = imageUrl;
        imgElement.alt = filename || "Ontvangen afbeelding";
        imgElement.onload = () => {
            URL.revokeObjectURL(imageUrl); // Geheugen vrijmaken na laden
        };
        if (captionElement) {
            captionElement.textContent = `Bestand: ${filename || 'N/A'}, Grootte: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`;
        }
    } else {
        console.error("Image element #myImageElement niet gevonden!");
    }
}

function connectWebSocket() {
    socket = new WebSocket(serverUrl);
    // BELANGRIJK: Vertel de WebSocket hoe binaire data te ontvangen
    socket.binaryType = 'arraybuffer'; // Of 'blob'

    socket.onopen = () => {
        console.log("Verbonden met WebSocket server: ");
        currentImageMetadata = null; // Reset bij nieuwe verbinding
    };

    socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            // Het is binaire data - waarschijnlijk de image buffer
            console.log(`Binaire data ontvangen (${event.data.byteLength} bytes)`);
            if (currentImageMetadata) {
                displayImage(event.data, currentImageMetadata.contentType, currentImageMetadata.filename);
                currentImageMetadata = null; // Reset voor de volgende afbeelding
            } else {
                console.warn("Binaire data ontvangen, maar geen metadata vooraf. Proberen te tonen als JPEG.");
                // Probeer het te tonen met een default content type
                displayImage(event.data, 'image/jpeg', 'Afbeelding_zonder_metadata.jpg');
            }
        } else if (typeof event.data === 'string') {
            // Het is tekstdata - waarschijnlijk JSON
            try {
                const data = JSON.parse(event.data);
                console.log("JSON data ontvangen:", data);

                if (data.type === "image_metadata_ws") {
                    console.log("Afbeelding metadata ontvangen:", data.filename);
                    currentImageMetadata = { 
                        filename: data.filename, 
                        contentType: data.contentType,
                        size: data.size
                    };
                    // Wacht nu op de binaire data...
                } else if (data.type === "image_error_ws") {
                    console.error("Fout bij afbeeldingstransfer (van hub):", data.error, data.details);
                    // Toon foutmelding aan gebruiker
                    const errorElement = document.getElementById('imageError');
                    if(errorElement) errorElement.textContent = `Fout: ${data.error.details || data.error}`;
                    currentImageMetadata = null;
                } else {
                    // Andere JSON data
                    console.log("Ander type JSON bericht:", data);
                }
            } catch (error) {
                console.error("Fout bij parsen JSON data:", error, "Ontvangen data:", event.data);
            }
        } else {
            console.warn("Onbekend type data ontvangen via WebSocket:", event.data);
        }
    };

    socket.onclose = (event) => {
        console.log("WebSocket verbinding verbroken. Reden:", event.reason, "Code:", event.code);
        currentImageMetadata = null;
        // Probeer na een pauze opnieuw te verbinden
        setTimeout(connectWebSocket, 5000); 
    };

    socket.onerror = (error) => {
        console.error("WebSocket fout:", error);
        // socket.close(); // Wordt meestal automatisch afgehandeld door onclose
    };
}

// Start de WebSocket verbinding wanneer de pagina laadt
window.addEventListener('load', connectWebSocket);


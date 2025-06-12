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
        if (captionElement && currentImageMetadata) {
            captionElement.innerHTML = `
                <strong>File:</strong> ${currentImageMetadata.filename || 'N/A'}<br>
                <strong>Type:</strong> ${currentImageMetadata.type || 'N/A'}<br>
                <strong>Content Type:</strong> ${currentImageMetadata.contentType || 'N/A'}<br>
                <strong>Size:</strong> ${(currentImageMetadata.size / 1024).toFixed(2)} KB<br>
                <strong>MAC:</strong> ${currentImageMetadata.mac || 'N/A'}<br>
                <strong>Timestamp:</strong> ${new Date(currentImageMetadata.timestamp).toLocaleString() || 'N/A'}
            `;
        } else if (captionElement) {
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
                        type: data.type,
                        filename: data.filename,
                        contentType: data.contentType,
                        size: data.size,
                        mac: data.mac,
                        timestamp: data.timestamp
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
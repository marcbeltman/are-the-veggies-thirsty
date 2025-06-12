// Node-RED Function Node JavaScript

// --- Configuratie (direct in de code) ---
const IMAGE_STORAGE_DIRECTORY = "/data/project_ATVT/images"; // <<-- PAS DIT PAD AAN INDIEN NODIG!
// Zorg ervoor dat deze directory bestaat op je Node-RED server en Node-RED er schrijfrechten heeft.

const IMAGE_BASE_TOPIC_STR = flow.get("MQTT_IMAGE_BASE_TOPIC") || "esp_data_hub/cam_node/image";
const IMAGE_BASE_TOPIC_PARTS = IMAGE_BASE_TOPIC_STR.split('/');
const IMAGE_BASE_TOPIC_LENGTH = IMAGE_BASE_TOPIC_PARTS.length;

// --- Helper Functies ---
function getTransferId(mac, filename) {
    if (!mac || !filename) {
        // node.warn("Helper getTransferId: MAC of filename ontbreekt.");
        return null;
    }
    return `${mac}_${filename}`;
}

function getImageMimeType(filename) {
    if (typeof filename !== 'string') return 'application/octet-stream';
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'bmp': return 'image/bmp';
        case 'webp': return 'image/webp';
        default: return 'application/octet-stream';
    }
}

// --- Hoofdlogica van de Function Node ---
let transfers = flow.get("imageTransfers") || {};
let messagesToReturn = [null, null, null]; // [0] for File/DB, [1] for WS Meta, [2] for WS Binary

let topic = msg.topic;
let topicParts = topic.split('/');
let payload = msg.payload; // Kan Buffer (voor chunks) of String (voor metadata/end JSON) zijn

let messageType = null;
let mac = null;
let filename = null; // Dit wordt de *originele* bestandsnaam
let chunkIndex = -1;
let transferId = null;

// Topic Parsing
let topicMatchesBase = topicParts.length >= IMAGE_BASE_TOPIC_LENGTH;
if (topicMatchesBase) {
    for (let i = 0; i < IMAGE_BASE_TOPIC_LENGTH; i++) {
        if (i >= topicParts.length || topicParts[i] !== IMAGE_BASE_TOPIC_PARTS[i]) {
            topicMatchesBase = false;
            break;
        }
    }
}

if (!topicMatchesBase) {
    // node.warn(`Topic '${topic}' (len: ${topicParts.length}) niet relevant voor image basis '${IMAGE_BASE_TOPIC_STR}' (len: ${IMAGE_BASE_TOPIC_LENGTH}). Genegeerd.`);
    return null;
}

const REL_MAC_IDX = 0;
const REL_FILENAME_IDX = 1;
const REL_TYPE_OR_CHUNK_IDX = 2;
const REL_CHUNK_SUBIDX = 3;

if (topicParts.length > IMAGE_BASE_TOPIC_LENGTH + REL_FILENAME_IDX) {
    mac = topicParts[IMAGE_BASE_TOPIC_LENGTH + REL_MAC_IDX];
    filename = topicParts[IMAGE_BASE_TOPIC_LENGTH + REL_FILENAME_IDX]; // Originele filename
} else {
    node.warn(`Topic '${topic}' te kort voor MAC/FILENAME extractie na basis '${IMAGE_BASE_TOPIC_STR}'.`);
    return null;
}

if (topicParts.length > IMAGE_BASE_TOPIC_LENGTH + REL_TYPE_OR_CHUNK_IDX) {
    let typeOrChunkPart = topicParts[IMAGE_BASE_TOPIC_LENGTH + REL_TYPE_OR_CHUNK_IDX];
    if (typeOrChunkPart === "metadata" || typeOrChunkPart === "end" || typeOrChunkPart === "status") {
        messageType = typeOrChunkPart;
        if (topicParts.length !== IMAGE_BASE_TOPIC_LENGTH + 3) {
            node.warn(`Verwachte topic lengte voor '${messageType}' niet correct voor topic: ${topic}`);
            return null;
        }
    } else if (typeOrChunkPart === "chunk" && topicParts.length === IMAGE_BASE_TOPIC_LENGTH + 4) {
        messageType = "chunk_data";
        chunkIndex = parseInt(topicParts[IMAGE_BASE_TOPIC_LENGTH + REL_CHUNK_SUBIDX], 10);
        if (isNaN(chunkIndex)) {
            node.warn(`Ongeldige chunk index in topic: ${topic}`);
            return null;
        }
    } else {
        // node.warn(`Onbekend image topic formaat (type/chunk deel) na basis: ${topic}`);
        return null;
    }
} else {
    node.warn(`Topic '${topic}' te kort voor TYPE/CHUNK deel na basis '${IMAGE_BASE_TOPIC_STR}'.`);
    return null;
}

transferId = getTransferId(mac, filename);
if (!transferId) {
    node.warn(`Kon geen transfer ID maken voor MAC '${mac}', Filename '${filename}' (Topic: ${topic})`);
    return null;
}

let transfer = transfers[transferId]; // Haal huidige transfer op

// node.warn({info: "Parsed Info", topic: topic, messageType: messageType, transferId: transferId, mac: mac, filename: filename, index: chunkIndex, transferExists: !!transfer});

switch (messageType) {
    case "metadata":
        try {
            let metadata = (typeof payload === 'string') ? JSON.parse(payload) : payload;
            // Gebruik de filename uit de metadata payload, die zou leidend moeten zijn.
            // De filename uit het topic is meer voor routering.
            let effectiveFilename = metadata.filename || filename;
            transferId = getTransferId(mac, effectiveFilename); // Herbereken transferId met filename uit metadata

            node.log(`METADATA voor ${transferId} (Orig. Filename: ${effectiveFilename}, Verwacht: ${metadata.total_mqtt_chunks} chunks)`);

            transfers[transferId] = {
                mac: mac,
                filename: effectiveFilename, // Sla de filename uit de metadata op
                totalSize: metadata.total_size_bytes,
                totalChunks: metadata.total_mqtt_chunks,
                chunks: new Array(metadata.total_mqtt_chunks).fill(null),
                receivedChunksCount: 0, receivedBytesCount: 0,
                startTime: Date.now(), error: null, lastActivity: Date.now()
            };
        } catch (e) {
            node.error(`Fout parsen METADATA voor ${transferId}: ${e.message}. Payload: ${payload.toString ? payload.toString().substring(0, 100) : typeof payload}`);
            if (!transfers[transferId]) transfers[transferId] = { error: true, filename: filename, mac: mac, chunks: [], totalChunks: 0, lastActivity: Date.now() };
            transfers[transferId].error = "metadata_parse_error";
        }
        flow.set("imageTransfers", transfers);
        break;

    case "chunk_data":
        if (!transfer) { /* node.warn(`CHUNK voor onbekende transfer: ${transferId}. Topic: ${topic}`); */ break; }
        if (transfer.error) { /* node.warn(`CHUNK voor transfer ${transferId} met error: ${transfer.error}. Genegeerd.`); */ break; }

        transfer.lastActivity = Date.now();
        if (chunkIndex >= 0 && chunkIndex < transfer.totalChunks) {
            if (transfer.chunks[chunkIndex] === null) {
                transfer.chunks[chunkIndex] = payload; // payload is Buffer
                transfer.receivedChunksCount++;
                if (payload && typeof payload.length === 'number') {
                    transfer.receivedBytesCount += payload.length;
                }
                // Periodiek opslaan van context kan performance impact hebben, doe het slim.
                // if (transfer.receivedChunksCount % 50 === 0 && transfer.receivedChunksCount > 0) { 
                //     flow.set("imageTransfers", transfers);
                // }
            } // else: dubbele chunk, negeer stilzwijgend
        } else { // chunkIndex buiten bereik
            node.warn(`CHUNK index ${chunkIndex} buiten bereik voor ${transfer.filename} (0-${transfer.totalChunks - 1}). Topic: ${topic}`);
            transfer.error = "chunk_index_out_of_bounds";
            flow.set("imageTransfers", transfers); // Sla error op
        }
        break;

    case "end":
        if (!transfer) {
            node.warn(`END bericht voor ONBEKENDE transfer: ${transferId}. Topic: ${topic}`);
            messagesToReturn[1] = { payload: { type: "image_error_ws", error: `End message for unknown/stale transfer: ${transferId}` }, error_transfer: true, filename: filename, original_topic: topic };
            break;
        }
        node.log(`END bericht voor ${transferId} (Bestand: ${transfer.filename})`);
        transfer.lastActivity = Date.now();

        if (!transfer.error) {
            if (transfer.receivedChunksCount !== transfer.totalChunks) {
                let detail = `Verwacht ${transfer.totalChunks}, Ontvangen ${transfer.receivedChunksCount}.`;
                node.warn(`Aantal chunks (END) voor ${transfer.filename} mismatch. ${detail}`);
                transfer.error = `chunk_count_mismatch_at_end: ${detail}`;
            }
            for (let i = 0; i < transfer.totalChunks; i++) {
                if (transfer.chunks[i] === null) {
                    let missingError = `missing_chunk_${i}`;
                    node.error(`Chunk ${i} ONTBREЕKT voor ${transfer.filename} bij reassemblage!`);
                    transfer.error = transfer.error ? `${transfer.error}; ${missingError}` : missingError;
                    // Geen break hier als je alle missende chunks wilt loggen
                }
            }
        }

        if (!transfer.error && transfer.receivedChunksCount === transfer.totalChunks) {
            node.log(`Alle ${transfer.totalChunks} chunks voor ${transfer.filename} aanwezig. Reassemblage...`);
            try {
                let completeImageBuffer = Buffer.concat(transfer.chunks);
                if (completeImageBuffer.length === transfer.totalSize) {
                    node.log(`Afbeelding ${transfer.filename} succesvol samengesteld (${completeImageBuffer.length} bytes).`);

                    let timestampNow = Date.now();
                    let macForFile = transfer.mac.replace(/:/g, '');
                    let uniqueServerFilename = `${macForFile}_${timestampNow}_${transfer.filename}`;

                    let directoryToUse = IMAGE_STORAGE_DIRECTORY;
                    if (!directoryToUse.endsWith('/')) {
                        directoryToUse += '/';
                    }
                    let fullPathOnServer = directoryToUse + uniqueServerFilename;

                    messagesToReturn[0] = {
                        payload: completeImageBuffer,
                        filename: fullPathOnServer, // Dit is het pad voor de file node
                        db_metadata: {
                            filename_original: transfer.filename, // Originele naam
                            mac_address_client: transfer.mac,
                            content_type: getImageMimeType(transfer.filename),
                            size_bytes: transfer.totalSize,
                            timestamp_nodered_epoch_ms: timestampNow
                            // stored_filepath wordt later gevuld door de change node na de file node
                        }
                    };

                    messagesToReturn[1] = {
                        payload: {
                            type: "image_metadata_ws", filename: transfer.filename, // Originele naam
                            contentType: getImageMimeType(transfer.filename),
                            size: transfer.totalSize, mac: transfer.mac, timestamp: timestampNow
                        },
                        _topic: topic
                    };

                    messagesToReturn[2] = {
                        payload: completeImageBuffer,
                        _topic: topic,
                        _originalFilenameForDebug: transfer.filename
                    };

                } else {
                    node.error(`Grootte samengestelde afbeelding (${completeImageBuffer.length}) ongelijk aan verwacht (${transfer.totalSize}) voor ${transfer.filename}.`);
                    transfer.error = "reassembled_size_mismatch";
                }
            } catch (e_concat) {
                node.error(`Fout bij Buffer.concat voor ${transfer.filename}: ${e_concat.message}`);
                transfer.error = "concat_error";
            }
        }

        if (transfer.error && messagesToReturn[0] === null && messagesToReturn[1] === null && messagesToReturn[2] === null) {
            node.error(`Transfer ${transferId} mislukt met error: ${transfer.error}`);
            messagesToReturn[1] = {
                payload: {
                    type: "image_error_ws", error: `Image transfer for ${filename} failed.`,
                    details: transfer.error, transferId: transferId
                },
                error_transfer: true, filename: transfer.filename || filename, original_topic: topic
            };
        }

        if (transferId in transfers) { delete transfers[transferId]; }
        flow.set("imageTransfers", transfers); // Sla opgeschoonde/gewijzigde transfers op
        break;

    case "status":
        if (transfer) {
            try {
                let statusData = (typeof payload === 'string') ? JSON.parse(payload) : payload;
                node.log(`Statusbericht voor ${transferId} (van hub): ${statusData.status}`);
                if (statusData.status && statusData.status.startsWith("error_")) {
                    transfer.error = statusData.status;
                    transfer.lastActivity = Date.now();
                    flow.set("imageTransfers", transfers);
                }
            } catch (e) {
                node.error(`Fout parsen statusbericht voor ${transferId}: ${e.message}`);
            }
        }
        break;

    default:
        // node.warn(`Onverwerkt messageType '${messageType}' op topic ${topic}`);
        break;
}

// Update flow context na chunk data als het niet periodiek is gebeurd,
// en als er geen 'end' of 'status' was die het al deed.
if (messageType === "chunk_data" && transfer && !transfer.error) {
    if (!(transfer.receivedChunksCount % 50 === 0 && transfer.receivedChunksCount > 0)) {
        // Als er geen periodieke save was, en het is de laatste chunk, sla dan nu op.
        if (transfer.receivedChunksCount === transfer.totalChunks) {
            flow.set("imageTransfers", transfers);
        }
    }
}


// Retourneer de array van berichten.
if (messagesToReturn.some(m => m !== null)) { // Alleen retourneren als er iets te sturen is
    return messagesToReturn;
} else {
    return null; // Geen output als er niets expliciet is voorbereid
}
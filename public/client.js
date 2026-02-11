const socket = io();

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusMessage = document.getElementById('statusMessage');
const nextBtn = document.getElementById('nextBtn');
const termCheckbox = document.getElementById('termsCheckbox');
const enterBtn = document.getElementById('enterBtn');
const landingOverlay = document.getElementById('landingOverlay');
const mainContainer = document.getElementById('mainContainer');

// State
let localStream = null;
let peerConnection = null;
let makingOffer = false;
let ignoreOffer = false;

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// --- Initialization ---

termCheckbox.addEventListener('change', (e) => {
    enterBtn.disabled = !e.target.checked;
});

enterBtn.addEventListener('click', () => {
    landingOverlay.style.display = 'none';
    mainContainer.style.display = 'flex';
    init();
});

async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        findPartner();
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera/microphone. Please allow permissions.');
    }
}

// --- Socket Events ---

socket.on('connect', () => {
    console.log('Connected to signaling server');
});

socket.on('match_found', async ({ initiator }) => {
    console.log('Match found! Initiator:', initiator);
    updateStatus('Connected to stranger');

    createPeerConnection();

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    if (initiator) {
        try {
            makingOffer = true;
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', { type: 'offer', sdp: offer.sdp });
        } catch (err) {
            console.error('Error creating offer:', err);
        } finally {
            makingOffer = false;
        }
    }
});

socket.on('offer', async (offer) => {
    if (!peerConnection) {
        createPeerConnection();
        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }
    }

    try {
        if (peerConnection.signalingState !== "stable") {
            if (!makingOffer) {
                await peerConnection.setRemoteDescription(offer);
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('answer', { type: 'answer', sdp: answer.sdp });
            }
        } else {
            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { type: 'answer', sdp: answer.sdp });
        }
    } catch (err) {
        console.error('Error handling offer:', err);
    }
});

socket.on('answer', async (answer) => {
    try {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(answer);
        }
    } catch (err) {
        console.error('Error handling answer:', err);
    }
});

socket.on('ice-candidate', async (candidate) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(candidate);
        }
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
});

socket.on('partner_disconnected', () => {
    updateStatus('Stranger disconnected. Finding new partner...');
    cleanupConnection();

    // Auto-connect to next stranger after a short delay
    setTimeout(() => {
        socket.emit('next');
        updateStatus('Searching...');
        findPartner();
    }, 2000);
});

// --- WebRTC Logic ---

function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            updateStatus('');
        }
    };
}

function cleanupConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
}

// --- UI Logic ---

function findPartner() {
    updateStatus('Waiting for a stranger...');
    socket.emit('find_partner');
}

function updateStatus(msg) {
    if (statusMessage) {
        statusMessage.innerText = msg;
        statusMessage.style.display = msg ? 'block' : 'none';
    }
}

// --- Event Listeners ---

nextBtn.addEventListener('click', () => {
    cleanupConnection();
    socket.emit('next');
    updateStatus('Searching...');
    findPartner();
});

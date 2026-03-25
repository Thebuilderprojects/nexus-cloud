const socket = io();
const videoElement = document.getElementById('screen-preview');
const startBtn = document.getElementById('start-share');
let peerConnection;

const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

startBtn.onclick = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    videoElement.srcObject = stream;

    peerConnection = new RTCPeerConnection(config);
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("Host sending ICE candidate...");
            socket.emit('signal', { candidate: event.candidate });
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("Host sending Offer...");
    socket.emit('signal', { offer });
};

// Listen for the viewer's answer and candidates
socket.on('signal', async (data) => {
    if (data.answer) {
        console.log("Host received Answer!");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate && peerConnection) {
        console.log("Host received Viewer's ICE candidate!");
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});
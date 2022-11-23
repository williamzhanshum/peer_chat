// We want to make sure this is hidden. When going to production we will need to use token authentification.
let APP_ID = '86d08ec509d84630934da8b1905aa145';
// Will need to change this when going to production.
let token = null;
// Once we have a token we need a UID for each user when they join a channel. This is how we identify each user when they are in the room. Allows for them to send messages and we know how many users are in each channel. (You can use uid generator or some id from DB)
let uid = String(Math.floor(Math.random() * 10000));

// Create a client object, it will igve us access to everything that we need.
let client;
// Will also need to create a channel, this is what two users will join. Will allow us to send messages to this channel and no info about this specific channel.
let channel;

// The variables below will get the room id from the url and make sure users need an id to join a ro
let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');

// the following Makes sure the user has a room ID before they go to specific room. If they do not, it will redirect to lobby.
if (!roomId) {
  window.location = 'lobby.html';
}

// Get access to camera's audio and video
let localStream; // Local camera's video feed and mic audio
let remoteStream; // Will be the other user's data
let peerConnection;

// This will set up the stun server.
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
};

let init = async () => {
  // 1) Creates the client object.
  client = await AgoraRTM.createInstance(APP_ID);
  // 2) Login
  await client.login({ uid, token });
  // 3) Create the channel
  channel = client.createChannel(roomId);
  // 4) Join the channel
  await channel.join();

  channel.on('MemberJoined', handleUserJoined);
  // This will listen for the event when a user leaves.
  channel.on('MemberLeft', handleUserLeft);

  // This will response to the offer received.
  client.on('MessageFromPeer', handleMessageFromPeer);

  // This will request access to the video and
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  document.getElementById('user-1').srcObject = localStream;
};

// Function that will remove the block when a user leaves.
let handleUserLeft = (memeberId) => {
  document.getElementById('user-2').style.display = 'none';
};

// Function that will handle the message sent from the peer.
let handleMessageFromPeer = async (message, memeberId) => {
  //   console.log(`Message: ${message.text}}`);
  message = JSON.parse(message.text);
  //   console.log('>>>>>>>>', message);
  if (message.type === 'offer') {
    createAnswer(memeberId, message.offer);
  }

  if (message.type === 'answer') {
    addAnswer(message.answer);
  }

  if (message.type === 'candidate') {
    if (peerConnection) {
      peerConnection.addIceCandidate(message.candidate);
    }
  }
};

// Funtion that will be called when a new user joins the channel.
let handleUserJoined = async (memeberId) => {
  console.log(`>>> A new user joined the channel: ${memeberId} <<<`);
  createOffer(memeberId);
};

let createPeerConnection = async (memeberId) => {
  // 1) Establishes the peer connection. This is the interface that stores all the info between us and the reomote peer.
  peerConnection = new RTCPeerConnection(servers);

  // 2) Sets up the media stream.
  remoteStream = new MediaStream();
  document.getElementById('user-2').srcObject = remoteStream;

  // When user-2 joins, it wil display it as a block element.
  document.getElementById('user-2').style.display = 'block';

  // To solve the error that appears if the user refreshes the page too fast. When refresh is too fast the local stream might not have yet been created. The if statement belwo is to ensure the local stream is created
  if (!localStream) {
    // This will ask the user to access their camera.
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    document.getElementById('user-1').srcObject = localStream;
  }

  // This will get the local tracks (audio and video) and adds it to the peerConnection so that the peer can get them.
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Listen for the event when the peer add their tracks too
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  //This will create an ICE candidate
  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log(`>>> New ICE candidate: ${event.candidate} <<<`);
      client.sendMessageToPeer(
        {
          text: JSON.stringify({
            type: 'candidate',
            candidate: event.candidate,
          }),
        },
        memeberId
      );
    }
  };
};

// Create an offer and send it over to the other user.
let createOffer = async (memeberId) => {
  // 1) Create the peer connection, by calling the function we created.
  await createPeerConnection(memeberId);
  // 2) Create an offer
  let offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Send out offer to the other peer once it is created:
  client.sendMessageToPeer(
    { text: JSON.stringify({ type: 'offer', offer: offer }) },
    memeberId
  );
};

// Create Answer, this is what is created when the offer is received.
let createAnswer = async (memeberId, offer) => {
  await createPeerConnection(memeberId);

  await peerConnection.setRemoteDescription(offer);

  let answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  client.sendMessageToPeer(
    { text: JSON.stringify({ type: 'answer', answer: answer }) },
    memeberId
  );
};

// This function will be the first peer (initiated the offer), they will get back the answer and process it.
let addAnswer = async (answer) => {
  if (!peerConnection.currentRemoteDescription) {
    peerConnection.setRemoteDescription(answer);
  }
};

// This will log a user out and leave the channel right away.
let leaveChannel = async () => {
  await channel.leave();
  await client.logout();
};

// Toggle between show and no-show camera
let toggleCamera = async () => {
  let videoTrack = localStream
    .getTracks()
    .find((track) => track.kind === 'video');

  if (videoTrack.enabled) {
    videoTrack.enabled = false;
    document.getElementById('camera-btn').style.backgroundColor =
      'rgb(255,80,80)';
  } else {
    videoTrack.enabled = true;
    document.getElementById('camera-btn').style.backgroundColor =
      'rgb(179,102,249,.9)';
  }
};

// Toggle for the mic
let toggleMic = async () => {
  let audioTrack = localStream
    .getTracks()
    .find((track) => track.kind === 'audio');

  if (audioTrack.enabled) {
    audioTrack.enabled = false;
    document.getElementById('mic-btn').style.backgroundColor = 'rgb(255,80,80)';
  } else {
    audioTrack.enabled = true;
    document.getElementById('mic-btn').style.backgroundColor =
      'rgb(179,102,249,.9)';
  }
};

// This will add an event listener on the window, so when the user closes the window it will trigger. It will remove the user from the channel right before the window acutally closes.
window.addEventListener('beforeunload', leaveChannel);

// Listens for toggle camera click
document.getElementById('camera-btn').addEventListener('click', toggleCamera);

// Listens for toggle mic click
document.getElementById('mic-btn').addEventListener('click', toggleMic);

init();

/*
How to estabish connection between the peers: 
1) Need to send the offer along with the ICE candidates to the peer. 
2) Once the per gets the information they are going to create an SDP answer with their info adn send it back to us. 
3) Once that exchange takes place the two peers are now connected and data can begin flowing 

- This is usually done through a rprocess called signaling. 
    - Essentially you would get some users in a room together and use something like websockets to exchange this data in real time. It makes it seem seamlessly in the background. 

Instead of bulding our own signaling server and using websockets manually, we;re going to use a thrid-party service called Agora. 
    - Agora gives us an SDK to make all of this possible w/o having us to build it all out on our own.
*/

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

// Get access to camera's audio and video
let localStream; // Local camera's video feed and mic audio
let remoteStream; // Will be the other user's data
let peerConnection;

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
  //    - index.html?room=234234
  channel = client.createChannel('main');
  // 4) Join the channel
  await channel.join();

  channel.on('MemberJoined', handleUserJoined);

  // This will response to the offer received.
  client.on('MessageFromPeer', handleMessageFromPeer);

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  document.getElementById('user-1').srcObject = localStream;
};

// Function that will handle the message sent from the peer.
let handleMessageFromPeer = async (message, memeberId) => {
  message = JSON.parse(message.text);
  console.log('Message:', message);
};

// Funtion that will be called when a new user joins the channel.
let handleUserJoined = async (memeberId) => {
  console.log('A new user joined the channel:', memeberId);
  createOffer(memeberId);
};

let createPeerConnection = async (memeberId) => {
  // 1) Establishes the peer connection. This is the interface that stores all the info between us and the reomote peer.
  peerConnection = new RTCPeerConnection(servers);

  // 2) Sets up the media stream.
  remoteStream = new MediaStream();
  document.getElementById('user-2').srcObject = remoteStream;

  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    document.getElementById('user-1').srcObject = localStream;
  }

  // This will get the local traks (audio and video) and adds it to the peerConnection so that the peer can get them.
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Listen for the event when the peer add their tracks too
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      client.sendMessageToPeer(
        {
          text: JSON.stringify({
            type: 'condidate',
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

// Create Answer
let createAnswer = async (memeberId, offer) => {
  await createPeerConnection(memeberId);

  await peerConnection.setRemoteDescription(offer);

  let answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
};

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

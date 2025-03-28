/// This file is for testing on the local host
/// Please run this with node index.js
/// Please make sure that the cors origin is filled with your default port or the port that you wish to run your application on
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {

  cors: {
    origin: 'http://localhost:8100', // Replace with the actual origin of your Angular application
    methods: ['GET', 'POST'], // Adjust the allowed methods based on your requirements
    allowedHeaders: ['Content-Type'], // Adjust the allowed headers based on your requirements
    credentials: true, // Set it to true if you want to include cookies in the CORS request
  },

});

app.get('/', (req, res) => {
  res.send('<h1>Socket io server!</h1>');
});


io.on('connection', (socket) => {
  console.log('A user connected');
    socket.on('join-room', (roomId, userId) => {
    console.log(`User ${userId} joined room ${roomId}`);
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);

      // Listen for 'point-selected' event
    socket.on('point-selected', (selectedPoint) => {
      // Debug log to check if 'point-selected' event is being received
      console.log(`server Received 'point-selected' event with data:`, selectedPoint);
      // When a 'point-selected' event is received, broadcast it to all other users in the room
      socket.to(roomId).emit('point-selected', selectedPoint);
   });
   

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected`);
      socket.to(roomId).emit('user-disconnected', userId);

    });

  });

});

/// Latency Testing
//    socket.on("echo", (callback) => {
//      callback();
//    });
//  });
// });

server.listen(4000, () => {
  console.log('Server running on port 4000');
});


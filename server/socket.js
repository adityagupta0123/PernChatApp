const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const setupSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    allowEIO3: true
  });

  // Store online users
  const onlineUsers = new Map();

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
      socket.userId = decoded.id;
      next();
    } catch (err) {
      console.error('Socket authentication error:', err);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.userId);
    
    // Store user's socket id
    onlineUsers.set(socket.userId, socket.id);
    
    // Broadcast online users
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));

    // Handle private messages
    socket.on('privateMessage', async (data) => {
      try {
        const { recipientId, message } = data;
        const recipientSocketId = onlineUsers.get(recipientId);
        
        // Send to recipient if online
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('privateMessage', {
            message: {
              id: message.id,
              sender_id: socket.userId,
              recipient_id: recipientId,
              sender_name: message.sender_name,
              encrypted_content: message.encrypted_content,
              nonce: message.nonce,
              ephemeral_public_key: message.ephemeral_public_key,
              created_at: message.created_at || new Date().toISOString()
            }
          });
        }
      } catch (error) {
        console.error('Error handling private message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle group messages
    socket.on('groupMessage', async (data) => {
      try {
        const { groupId, message } = data;
        console.log('Received group message:', { groupId, message });
        
        // Broadcast to all users in the group, including sender
        io.to(`group:${groupId}`).emit('groupMessage', {
          id: message.id,
          sender_id: socket.userId,
          sender_name: message.sender_name,
          group_id: groupId,
          content: message.content,
          created_at: message.created_at || new Date().toISOString()
        });
      } catch (error) {
        console.error('Error handling group message:', error);
        socket.emit('error', { message: 'Failed to send group message' });
      }
    });

    // Join group
    socket.on('joinGroup', (groupId) => {
      console.log(`User ${socket.userId} joining group ${groupId}`);
      socket.join(`group:${groupId}`);
    });

    // Leave group
    socket.on('leaveGroup', (groupId) => {
      console.log(`User ${socket.userId} leaving group ${groupId}`);
      socket.leave(`group:${groupId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.userId);
      onlineUsers.delete(socket.userId);
      io.emit('onlineUsers', Array.from(onlineUsers.keys()));
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

module.exports = setupSocket;

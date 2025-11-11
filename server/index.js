const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIO = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS Configuration - Open to all origins
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true
};

const io = socketIO(server, {
  cors: {
    ...corsOptions,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Increased limit for bulk operations
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection with better timeout settings
const mongoOptions = {
  serverSelectionTimeoutMS: 30000, // 30 seconds
  socketTimeoutMS: 45000, // 45 seconds
  connectTimeoutMS: 30000, // 30 seconds
  maxPoolSize: 10, // Maintain up to 10 socket connections
  bufferCommands: false, // Disable mongoose buffering
};

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/roombooking';
const mongoDbName = process.env.MONGODB_DB_NAME;
const connectionOptions = mongoDbName ? { ...mongoOptions, dbName: mongoDbName } : mongoOptions;

mongoose.connect(mongoUri, connectionOptions)
  .then(() => {
    console.log('✅ MongoDB Connected');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    console.log('🔄 Retrying connection in 5 seconds...');
    setTimeout(() => {
      mongoose.connect(mongoUri, connectionOptions)
        .then(() => console.log('✅ MongoDB Reconnected'))
        .catch(err => console.error('❌ MongoDB Reconnection Failed:', err));
    }, 5000);
  });

// Socket.IO Connection
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  socket.on('join-admin', () => {
    socket.join('admin-room');
    console.log('👨‍💼 Admin joined');
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// Root health check - for easy monitoring
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Saint Mark Booking System Backend is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/room-groups', require('./routes/roomGroups'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/export', require('./routes/export'));
app.use('/api/admin-actions', require('./routes/adminActions'));


// Note: Frontend is deployed separately on Vercel
// No need to serve static files from backend

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});


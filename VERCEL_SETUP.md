# Vercel Serverless Setup Guide

This project has been converted to work with Vercel's serverless architecture. Here's how to deploy and configure it.

## Environment Variables

Set these environment variables in your Vercel dashboard:

### Required Variables:
- `MONGODB_URI` - Your MongoDB connection string (use MongoDB Atlas for production)
- `JWT_SECRET` - A secure secret key for JWT authentication
- `ADMIN_USERNAME` - Admin username (default: admin)
- `ADMIN_PASSWORD` - Admin password (default: admin123)

### Example Values:
```
MONGODB_URI=mongodb+srv://bookingadmin:lUiBEeVo9LzGEdhY@bookingcluster.2y1krrh.mongodb.net/?retryWrites=true&w=majority&appName=BookingCluster
   JWT_SECRET=your-super-secret-jwt-key-here
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your-secure-password
```

## Deployment Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy the project**:
   ```bash
   vercel --prod
   ```

4. **Set environment variables** in Vercel dashboard:
   - Go to your project in Vercel dashboard
   - Navigate to Settings > Environment Variables
   - Add all required variables listed above

5. **Redeploy** after setting environment variables:
   ```bash
   vercel --prod
   ```

## Local Development

1. **Install dependencies**:
   ```bash
   npm run install-all
   ```

2. **Set up environment variables**:
   Create a `.env.local` file in the root directory with your local values:
   ```
   MONGODB_URI=mongodb://localhost:27017/roombooking
   JWT_SECRET=your-local-secret
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin123
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── api/                    # Serverless functions
│   ├── auth/              # Authentication endpoints
│   ├── bookings/          # Booking management
│   ├── rooms/             # Room management
│   ├── room-groups/       # Room group management
│   ├── slots/             # Time slot management
│   ├── export/            # Data export
│   └── lib/               # Shared utilities
├── client/                # React frontend
├── server/                # Original server files (kept for models)
├── vercel.json           # Vercel configuration
└── package.json          # Root package.json
```

## Key Changes Made

1. **Serverless Functions**: All Express routes converted to Vercel serverless functions
2. **Database Connection**: Optimized for serverless with connection pooling
3. **Real-time Features**: Socket.IO replaced with polling service
4. **API Endpoints**: Updated to work with Vercel's routing
5. **CORS**: Configured for serverless environment

## Features

- ✅ User booking system
- ✅ Admin dashboard
- ✅ Room and slot management
- ✅ Booking approval/rejection
- ✅ Data export
- ✅ Responsive design
- ✅ Arabic language support

## Notes

- The system uses polling instead of WebSockets for real-time updates
- All database models are preserved from the original server
- Authentication uses JWT tokens with automatic refresh
- The frontend is served as static files by Vercel
- API functions are deployed as serverless endpoints

## Troubleshooting

1. **Database Connection Issues**: Ensure your MongoDB URI is correct and accessible
2. **Authentication Errors**: Check JWT_SECRET is set correctly
3. **CORS Issues**: The serverless functions include CORS headers
4. **Build Errors**: Make sure all dependencies are installed

For more help, check the Vercel documentation or the original project files.

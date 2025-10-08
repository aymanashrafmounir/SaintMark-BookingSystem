import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SplashScreen from './components/SplashScreen';
import UserPortal from './pages/UserPortal';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [animateOut, setAnimateOut] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if admin is already logged in
    const token = localStorage.getItem('adminToken');
    if (token) {
      setIsAuthenticated(true);
    }

    // Start exit animation after 3 seconds
    const animateTimer = setTimeout(() => {
      setAnimateOut(true);
    }, 3000);

    // Hide splash screen completely after animation (3s + 1s animation)
    const hideTimer = setTimeout(() => {
      setShowSplash(false);
    }, 4000);

    return () => {
      clearTimeout(animateTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (showSplash) {
    return <SplashScreen animateOut={animateOut} />;
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<UserPortal />} />
          <Route 
            path="/admin" 
            element={
              isAuthenticated ? 
              <Navigate to="/admin/dashboard" /> : 
              <AdminLogin setIsAuthenticated={setIsAuthenticated} />
            } 
          />
          <Route 
            path="/admin/login" 
            element={
              isAuthenticated ? 
              <Navigate to="/admin/dashboard" /> : 
              <AdminLogin setIsAuthenticated={setIsAuthenticated} />
            } 
          />
          <Route 
            path="/admin/dashboard" 
            element={
              isAuthenticated ? 
              <AdminDashboard setIsAuthenticated={setIsAuthenticated} /> : 
              <Navigate to="/admin" />
            } 
          />
        </Routes>
        <ToastContainer 
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </div>
    </Router>
  );
}

export default App;


import React from 'react';
import './SplashScreen.css';

function SplashScreen({ animateOut }) {
  return (
    <div className={`splash-screen ${animateOut ? 'animate-out' : ''}`}>
      <div className={`splash-content ${animateOut ? 'animate-out' : ''}`}>
        <img 
          src="/Logo.jpg" 
          alt="Logo" 
          className="splash-logo"
          onError={(e) => {
            // Fallback if logo doesn't exist
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'block';
          }}
        />
        <div className="splash-fallback" style={{ display: 'none' }}>
          <img src="/Logo.jpg" alt="Logo" className="fallback-icon" />
          <h1>نظام حجز الأماكن</h1>
        </div>
        <div className="splash-loader"></div>
      </div>
    </div>
  );
}

export default SplashScreen;


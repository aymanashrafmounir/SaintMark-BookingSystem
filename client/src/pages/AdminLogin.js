import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authAPI } from '../services/api';
import { Lock, User } from 'lucide-react';
import './AdminLogin.css';

function AdminLogin({ setIsAuthenticated }) {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authAPI.login(credentials);
      localStorage.setItem('adminToken', response.data.token);
      localStorage.setItem('adminUser', JSON.stringify(response.data.admin));
      setIsAuthenticated(true);
      toast.success('تم تسجيل الدخول بنجاح!');
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="lock-icon">
              <Lock size={48} />
            </div>
            <h1>تسجيل دخول المشرف</h1>
            <p>قم بتسجيل الدخول لإدارة الحجوزات</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username">
                <User size={18} /> اسم المستخدم
              </label>
              <input
                type="text"
                id="username"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                required
                placeholder="أدخل اسم المستخدم"
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <Lock size={18} /> كلمة المرور
              </label>
              <input
                type="password"
                id="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                required
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'جاري التسجيل...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="login-footer">
            <button 
              className="back-to-home"
              onClick={() => navigate('/')}
            >
              ← العودة للصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;


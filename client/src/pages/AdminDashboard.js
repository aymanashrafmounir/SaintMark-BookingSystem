import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { 
  Home, 
  Calendar, 
  Bell, 
  Download,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw
} from 'lucide-react';
import { roomAPI, slotAPI, bookingAPI, exportAPI } from '../services/api';
import socketService from '../services/socket';
import './AdminDashboard.css';

// Helper function to convert 24h time to 12h format
const formatTime12Hour = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'م' : 'ص'; // م for PM (مساءً), ص for AM (صباحاً)
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

// Helper function to format time range properly for RTL
const formatTimeRange = (startTime, endTime) => {
  const start = formatTime12Hour(startTime);
  const end = formatTime12Hour(endTime);
  // Use "حتى" instead of dash to avoid RTL issues
  return `${start} حتى ${end}`;
};

function AdminDashboard({ setIsAuthenticated }) {
  const [activeTab, setActiveTab] = useState('rooms');
  const [rooms, setRooms] = useState([]);
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null);
  
  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    onConfirm: null
  });

  const [roomForm, setRoomForm] = useState({ name: '', isEnabled: true });
  const [slotForm, setSlotForm] = useState({
    roomId: '',
    startTime: '',
    endTime: '',
    serviceName: '',
    providerName: '',
    date: '',
    type: 'single',
    weeklyOccurrences: 1
  });
  
  const [makeAvailable, setMakeAvailable] = useState(true);
  
  // Slot filters
  const [slotFilters, setSlotFilters] = useState({
    roomId: '',
    serviceName: '',
    providerName: '',
    type: '',
    date: '',
    startTime: '',
    endTime: ''
  });

  // Open confirmation modal
  const openConfirmModal = (title, message, onConfirm) => {
    setConfirmConfig({ title, message, onConfirm });
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    if (confirmConfig.onConfirm) {
      confirmConfig.onConfirm();
    }
    setShowConfirmModal(false);
  };

  const loadRooms = useCallback(async () => {
    try {
      const response = await roomAPI.getAll();
      setRooms(response.data);
    } catch (error) {
      console.error('Load rooms error:', error);
    }
  }, []);

  const loadSlots = useCallback(async () => {
    try {
      const response = await slotAPI.getAll();
      setSlots(response.data);
    } catch (error) {
      console.error('Load slots error:', error);
    }
  }, []);

  const loadBookings = useCallback(async () => {
    try {
      const [allResponse, pendingResponse] = await Promise.all([
        bookingAPI.getAll(),
        bookingAPI.getPending()
      ]);
      setBookings(allResponse.data);
      setPendingBookings(pendingResponse.data);
    } catch (error) {
      console.error('Load bookings error:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    
    // Timeout to handle slow backend response (Render cold start)
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
      toast.error('انتهت مهلة الاتصال. يرجى تحديث الصفحة.');
    }, 30000); // 30 seconds timeout
    
    try {
      await Promise.all([loadRooms(), loadSlots(), loadBookings()]);
      clearTimeout(loadingTimeout);
    } catch (error) {
      clearTimeout(loadingTimeout);
      console.error('Load data error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'خطأ في الاتصال';
      toast.error(`فشل تحميل البيانات: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [loadRooms, loadSlots, loadBookings]);

  useEffect(() => {
    loadData();
    
    // Connect to socket
    socketService.connect();
    socketService.joinAdmin();

    // Listen for new booking requests
    socketService.onNewBookingRequest((booking) => {
      toast.info('تم استلام طلب حجز جديد!');
      loadBookings();
    });

    socketService.onBookingApproved(() => {
      loadBookings();
      loadSlots();
    });

    return () => {
      socketService.removeListener('new-booking-request');
      socketService.removeListener('booking-approved');
    };
  }, [loadData, loadBookings, loadSlots]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    try {
      if (editingRoom) {
        await roomAPI.update(editingRoom._id, roomForm);
        toast.success('تم تحديث المكان بنجاح');
      } else {
        await roomAPI.create(roomForm);
        toast.success('تم إنشاء المكان بنجاح');
      }
      setShowRoomModal(false);
      setRoomForm({ name: '', isEnabled: true });
      setEditingRoom(null);
      loadRooms();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleDeleteRoom = async (id) => {
    openConfirmModal(
      '🗑️ حذف المكان',
      'هل أنت متأكد من حذف هذا المكان؟ سيتم حذف جميع الأوقات المرتبطة به.',
      async () => {
        try {
          await roomAPI.delete(id);
          toast.success('تم حذف المكان بنجاح');
          loadRooms();
          loadSlots();
        } catch (error) {
          toast.error('فشل حذف المكان');
        }
      }
    );
  };

  const handleToggleRoomStatus = async (room) => {
    try {
      await roomAPI.update(room._id, { isEnabled: !room.isEnabled });
      toast.success(`تم ${!room.isEnabled ? 'تفعيل' : 'تعطيل'} المكان بنجاح`);
      loadRooms();
    } catch (error) {
        toast.error('فشل تحديث حالة المكان');
    }
  };

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    try {
      // If makeAvailable is true, send empty service/provider
      // If false, send the filled values
      const baseSlotData = {
        ...slotForm,
        serviceName: makeAvailable ? '' : slotForm.serviceName,
        providerName: makeAvailable ? '' : slotForm.providerName
      };
      
      if (editingSlot) {
        await slotAPI.update(editingSlot._id, baseSlotData);
        toast.success('تم تحديث الموعد بنجاح');
      } else {
        // If weekly and multiple occurrences, create multiple slots
        if (slotForm.type === 'weekly' && slotForm.weeklyOccurrences > 1) {
          const startDate = new Date(slotForm.date);
          const occurrences = parseInt(slotForm.weeklyOccurrences);
          
          // Create multiple slots with 7-day intervals
          const createPromises = [];
          for (let i = 0; i < occurrences; i++) {
            const slotDate = new Date(startDate);
            slotDate.setDate(startDate.getDate() + (i * 7)); // Add 7 days for each occurrence
            
            const slotData = {
              ...baseSlotData,
              date: slotDate.toISOString().split('T')[0]
            };
            
            createPromises.push(slotAPI.create(slotData));
          }
          
          await Promise.all(createPromises);
          toast.success(`تم إنشاء ${occurrences} موعد أسبوعي بنجاح!`);
        } else {
          // Single slot creation
          await slotAPI.create(baseSlotData);
          toast.success('تم إنشاء الموعد بنجاح');
        }
      }
      
      setShowSlotModal(false);
      setSlotForm({
        roomId: '',
        startTime: '',
        endTime: '',
        serviceName: '',
        providerName: '',
        date: '',
        type: 'single',
        weeklyOccurrences: 1
      });
      setEditingSlot(null);
      setMakeAvailable(true);
      loadSlots();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleDeleteSlot = async (slot) => {
    // If it's a weekly slot, show modal with options
    if (slot.type === 'weekly') {
      setSlotToDelete(slot);
      setShowDeleteModal(true);
    } else {
      // For single slots, delete with custom confirmation
      openConfirmModal(
        '🗑️ حذف الموعد',
        'هل أنت متأكد من حذف هذا الموعد؟',
        async () => {
          try {
            await slotAPI.delete(slot._id);
            toast.success('تم حذف الموعد بنجاح');
            loadSlots();
          } catch (error) {
            toast.error('فشل حذف الموعد');
          }
        }
      );
    }
  };

  const handleDeleteSingleSlot = async () => {
    try {
      await slotAPI.delete(slotToDelete._id);
      toast.success('Slot deleted successfully');
      setShowDeleteModal(false);
      setSlotToDelete(null);
      loadSlots();
    } catch (error) {
      toast.error('Failed to delete slot');
    }
  };

  const handleDeleteAllWeeklySlots = async () => {
    try {
      // Find all weekly slots with same time, service, and provider
      const matchingSlots = slots.filter(slot => 
        slot.type === 'weekly' &&
        slot.roomId._id === slotToDelete.roomId._id &&
        slot.startTime === slotToDelete.startTime &&
        slot.endTime === slotToDelete.endTime &&
        slot.serviceName === slotToDelete.serviceName &&
        slot.providerName === slotToDelete.providerName
      );

      // Delete all matching slots
      const deletePromises = matchingSlots.map(slot => slotAPI.delete(slot._id));
      await Promise.all(deletePromises);

      toast.success(`تم حذف ${matchingSlots.length} موعد أسبوعي بنجاح!`);
      setShowDeleteModal(false);
      setSlotToDelete(null);
      loadSlots();
    } catch (error) {
      toast.error('فشل حذف المواعيد الأسبوعية');
    }
  };

  const handleApproveBooking = async (id) => {
    try {
      await bookingAPI.approve(id);
      toast.success('تمت الموافقة على الحجز بنجاح');
      loadBookings();
      loadSlots();
    } catch (error) {
      toast.error('فشلت الموافقة على الحجز');
    }
  };

  const handleRejectBooking = async (id) => {
    try {
      await bookingAPI.reject(id);
      toast.success('تم رفض الحجز');
      loadBookings();
    } catch (error) {
      toast.error('فشل رفض الحجز');
    }
  };

  const handleDeleteBooking = async (id, userName) => {
    openConfirmModal(
      '🗑️ حذف الحجز',
      `هل أنت متأكد من حذف حجز ${userName}؟ لا يمكن التراجع عن هذا الإجراء.`,
      async () => {
        try {
          await bookingAPI.delete(id);
          toast.success('تم حذف الحجز بنجاح');
          loadBookings();
        } catch (error) {
          toast.error('فشل حذف الحجز');
        }
      }
    );
  };

  const handleExportExcel = async () => {
    try {
      const response = await exportAPI.downloadExcel();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `booking-export-${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('تم تحميل ملف Excel بنجاح');
    } catch (error) {
      toast.error('فشل تصدير البيانات');
    }
  };

  const openEditRoom = (room) => {
    setEditingRoom(room);
    setRoomForm({ name: room.name, isEnabled: room.isEnabled });
    setShowRoomModal(true);
  };

  const openEditSlot = (slot) => {
    setEditingSlot(slot);
    const hasServiceProvider = slot.serviceName && slot.providerName;
    setMakeAvailable(!hasServiceProvider);
    setSlotForm({
      roomId: slot.roomId._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      serviceName: slot.serviceName || '',
      providerName: slot.providerName || '',
      date: new Date(slot.date).toISOString().split('T')[0],
      type: slot.type,
      weeklyOccurrences: 1
    });
    setShowSlotModal(true);
  };

  // Filter slots based on selected filters
  const getFilteredSlots = () => {
    return slots.filter(slot => {
      // Room filter
      if (slotFilters.roomId && slot.roomId?._id !== slotFilters.roomId) {
        return false;
      }
      
      // Service filter
      if (slotFilters.serviceName && !slot.serviceName.toLowerCase().includes(slotFilters.serviceName.toLowerCase())) {
        return false;
      }
      
      // Provider filter
      if (slotFilters.providerName && !slot.providerName.toLowerCase().includes(slotFilters.providerName.toLowerCase())) {
        return false;
      }
      
      // Type filter
      if (slotFilters.type && slot.type !== slotFilters.type) {
        return false;
      }
      
      // Date filter
      if (slotFilters.date) {
        const slotDate = new Date(slot.date).toISOString().split('T')[0];
        if (slotDate !== slotFilters.date) {
          return false;
        }
      }
      
      // Start time filter
      if (slotFilters.startTime && slot.startTime !== slotFilters.startTime) {
        return false;
      }
      
      // End time filter
      if (slotFilters.endTime && slot.endTime !== slotFilters.endTime) {
        return false;
      }
      
      return true;
    });
  };

  const clearSlotFilters = () => {
    setSlotFilters({
      roomId: '',
      serviceName: '',
      providerName: '',
      type: '',
      date: '',
      startTime: '',
      endTime: ''
    });
  };

  const hasActiveFilters = () => {
    return Object.values(slotFilters).some(value => value !== '');
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <img src="/Logo.jpg" alt="Logo" className="header-logo" />
          <h1>لوحة التحكم</h1>
        </div>
      </header>

      <div className="dashboard-container">
        <div className="dashboard-tabs">
          <button
            className={`tab ${activeTab === 'rooms' ? 'active' : ''}`}
            onClick={() => setActiveTab('rooms')}
          >
            <Home size={20} /> الأماكن ({rooms.length})
          </button>
          <button
            className={`tab ${activeTab === 'slots' ? 'active' : ''}`}
            onClick={() => setActiveTab('slots')}
          >
            <Calendar size={20} /> المواعيد ({slots.length})
          </button>
          <button
            className={`tab ${activeTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookings')}
          >
            <Bell size={20} /> الحجوزات ({pendingBookings.length})
            {pendingBookings.length > 0 && (
              <span className="badge">{pendingBookings.length}</span>
            )}
          </button>
          <button
            className="tab export-tab"
            onClick={handleExportExcel}
          >
            <Download size={20} /> تصدير
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'rooms' && (
            <div className="rooms-section">
              <div className="section-header">
                <h2>إدارة الأماكن</h2>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingRoom(null);
                    setRoomForm({ name: '', isEnabled: true });
                    setShowRoomModal(true);
                  }}
                >
                  <Plus size={18} /> إضافة مكان
                </button>
              </div>

              <div className="rooms-grid">
                {rooms.map((room) => (
                  <div key={room._id} className="room-card">
                    <div className="room-header">
                      <h3>{room.name}</h3>
                      <span className={`status-badge ${room.isEnabled ? 'enabled' : 'disabled'}`}>
                        {room.isEnabled ? 'مفعّل' : 'معطّل'}
                      </span>
                    </div>
                    <div className="room-actions">
                      <button
                        className={`btn-toggle ${room.isEnabled ? 'enabled' : 'disabled'}`}
                        onClick={() => handleToggleRoomStatus(room)}
                        title={room.isEnabled ? 'تعطيل المكان' : 'تفعيل المكان'}
                      >
                        {room.isEnabled ? '❌ تعطيل' : '✅ تفعيل'}
                      </button>
                      <button
                        className="btn-edit"
                        onClick={() => openEditRoom(room)}
                      >
                        <Edit2 size={16} /> تعديل
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteRoom(room._id)}
                      >
                        <Trash2 size={16} /> حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'slots' && (
            <div className="slots-section">
              <div className="section-header">
                <h2>إدارة المواعيد</h2>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingSlot(null);
                    setMakeAvailable(true);
                    setSlotForm({
                      roomId: '',
                      startTime: '',
                      endTime: '',
                      serviceName: '',
                      providerName: '',
                      date: '',
                      type: 'single',
                      weeklyOccurrences: 1
                    });
                    setShowSlotModal(true);
                  }}
                >
                  <Plus size={18} /> إضافة موعد
                </button>
              </div>

              {/* Slot Filters */}
              <div className="filters-container">
                <div className="filters-header">
                  <h3>🔍 تصفية المواعيد</h3>
                  {hasActiveFilters() && (
                    <button className="btn-clear-filters" onClick={clearSlotFilters}>
                      <X size={16} /> إزالة التصفية
                    </button>
                  )}
                </div>
                <div className="filters-grid">
                  <div className="filter-item">
                    <label>المكان</label>
                    <select
                      value={slotFilters.roomId}
                      onChange={(e) => setSlotFilters({ ...slotFilters, roomId: e.target.value })}
                    >
                      <option value="">جميع الأماكن</option>
                      {rooms.map((room) => (
                        <option key={room._id} value={room._id}>{room.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-item">
                    <label>التاريخ</label>
                    <input
                      type="date"
                      value={slotFilters.date}
                      onChange={(e) => setSlotFilters({ ...slotFilters, date: e.target.value })}
                      placeholder="تصفية بالتاريخ"
                    />
                  </div>

                  <div className="filter-item">
                    <label>النوع</label>
                    <select
                      value={slotFilters.type}
                      onChange={(e) => setSlotFilters({ ...slotFilters, type: e.target.value })}
                    >
                      <option value="">جميع الأنواع</option>
                      <option value="single">مرة واحدة</option>
                      <option value="weekly">أسبوعي</option>
                    </select>
                  </div>

                  <div className="filter-item">
                    <label>وقت البداية</label>
                    <input
                      type="time"
                      value={slotFilters.startTime}
                      onChange={(e) => setSlotFilters({ ...slotFilters, startTime: e.target.value })}
                      placeholder="تصفية بوقت البداية"
                    />
                  </div>

                  <div className="filter-item">
                    <label>وقت النهاية</label>
                    <input
                      type="time"
                      value={slotFilters.endTime}
                      onChange={(e) => setSlotFilters({ ...slotFilters, endTime: e.target.value })}
                      placeholder="تصفية بوقت النهاية"
                    />
                  </div>

                  <div className="filter-item">
                    <label>اسم الخدمة</label>
                    <input
                      type="text"
                      value={slotFilters.serviceName}
                      onChange={(e) => setSlotFilters({ ...slotFilters, serviceName: e.target.value })}
                      placeholder="بحث بالخدمة"
                    />
                  </div>

                  <div className="filter-item">
                    <label>اسم الخادم</label>
                    <input
                      type="text"
                      value={slotFilters.providerName}
                      onChange={(e) => setSlotFilters({ ...slotFilters, providerName: e.target.value })}
                      placeholder="بحث بالخادم"
                    />
                  </div>

                  <div className="filter-stats">
                    <span className="stats-badge">
                      عرض {getFilteredSlots().length} من {slots.length} موعد
                    </span>
                  </div>
                </div>
              </div>

              <div className="slots-table-container">
                <table className="slots-table">
                  <thead>
                    <tr>
                      <th>المكان</th>
                      <th>التاريخ</th>
                      <th>الوقت</th>
                      <th>الخدمة</th>
                      <th>الخادم</th>
                      <th>النوع</th>
                      <th>الحالة</th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredSlots().length === 0 ? (
                      <tr>
                        <td colSpan="8" className="no-results">
                          <div className="no-results-content">
                            <Calendar size={48} />
                            <p>لا توجد مواعيد تطابق التصفية</p>
                            {hasActiveFilters() && (
                              <button className="btn-secondary" onClick={clearSlotFilters}>
                                إزالة التصفية
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      getFilteredSlots().map((slot) => (
                      <tr key={slot._id}>
                        <td>{slot.roomId?.name || 'N/A'}</td>
                        <td>{new Date(slot.date).toLocaleDateString('ar-EG')}</td>
                        <td>{formatTimeRange(slot.startTime, slot.endTime)}</td>
                        <td>{slot.serviceName}</td>
                        <td>{slot.providerName}</td>
                        <td>
                          <span className={`type-badge ${slot.type}`}>
                            {slot.type === 'weekly' ? 'أسبوعي' : 'مرة واحدة'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${slot.status}`}>
                            {slot.status === 'available' ? 'متاح' : 'محجوز'}
                          </span>
                          {slot.bookedBy && (
                            <div className="booked-by">بواسطة {slot.bookedBy}</div>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-icon-small"
                              onClick={() => openEditSlot(slot)}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn-icon-small delete"
                              onClick={() => handleDeleteSlot(slot)}
                              title={slot.type === 'weekly' ? 'حذف المواعيد الأسبوعية' : 'حذف الموعد'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="bookings-section">
              <div className="section-header">
                <h2>الحجوزات المعلقة</h2>
                <button className="btn-refresh" onClick={loadBookings}>
                  <RefreshCw size={18} /> تحديث
                </button>
              </div>
              {pendingBookings.length === 0 ? (
                <div className="empty-state">
                  <Bell size={48} />
                  <p>لا توجد طلبات حجز معلقة</p>
                </div>
              ) : (
                <div className="bookings-grid">
                  {pendingBookings.map((booking) => (
                    <div key={booking._id} className="booking-card pending">
                      <div className="booking-header">
                        <h3>{booking.userName}</h3>
                        <span className="status-badge pending">معلق</span>
                      </div>
                      <div className="booking-details">
                        <p><strong>المكان:</strong> {booking.roomId?.name}</p>
                        <p><strong>التاريخ:</strong> {new Date(booking.date).toLocaleDateString('ar-EG')}</p>
                        <p><strong>الوقت:</strong> {formatTimeRange(booking.startTime, booking.endTime)}</p>
                        <p><strong>الخدمة:</strong> {booking.serviceName}</p>
                        <p><strong>الخادم:</strong> {booking.providerName}</p>
                      </div>
                      <div className="booking-actions">
                        <button
                          className="btn-success"
                          onClick={() => handleApproveBooking(booking._id)}
                        >
                          <Check size={16} /> موافقة
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => handleRejectBooking(booking._id)}
                        >
                          <X size={16} /> رفض
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="section-header">
                <h2 className="section-title">سجل الحجوزات</h2>
              </div>
              <div className="bookings-history">
                {bookings.filter(b => b.status !== 'pending').map((booking) => (
                  <div key={booking._id} className={`booking-card ${booking.status}`}>
                    <div className="booking-header">
                      <h4>{booking.userName}</h4>
                      <span className={`status-badge ${booking.status}`}>
                        {booking.status === 'approved' ? 'موافق عليه' : booking.status === 'rejected' ? 'مرفوض' : booking.status}
                      </span>
                    </div>
                    <div className="booking-details">
                      <p><strong>المكان:</strong> {booking.roomId?.name}</p>
                      <p><strong>التاريخ:</strong> {new Date(booking.date).toLocaleDateString('ar-EG')}</p>
                      <p><strong>الوقت:</strong> {formatTimeRange(booking.startTime, booking.endTime)}</p>
                    </div>
                    <div className="booking-actions">
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteBooking(booking._id, booking.userName)}
                        title="حذف الحجز"
                      >
                        <Trash2 size={16} /> حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Room Modal */}
      {showRoomModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editingRoom ? 'تعديل المكان' : 'إضافة مكان جديد'}</h2>
              <button onClick={() => setShowRoomModal(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateRoom} className="modal-form">
              <div className="form-group">
                <label>اسم المكان</label>
                <input
                  type="text"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  required
                  placeholder="أدخل اسم المكان"
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={roomForm.isEnabled}
                    onChange={(e) => setRoomForm({ ...roomForm, isEnabled: e.target.checked })}
                  />
                  <span>تفعيل هذا المكان</span>
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowRoomModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  {editingRoom ? 'تحديث' : 'إنشاء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slot Modal */}
      {showSlotModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editingSlot ? 'تعديل الموعد' : 'إضافة موعد جديد'}</h2>
              <button onClick={() => setShowSlotModal(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateSlot} className="modal-form">
              <div className="form-group">
                <label>المكان</label>
                <select
                  value={slotForm.roomId}
                  onChange={(e) => setSlotForm({ ...slotForm, roomId: e.target.value })}
                  required
                >
                  <option value="">اختر المكان</option>
                  {rooms.filter(r => r.isEnabled).map((room) => (
                    <option key={room._id} value={room._id}>{room.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>وقت البداية</label>
                  <input
                    type="time"
                    value={slotForm.startTime}
                    onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>وقت النهاية</label>
                  <input
                    type="time"
                    value={slotForm.endTime}
                    onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>التاريخ {slotForm.type === 'weekly' ? '(التكرار الأول)' : ''}</label>
                  <input
                    type="date"
                    value={slotForm.date}
                    onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>النوع</label>
                  <select
                    value={slotForm.type}
                    onChange={(e) => setSlotForm({ ...slotForm, type: e.target.value, weeklyOccurrences: 1 })}
                    required
                  >
                    <option value="single">مرة واحدة</option>
                    <option value="weekly">أسبوعي</option>
                  </select>
                </div>
              </div>
              
              {slotForm.type === 'weekly' && !editingSlot && (
                <div className="form-group weekly-occurrences">
                  <label>
                    عدد الأسابيع (كم موعد أسبوعي سيتم إنشاؤه؟)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={slotForm.weeklyOccurrences}
                    onChange={(e) => setSlotForm({ ...slotForm, weeklyOccurrences: e.target.value })}
                    placeholder="مثال: 3 (ينشئ 3 مواعيد، كل 7 أيام)"
                  />
                  <div className="weekly-preview">
                    {slotForm.date && slotForm.weeklyOccurrences > 0 && (
                      <div className="preview-dates">
                        <strong>سيتم إنشاء {slotForm.weeklyOccurrences} موعد:</strong>
                        {Array.from({ length: Math.min(parseInt(slotForm.weeklyOccurrences) || 1, 10) }).map((_, i) => {
                          const date = new Date(slotForm.date);
                          date.setDate(date.getDate() + (i * 7));
                          return (
                            <span key={i} className="preview-date">
                              📅 {date.toLocaleDateString('ar-EG')}
                            </span>
                          );
                        })}
                        {slotForm.weeklyOccurrences > 10 && (
                          <span className="preview-more">... و {slotForm.weeklyOccurrences - 10} موعد آخر</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="form-group availability-toggle">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={makeAvailable}
                    onChange={(e) => setMakeAvailable(e.target.checked)}
                  />
                  <span>جعل هذا الموعد متاحاً للحجز (خدمة وخادم فارغين)</span>
                </label>
              </div>
              
              {!makeAvailable && (
                <>
                  <div className="form-group">
                    <label>اسم الخدمة (سيكون الموعد غير متاح)</label>
                    <input
                      type="text"
                      value={slotForm.serviceName}
                      onChange={(e) => setSlotForm({ ...slotForm, serviceName: e.target.value })}
                      placeholder="مثال: اجتماع، تدريب"
                    />
                  </div>
                  <div className="form-group">
                    <label>اسم الخادم (سيكون الموعد غير متاح)</label>
                    <input
                      type="text"
                      value={slotForm.providerName}
                      onChange={(e) => setSlotForm({ ...slotForm, providerName: e.target.value })}
                      placeholder="مثال: فيلوباتير ماجد"
                    />
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowSlotModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  {editingSlot ? 'تحديث' : 'إنشاء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Weekly Slots */}
      {showDeleteModal && slotToDelete && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <div className="modal-header">
              <h2>🗑️ حذف موعد أسبوعي</h2>
              <button onClick={() => {
                setShowDeleteModal(false);
                setSlotToDelete(null);
              }}>
                <X size={24} />
              </button>
            </div>
            
            <div className="delete-modal-content">
              <div className="warning-icon">⚠️</div>
              
              <div className="slot-info">
                <p><strong>المكان:</strong> {slotToDelete.roomId?.name}</p>
                <p><strong>الوقت:</strong> {formatTimeRange(slotToDelete.startTime, slotToDelete.endTime)}</p>
                <p><strong>الخدمة:</strong> {slotToDelete.serviceName || 'غير محدد'}</p>
                <p><strong>الخادم:</strong> {slotToDelete.providerName || 'غير محدد'}</p>
              </div>

              <div className="delete-options">
                <p className="question">ماذا تريد أن تحذف؟</p>
                
                <button 
                  className="delete-option-btn single"
                  onClick={handleDeleteSingleSlot}
                >
                  <span className="option-icon">📅</span>
                  <div className="option-text">
                    <strong>حذف هذا الموعد فقط</strong>
                    <small>حذف هذا التكرار فقط ({new Date(slotToDelete.date).toLocaleDateString('ar-EG')})</small>
                  </div>
                </button>

                <button 
                  className="delete-option-btn all"
                  onClick={handleDeleteAllWeeklySlots}
                >
                  <span className="option-icon">🗓️</span>
                  <div className="option-text">
                    <strong>حذف جميع التكرارات الأسبوعية</strong>
                    <small>حذف جميع المواعيد الأسبوعية المطابقة بنفس الوقت والخدمة</small>
                  </div>
                </button>
              </div>

              <button 
                className="btn-secondary cancel-btn"
                onClick={() => {
                  setShowDeleteModal(false);
                  setSlotToDelete(null);
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal confirm-modal">
            <div className="modal-header">
              <h2>{confirmConfig.title}</h2>
              <button onClick={() => setShowConfirmModal(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="confirm-modal-content">
              <div className="warning-icon">⚠️</div>
              <p className="confirm-message">{confirmConfig.message}</p>
              
              <div className="confirm-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowConfirmModal(false)}
                >
                  إلغاء
                </button>
                <button 
                  className="btn-danger"
                  onClick={handleConfirm}
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;


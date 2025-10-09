import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  Calendar,
  Clock,
  User,
  Send,
  RefreshCw,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { roomAPI, roomGroupAPI, slotAPI, bookingAPI } from '../services/api';
import socketService from '../services/socket';
import './UserPortal.css';

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
  // Force LTR for each time using embedding characters
  return `\u202A${start}\u202C → \u202A${end}\u202C`;
};

function UserPortal() {
  // Helper to get date + days
  const getDatePlusDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  const [rooms, setRooms] = useState([]);
  const [roomGroups, setRoomGroups] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(getDatePlusDays(7)); // Default: +7 days
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [userName, setUserName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  // Pagination for slots
  const [slotsPagination, setSlotsPagination] = useState({ 
    total: 0, 
    page: 1, 
    limit: 10, 
    totalPages: 0 
  });
  const [currentSlotsPage, setCurrentSlotsPage] = useState(1);

  // Get rooms that are NOT in any group
  const getRoomsNotInGroups = useCallback(() => {
    const roomsInGroups = new Set();
    roomGroups.forEach(group => {
      group.rooms.forEach(room => {
        roomsInGroups.add(room._id);
      });
    });
    return rooms.filter(room => !roomsInGroups.has(room._id));
  }, [rooms, roomGroups]);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    
    // Timeout to handle slow backend response (Render cold start)
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
      toast.error('انتهت مهلة الاتصال. يرجى تحديث الصفحة.');
    }, 30000); // 30 seconds timeout
    
    try {
      const [roomsResponse, groupsResponse] = await Promise.all([
        roomAPI.getAll(),
        roomGroupAPI.getAll()
      ]);
      clearTimeout(loadingTimeout);
      
      const enabledRooms = roomsResponse.data.filter(room => room.isEnabled);
      const enabledGroups = groupsResponse.data.filter(group => group.isEnabled);
      
      setRooms(enabledRooms);
      setRoomGroups(enabledGroups);
      // Set default to "all" to show all rooms
      setSelectedRoom('all');
    } catch (error) {
      clearTimeout(loadingTimeout);
      console.error('Load rooms error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'خطأ في الاتصال';
      toast.error(`فشل تحميل الأماكن: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSlotsForDateRange = useCallback(async (roomId, startDate, endDate, append = false, page = 1) => {
    try {
      setLoadingSlots(true);
      
      // Use server-side pagination
      const params = {
        roomId,
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
        page,
        limit: 10
      };
      
      const response = await slotAPI.getAll(params);
      const newSlots = response.data.slots;
      
      setSlots(prevSlots => append ? [...prevSlots, ...newSlots] : newSlots);
      setSlotsPagination(response.data.pagination);
    } catch (error) {
      toast.error('فشل تحميل الأوقات');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const loadAllSlotsForDateRange = useCallback(async (startDate, endDate, append = false, page = 1) => {
    try {
      setLoadingSlots(true);
      
      // Use server-side pagination for all slots
      const params = {
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
        page,
        limit: 10
      };
      
      const response = await slotAPI.getAll(params);
      const newSlots = response.data.slots;
      
      setSlots(prevSlots => append ? [...prevSlots, ...newSlots] : newSlots);
      setSlotsPagination(response.data.pagination);
    } catch (error) {
      console.error('Load all slots error:', error);
      toast.error('فشل تحميل الأوقات');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const loadSlotsForGroup = useCallback(async (group, startDate, endDate, append = false, page = 1) => {
    try {
      if (!group.rooms || group.rooms.length === 0) {
        setSlots([]);
        return;
      }
      
      setLoadingSlots(true);
      
      // Use server-side pagination for group slots
      const roomIds = group.rooms.map(room => room._id);
      const params = {
        roomIds: roomIds.join(','),
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
        page,
        limit: 10
      };
      
      const response = await slotAPI.getAll(params);
      const newSlots = response.data.slots;
      
      setSlots(prevSlots => append ? [...prevSlots, ...newSlots] : newSlots);
      setSlotsPagination(response.data.pagination);
    } catch (error) {
      console.error('Load group slots error:', error);
      toast.error('فشل تحميل الأوقات');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
    
    // Connect to socket for real-time updates
    socketService.connect();

    return () => {
      socketService.removeListener('booking-approved');
      socketService.removeListener('booking-rejected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    // Setup socket listeners when component mounts or dependencies change
    socketService.onBookingApproved((booking) => {
      toast.success('تمت الموافقة على حجز!');
      if (selectedRoom === 'all') {
        loadAllSlotsForDateRange(startDate, endDate);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, startDate, endDate);
      } else if (selectedRoom) {
        loadSlotsForDateRange(selectedRoom._id, startDate, endDate);
      }
    });

    socketService.onBookingRejected(() => {
      if (selectedRoom === 'all') {
        loadAllSlotsForDateRange(startDate, endDate);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, startDate, endDate);
      } else if (selectedRoom) {
        loadSlotsForDateRange(selectedRoom._id, startDate, endDate);
      }
    });
  }, [loadAllSlotsForDateRange, loadSlotsForDateRange, loadSlotsForGroup, selectedRoom, startDate, endDate]);

  // Load initial slots (first page only)
  useEffect(() => {
    if (startDate && endDate && rooms.length > 0) {
      setCurrentSlotsPage(1);
      setSlots([]); // Clear previous slots
      
      if (selectedRoom === 'all') {
        loadAllSlotsForDateRange(startDate, endDate, false, 1);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, startDate, endDate, false, 1);
      } else if (selectedRoom) {
        loadSlotsForDateRange(selectedRoom._id, startDate, endDate, false, 1);
      }
    }
  }, [selectedRoom, startDate, endDate, rooms, loadAllSlotsForDateRange, loadSlotsForDateRange, loadSlotsForGroup]);

  // Function to load more slots (pagination)
  const loadMoreSlots = useCallback(() => {
    const nextPage = currentSlotsPage + 1;
    
    if (nextPage > slotsPagination.totalPages) {
      toast.info('تم تحميل جميع الأوقات المتاحة');
      return;
    }
    
    if (selectedRoom === 'all') {
      loadAllSlotsForDateRange(startDate, endDate, true, nextPage);
    } else if (selectedRoom?.isGroup) {
      loadSlotsForGroup(selectedRoom, startDate, endDate, true, nextPage);
    } else if (selectedRoom) {
      loadSlotsForDateRange(selectedRoom._id, startDate, endDate, true, nextPage);
    }
    
    setCurrentSlotsPage(nextPage);
  }, [currentSlotsPage, slotsPagination.totalPages, startDate, endDate, selectedRoom, loadAllSlotsForDateRange, loadSlotsForGroup, loadSlotsForDateRange]);

  const hasMoreSlots = useCallback(() => {
    return currentSlotsPage < slotsPagination.totalPages;
  }, [currentSlotsPage, slotsPagination.totalPages]);

  const handleBookSlot = (slot) => {
    if (slot.status === 'booked') {
      toast.warning('هذا الوقت محجوز بالفعل');
      return;
    }
    setSelectedSlot(slot);
    setShowBookingModal(true);
  };

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      toast.error('يرجى إدخال اسمك');
      return;
    }
    if (!serviceName.trim()) {
      toast.error('يرجى إدخال اسم الخدمة');
      return;
    }
    if (!phoneNumber.trim()) {
      toast.error('يرجى إدخال رقم الهاتف');
      return;
    }
    
    // Validate phone number
    if (!/^(010|011|012|015)\d{8}$/.test(phoneNumber.trim())) {
      toast.error('رقم الهاتف غير صحيح! يجب أن يبدأ بـ 010, 011, 012, أو 015 ويكون 11 رقم');
      return;
    }

    setSubmitting(true);
    try {
      await bookingAPI.create({
        userName: userName.trim(),
        slotId: selectedSlot._id,
        roomId: selectedSlot.roomId._id || selectedSlot.roomId, // Use slot's roomId for "all" view
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        serviceName: serviceName.trim(),
        providerName: userName.trim(), // Provider Name = User's Full Name
        phoneNumber: phoneNumber.trim(),
        date: selectedSlot.date
      });

      toast.success('تم إرسال طلب الحجز! في انتظار موافقة المشرف...');
      setShowBookingModal(false);
      setUserName('');
      setServiceName('');
      setPhoneNumber('');
      setSelectedSlot(null);
      
      // Reload slots based on current selection
      if (selectedRoom === 'all') {
        loadAllSlotsForDateRange(startDate, endDate);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, startDate, endDate);
      } else {
        loadSlotsForDateRange(selectedRoom._id, startDate, endDate);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل إرسال طلب الحجز');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = () => {
    if (selectedRoom === 'all') {
      loadAllSlotsForDateRange(startDate, endDate);
      toast.info('تم تحديث الأوقات');
    } else if (selectedRoom?.isGroup) {
      loadSlotsForGroup(selectedRoom, startDate, endDate);
      toast.info('تم تحديث الأوقات');
    } else if (selectedRoom) {
      loadSlotsForDateRange(selectedRoom._id, startDate, endDate);
      toast.info('تم تحديث الأوقات');
    }
  };

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <div className="user-portal">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '1rem'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e8eaed',
            borderTop: '3px solid #1a73e8',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{ 
            textAlign: 'center', 
            color: '#5f6368', 
            fontSize: '1rem',
            fontWeight: '400',
            margin: 0
          }}>
            جاري التحميل...
          </p>
          <p style={{ 
            textAlign: 'center', 
            fontSize: '0.875rem', 
            color: '#9aa0a6', 
            margin: 0
          }}>
            يرجى الانتظار
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-portal">
      <header className="portal-header">
        <div className="header-container">
          <img src="/Logo.jpg" alt="Logo" className="header-logo" />
          <div className="header-left">
            <h1>نظام حجز الأماكن</h1>
            <p>اختر مكان وتاريخ لعرض الأوقات المتاحة</p>
          </div>
        </div>
      </header>

      <div className="portal-container">
        {rooms.length === 0 ? (
          <div className="empty-state">
            <Calendar size={64} />
            <h2>لا توجد أماكن متاحة</h2>
            <p>يرجى المحاولة لاحقاً أو الاتصال بالمشرف</p>
          </div>
        ) : (
          <>
            <div className="filters-section">
              <div className="filter-group">
                <label>
                  <Calendar size={18} /> اختر المكان
                </label>
                <select
                  value={
                    selectedRoom === 'all' ? 'all' : 
                    selectedRoom?.isGroup ? `group:${selectedRoom._id}` :
                    selectedRoom?._id || ''
                  }
                  onChange={(e) => {
                    if (e.target.value === 'all') {
                      setSelectedRoom('all');
                    } else if (e.target.value.startsWith('group:')) {
                      const groupId = e.target.value.replace('group:', '');
                      const group = roomGroups.find(g => g._id === groupId);
                      if (group) {
                        setSelectedRoom({ ...group, isGroup: true });
                      }
                    } else {
                      const room = rooms.find(r => r._id === e.target.value);
                      setSelectedRoom(room);
                    }
                  }}
                  className="room-select"
                >
                  <option value="all">🏢 جميع الأماكن</option>
                  
                  {/* Room Groups */}
                  {roomGroups.length > 0 && (
                    <>
                      <option disabled>──── المجموعات ────</option>
                      {roomGroups.map((group) => (
                        <option key={group._id} value={`group:${group._id}`}>
                          📦 {group.name} ({group.rooms.length} أماكن)
                        </option>
                      ))}
                    </>
                  )}
                  
                  {/* Rooms NOT in groups */}
                  {getRoomsNotInGroups().length > 0 && (
                    <>
                      <option disabled>──── الأماكن ────</option>
                      {getRoomsNotInGroups().map((room) => (
                        <option key={room._id} value={room._id}>
                          {room.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              <div className="filter-group">
                <label>
                  <Clock size={18} /> من تاريخ
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // If end date is before start date, update it
                    if (endDate < e.target.value) {
                      setEndDate(e.target.value);
                    }
                  }}
                  min={getTodayDate()}
                  className="date-input"
                />
              </div>

              <div className="filter-group">
                <label>
                  <Clock size={18} /> إلى تاريخ
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="date-input"
                />
              </div>

              <button className="btn-refresh" onClick={handleRefresh}>
                <RefreshCw size={18} /> تحديث
              </button>
            </div>

            <div className="slots-section">
              <div className="section-header">
                <h2>
                  {selectedRoom === 'all' 
                    ? 'الأوقات المتاحة في جميع الأماكن' 
                    : selectedRoom?.isGroup
                    ? `الأوقات المتاحة في مجموعة ${selectedRoom?.name}`
                    : `الأوقات المتاحة في ${selectedRoom?.name}`}
                </h2>
                <span className="slot-count">
                  {slots.filter(s => s.status === 'available').length} متاح
                </span>
              </div>

              {slots.length === 0 && !loadingSlots ? (
                <div className="no-slots">
                  <Calendar size={48} />
                  <p>لا توجد أوقات متاحة لهذا التاريخ</p>
                  <small>جرب اختيار تاريخ آخر</small>
                </div>
              ) : (
                <>
                <div className="slots-grid">
                  {slots.map((slot) => (
                    <div
                      key={slot._id}
                      className={`slot-card ${slot.status}`}
                    >
                      <div className="slot-header-info">
                        {(selectedRoom === 'all' || selectedRoom?.isGroup) && (
                          <div className="slot-room-name">
                            📍 {slot.roomId?.name}
                          </div>
                        )}
                        <div className="slot-date-badge">
                          📅 {new Date(slot.date).toLocaleDateString('ar-EG', { 
                            weekday: 'short', 
                            day: 'numeric', 
                            month: 'short' 
                          })}
                        </div>
                      </div>
                      <div className="slot-time">
                        <Clock size={20} />
                        <span className="time-range">
                          {formatTimeRange(slot.startTime, slot.endTime)}
                        </span>
                      </div>

                      <div className="slot-details">
                        {slot.status === 'available' && (
                          <div className="detail-row available-slot-info">
                            <span className="available-text">✨ متاح للحجز</span>
                          </div>
                        )}
                        {slot.status === 'booked' && slot.serviceName && (
                          <div className="detail-row">
                            <span className="label">الخدمة:</span>
                            <span className="value">{slot.serviceName}</span>
                          </div>
                        )}
                        {slot.status === 'booked' && slot.providerName && (
                          <div className="detail-row">
                            <span className="label">الخادم:</span>
                            <span className="value">{slot.providerName}</span>
                          </div>
                        )}
                        {slot.type === 'weekly' && (
                          <div className="weekly-badge">
                            <Calendar size={14} /> أسبوعي
                          </div>
                        )}
                      </div>

                      {slot.status === 'available' ? (
                        <button
                          className="book-btn"
                          onClick={() => handleBookSlot(slot)}
                        >
                          <Send size={16} /> طلب حجز
                        </button>
                      ) : (
                        <div className="booked-info">
                          <CheckCircle size={18} />
                          <div>
                            <strong>محجوز</strong>
                            {slot.bookedBy && (
                              <p className="booked-by-name">بواسطة {slot.bookedBy}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Load More Button */}
                {hasMoreSlots() && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    marginTop: '2rem',
                    marginBottom: '1rem'
                  }}>
                    <button
                      onClick={loadMoreSlots}
                      disabled={loadingSlots}
                      style={{
                        background: '#1a73e8',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: loadingSlots ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)',
                        transition: 'all 0.2s ease',
                        opacity: loadingSlots ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!loadingSlots) {
                          e.target.style.background = '#1557b0';
                          e.target.style.boxShadow = '0 1px 3px rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#1a73e8';
                        e.target.style.boxShadow = '0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)';
                      }}
                    >
                      {loadingSlots ? (
                        <>
                          <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          جاري التحميل...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={18} />
                          تحميل المزيد من الأوقات
                        </>
                      )}
                    </button>
                  </div>
                )}
                
                {loadingSlots && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '1.5rem',
                    color: '#5f6368',
                    fontSize: '0.875rem'
                  }}>
                    <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
                    <p>جاري تحميل المزيد من الأوقات...</p>
                  </div>
                )}
                </>
              )}
            </div>
          </>
        )}
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Booking Modal */}
      {showBookingModal && selectedSlot && (
        <div className="modal-overlay">
          <div className="modal booking-modal">
            <div className="modal-header">
              <h2>طلب حجز</h2>
              <button onClick={() => setShowBookingModal(false)}>
                <XCircle size={24} />
              </button>
            </div>

            <div className="booking-summary">
              <div className="summary-row">
                <span className="label">المكان:</span>
                <span className="value">{selectedSlot.roomId?.name || selectedRoom?.name}</span>
              </div>
              <div className="summary-row">
                <span className="label">التاريخ:</span>
                <span className="value">
                  {new Date(selectedSlot.date).toLocaleDateString('ar-EG')}
                </span>
              </div>
              <div className="summary-row">
                <span className="label">الوقت:</span>
                <span className="value">
                  {formatTimeRange(selectedSlot.startTime, selectedSlot.endTime)}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitBooking} className="booking-form">
              <div className="form-group">
                <label>
                  <User size={18} /> اسم الخادم
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="أدخل اسمك الكامل"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>
                  📋 اسم الخدمة
                </label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="مثال: فريق سان بول , اسرة اولي ثانوي فصل القديس بولس"
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  📱 رقم الهاتف
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="01xxxxxxxxx (يبدأ بـ 010, 011, 012, أو 015)"
                  pattern="^(010|011|012|015)\d{8}$"
                  maxLength="11"
                  required
                />
                <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                  يجب أن يكون 11 رقم ويبدأ بـ 010, 011, 012, أو 015
                </small>
              </div>

              <div className="info-box">
                <p>
                  📝 سيتم إرسال طلب الحجز إلى المشرف للموافقة عليه.
                  يرجى ملء جميع المعلومات المطلوبة.
                </p>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowBookingModal(false)}
                  disabled={submitting}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="portal-footer">
        <p>© 2025 نظام حجز الأماكن | صُنع بـ ❤️</p>
      </footer>
    </div>
  );
}

export default UserPortal;


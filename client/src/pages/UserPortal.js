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

// Predefined time slots
const TIME_SLOTS = [
  { value: '', label: 'جميع الاوقات' },
  { value: '10:00-12:00', label: formatTimeRange('10:00', '12:00') },
  { value: '12:00-14:00', label: formatTimeRange('12:00', '14:00') },
  { value: '14:00-16:00', label: formatTimeRange('14:00', '16:00') },
  { value: '16:00-18:00', label: formatTimeRange('16:00', '18:00') },
  { value: '18:00-20:00', label: formatTimeRange('18:00', '20:00') },
  { value: '20:00-22:00', label: formatTimeRange('20:00', '22:00') }
];

function UserPortal() {

  const [rooms, setRooms] = useState([]);
  const [roomGroups, setRoomGroups] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [userName, setUserName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [endDate, setEndDate] = useState('');
  
  // Show available places only toggle (default enabled)
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);
  
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

  const loadSlotsForDateAndTime = useCallback(async (roomId, date, timeSlot, append = false, page = 1) => {
    try {
      setLoadingSlots(true);
      const sanitizedDate = typeof date === 'string' ? date.trim() : date;
      
      // Use server-side pagination
      const params = {
        roomId,
        page,
        limit: 10
      };

      if (sanitizedDate) {
        params.date = sanitizedDate;
      }
      
      // Only add time filters if a specific time slot is selected
      if (timeSlot) {
        const [startTime, endTime] = timeSlot.split('-');
        params.startTime = startTime;
        params.endTime = endTime;
      }
      
      const response = await slotAPI.getPublic(params);
      let newSlots = response.data.slots;
      
      // Filter out booked slots if showAvailableOnly is enabled
      if (showAvailableOnly) {
        newSlots = newSlots.filter(slot => slot.status === 'available');
      }
      
      setSlots(prevSlots => append ? [...prevSlots, ...newSlots] : newSlots);
      setSlotsPagination(response.data.pagination);
    } catch (error) {
      toast.error('فشل تحميل الأوقات');
    } finally {
      setLoadingSlots(false);
    }
  }, [showAvailableOnly]);

  const loadAllSlotsForDateAndTime = useCallback(async (date, timeSlot, append = false, page = 1) => {
    try {
      setLoadingSlots(true);
      const sanitizedDate = typeof date === 'string' ? date.trim() : date;
      
      // Use server-side pagination for all slots
      const params = {
        page,
        limit: 10
      };

      if (sanitizedDate) {
        params.date = sanitizedDate;
      }
      
      // Only add time filters if a specific time slot is selected
      if (timeSlot) {
        const [startTime, endTime] = timeSlot.split('-');
        params.startTime = startTime;
        params.endTime = endTime;
      }
      
      const response = await slotAPI.getPublic(params);
      let newSlots = response.data.slots;
      
      // Filter out booked slots if showAvailableOnly is enabled
      if (showAvailableOnly) {
        newSlots = newSlots.filter(slot => slot.status === 'available');
      }
      
      setSlots(prevSlots => append ? [...prevSlots, ...newSlots] : newSlots);
      setSlotsPagination(response.data.pagination);
    } catch (error) {
      console.error('Load all slots error:', error);
      toast.error('فشل تحميل الأوقات');
    } finally {
      setLoadingSlots(false);
    }
  }, [showAvailableOnly]);

  const loadSlotsForGroup = useCallback(async (group, date, timeSlot, append = false, page = 1) => {
    try {
      if (!group.rooms || group.rooms.length === 0) {
        setSlots([]);
        return;
      }
      
      setLoadingSlots(true);
      const sanitizedDate = typeof date === 'string' ? date.trim() : date;
      
      // Use server-side pagination for group slots
      const roomIds = group.rooms.map(room => room._id);
      const params = {
        roomIds: roomIds.join(','),
        page,
        limit: 10
      };

      if (sanitizedDate) {
        params.date = sanitizedDate;
      }
      
      // Only add time filters if a specific time slot is selected
      if (timeSlot) {
        const [startTime, endTime] = timeSlot.split('-');
        params.startTime = startTime;
        params.endTime = endTime;
      }
      
      const response = await slotAPI.getPublic(params);
      let newSlots = response.data.slots;
      
      // Filter out booked slots if showAvailableOnly is enabled
      if (showAvailableOnly) {
        newSlots = newSlots.filter(slot => slot.status === 'available');
      }
      
      setSlots(prevSlots => append ? [...prevSlots, ...newSlots] : newSlots);
      setSlotsPagination(response.data.pagination);
    } catch (error) {
      console.error('Load group slots error:', error);
      toast.error('فشل تحميل الأوقات');
    } finally {
      setLoadingSlots(false);
    }
  }, [showAvailableOnly]);

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
        loadAllSlotsForDateAndTime(selectedDate, selectedTimeSlot);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, selectedDate, selectedTimeSlot);
      } else if (selectedRoom) {
        loadSlotsForDateAndTime(selectedRoom._id, selectedDate, selectedTimeSlot);
      }
    });

    socketService.onBookingRejected(() => {
      if (selectedRoom === 'all') {
        loadAllSlotsForDateAndTime(selectedDate, selectedTimeSlot);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, selectedDate, selectedTimeSlot);
      } else if (selectedRoom) {
        loadSlotsForDateAndTime(selectedRoom._id, selectedDate, selectedTimeSlot);
      }
    });
  }, [loadAllSlotsForDateAndTime, loadSlotsForDateAndTime, loadSlotsForGroup, selectedRoom, selectedDate, selectedTimeSlot]);

  // Load initial slots (first page only)
  useEffect(() => {
    if (!selectedDate || !isValidDateValue(selectedDate)) {
      return;
    }

    if (rooms.length > 0) {
      setCurrentSlotsPage(1);
      setSlots([]); // Clear previous slots
      // Reset pagination total immediately when filters change
      setSlotsPagination(prev => ({ ...prev, total: 0 }));
      
      if (selectedRoom === 'all') {
        loadAllSlotsForDateAndTime(selectedDate, selectedTimeSlot, false, 1);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, selectedDate, selectedTimeSlot, false, 1);
      } else if (selectedRoom) {
        loadSlotsForDateAndTime(selectedRoom._id, selectedDate, selectedTimeSlot, false, 1);
      }
    }
  }, [selectedRoom, selectedDate, selectedTimeSlot, showAvailableOnly, rooms, loadAllSlotsForDateAndTime, loadSlotsForDateAndTime, loadSlotsForGroup]);

  // Function to load more slots (pagination)
  const loadMoreSlots = useCallback(() => {
    const nextPage = currentSlotsPage + 1;
    
    if (nextPage > slotsPagination.totalPages) {
      toast.info('تم تحميل جميع الأوقات المتاحة');
      return;
    }
    
    if (selectedRoom === 'all') {
      loadAllSlotsForDateAndTime(selectedDate, selectedTimeSlot, true, nextPage);
    } else if (selectedRoom?.isGroup) {
      loadSlotsForGroup(selectedRoom, selectedDate, selectedTimeSlot, true, nextPage);
    } else if (selectedRoom) {
      loadSlotsForDateAndTime(selectedRoom._id, selectedDate, selectedTimeSlot, true, nextPage);
    }
    
    setCurrentSlotsPage(nextPage);
  }, [currentSlotsPage, slotsPagination.totalPages, selectedDate, selectedTimeSlot, selectedRoom, loadAllSlotsForDateAndTime, loadSlotsForGroup, loadSlotsForDateAndTime]);

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
    // Validate phone number if provided (optional)
    if (phoneNumber.trim() && !/^(010|011|012|015)\d{8}$/.test(phoneNumber.trim())) {
      toast.error('رقم الهاتف غير صحيح! يجب أن يبدأ بـ 010, 011, 012, أو 015 ويكون 11 رقم');
      return;
    }

    // Validate recurring booking
    if (isRecurring) {
      if (!endDate) {
        toast.error('يرجى اختيار تاريخ الانتهاء لتثبيت الموعد');
        return;
      }
      
      const startDateObj = new Date(selectedSlot.date);
      const endDateObj = new Date(endDate);
      
      if (endDateObj <= startDateObj) {
        toast.error('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
        return;
      }
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
        date: selectedSlot.date,
        isRecurring: isRecurring,
        endDate: isRecurring ? endDate : undefined
      });

      if (isRecurring) {
        toast.success('تم إرسال طلب تثبيت الموعد! في انتظار موافقة المشرف...');
      } else {
        toast.success('تم إرسال طلب الحجز! في انتظار موافقة المشرف...');
      }
      setShowBookingModal(false);
      setUserName('');
      setServiceName('');
      setPhoneNumber('');
      setSelectedSlot(null);
      setIsRecurring(false);
      setEndDate('');
      
      // Reload slots based on current selection
      if (selectedRoom === 'all') {
        loadAllSlotsForDateAndTime(selectedDate, selectedTimeSlot);
      } else if (selectedRoom?.isGroup) {
        loadSlotsForGroup(selectedRoom, selectedDate, selectedTimeSlot);
      } else {
        loadSlotsForDateAndTime(selectedRoom._id, selectedDate, selectedTimeSlot);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل إرسال طلب الحجز');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = () => {
    // Reset counter immediately when refreshing
    setSlotsPagination(prev => ({ ...prev, total: 0 }));
    setSlots([]);
    setCurrentSlotsPage(1);
    
    if (selectedRoom === 'all') {
      loadAllSlotsForDateAndTime(selectedDate, selectedTimeSlot);
      toast.info('تم تحديث الأوقات');
    } else if (selectedRoom?.isGroup) {
      loadSlotsForGroup(selectedRoom, selectedDate, selectedTimeSlot);
      toast.info('تم تحديث الأوقات');
    } else if (selectedRoom) {
      loadSlotsForDateAndTime(selectedRoom._id, selectedDate, selectedTimeSlot);
      toast.info('تم تحديث الأوقات');
    }
  };

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const isValidDateValue = (value) => {
    if (!value || typeof value !== 'string') return false;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(value)) {
      return false;
    }
    const parsed = new Date(value);
    return !isNaN(parsed.getTime());
  };

  const handleDateChange = (value) => {
    if (!value) {
      toast.error('لا يمكن ترك التاريخ فارغاً، يرجى اختيار تاريخ من التقويم');
      return;
    }

    if (!isValidDateValue(value)) {
      toast.error('صيغة التاريخ غير صحيحة، يرجى اختيار التاريخ من التقويم');
      return;
    }

    setSelectedDate(value);
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
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <img src="/Logo.jpg" alt="Logo" className="hero-logo" />
          <h1 className="hero-title">نظام حجز الأماكن</h1>
          <p className="hero-subtitle">اختر مكان وتاريخ لعرض الأوقات المتاحة</p>
          <button 
            className="scroll-down-btn"
            onClick={() => {
              document.querySelector('.filters-section').scrollIntoView({ 
                behavior: 'smooth' 
              });
            }}
          >
            <span>ابدأ الحجز</span>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="hero-background"></div>
      </section>

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
                  <Calendar size={18} /> التاريخ
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  min={getTodayDate()}
                  className="date-input"
                  required
                />
              </div>

              <div className="filter-group">
                <label>
                  <Clock size={18} /> الوقت
                </label>
                <select
                  value={selectedTimeSlot}
                  onChange={(e) => setSelectedTimeSlot(e.target.value)}
                  className="time-select"
                >
                  {TIME_SLOTS.map(slot => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>
                  <CheckCircle size={18} /> فلترة النتائج
                </label>
                <div className="toggle-container">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={showAvailableOnly}
                      onChange={(e) => setShowAvailableOnly(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toggle-label">
                    {showAvailableOnly ? 'الأماكن المتاحة فقط' : 'جميع الأماكن'}
                  </span>
                </div>
              </div>

              <button className="btn-refresh" onClick={handleRefresh}>
                <RefreshCw size={18} /> تحديث
              </button>
            </div>

            <div className="slots-section">
              <div className="section-header">
                <h2>
                  {selectedRoom === 'all' 
                    ? (selectedTimeSlot 
                        ? (showAvailableOnly ? 'الأوقات المتاحة في جميع الأماكن' : 'جميع الأوقات في جميع الأماكن')
                        : (showAvailableOnly ? 'الأوقات المتاحة في جميع الأماكن' : 'جميع الأوقات في جميع الأماكن'))
                    : selectedRoom?.isGroup
                    ? (selectedTimeSlot 
                        ? (showAvailableOnly ? `الأوقات المتاحة في مجموعة ${selectedRoom?.name}` : `جميع الأوقات في مجموعة ${selectedRoom?.name}`)
                        : (showAvailableOnly ? `الأوقات المتاحة في مجموعة ${selectedRoom?.name}` : `جميع الأوقات في مجموعة ${selectedRoom?.name}`))
                    : (selectedTimeSlot 
                        ? (showAvailableOnly ? `الأوقات المتاحة في ${selectedRoom?.name}` : `جميع الأوقات في ${selectedRoom?.name}`)
                        : (showAvailableOnly ? `الأوقات المتاحة في ${selectedRoom?.name}` : `جميع الأوقات في ${selectedRoom?.name}`))}
                </h2>
                <span className="slot-count">
                  {loadingSlots && slotsPagination.total === 0 ? 'جاري التحميل...' : `${slotsPagination.total} ${showAvailableOnly ? 'متاح' : 'إجمالي'}`}
                </span>
              </div>

              {slots.length === 0 && !loadingSlots ? (
                <div className="no-slots">
                  <Calendar size={48} />
                  <p>{showAvailableOnly ? 'لا توجد أوقات متاحة لهذا التاريخ' : 'لا توجد أوقات لهذا التاريخ'}</p>
                  <small>{showAvailableOnly ? 'جرب اختيار تاريخ آخر أو إلغاء فلترة الأماكن المتاحة' : 'جرب اختيار تاريخ آخر'}</small>
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
              <button onClick={() => {
                setShowBookingModal(false);
                setIsRecurring(false);
                setEndDate('');
              }}>
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
                  📅 تثبيت معاد
                </label>
                <div className="toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => {
                        setIsRecurring(e.target.checked);
                        if (!e.target.checked) {
                          setEndDate('');
                        }
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toggle-label">
                    {isRecurring ? 'مفعّل - سيتم تثبيت الموعد كل أسبوع' : 'إيقاف - حجز لمرة واحدة'}
                  </span>
                </div>
              </div>

              {isRecurring && (
                <div className="form-group">
                  <label>
                    📅 تاريخ الانتهاء
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={selectedSlot ? new Date(selectedSlot.date).toISOString().split('T')[0] : getTodayDate()}
                    required={isRecurring}
                  />
                  <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                    سيتم تثبيت نفس المعاد كل {new Date(selectedSlot?.date).toLocaleDateString('ar-EG', { weekday: 'long' })} من {new Date(selectedSlot?.date).toLocaleDateString('ar-EG')} حتى {endDate ? new Date(endDate).toLocaleDateString('ar-EG') : '...'}
                  </small>
                </div>
              )}

              <div className="form-group">
                <label>
                  📱 رقم الهاتف <span style={{ color: '#6c757d', fontSize: '0.875rem', fontWeight: 'normal' }}>(اختياري)</span>
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="01xxxxxxxxx (يبدأ بـ 010, 011, 012, أو 015)"
                  pattern="^(010|011|012|015)\d{8}$"
                  maxLength="11"
                />
                <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                  إذا قمت بإدخال رقم الهاتف، يجب أن يكون 11 رقم ويبدأ بـ 010, 011, 012, أو 015
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
                  onClick={() => {
                    setShowBookingModal(false);
                    setIsRecurring(false);
                    setEndDate('');
                  }}
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
        <p>© 2025 كنيسة مارمرقس بشبرا | صُنع بـ ايمن</p>
      </footer>
    </div>
  );
}

export default UserPortal;


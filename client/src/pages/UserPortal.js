import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Calendar, Clock } from 'lucide-react';
import { roomAPI, roomGroupAPI, slotAPI, bookingAPI } from '../services/api';
import './UserPortal.css';

// Helper function to convert 24h time to 12h format
const formatTime12Hour = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'م' : 'ص';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

// Predefined time slots
const TIME_SLOTS = [
  { value: '', label: 'جميع الاوقات' },
  { value: '10:00-12:00', label: '10:00 ص - 12:00 م' },
  { value: '12:00-14:00', label: '12:00 م - 2:00 م' },
  { value: '14:00-16:00', label: '2:00 م - 4:00 م' },
  { value: '16:00-18:00', label: '4:00 م - 6:00 م' },
  { value: '18:00-20:00', label: '6:00 م - 8:00 م' },
  { value: '20:00-22:00', label: '8:00 م - 10:00 م' }
];

function UserPortal() {
  const [rooms, setRooms] = useState([]);
  const [roomGroups, setRoomGroups] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  
  // Booking form state
  const [bookingForm, setBookingForm] = useState({
    name: '',
    email: '',
    phone: '',
    purpose: ''
  });

  // Load rooms and room groups
  useEffect(() => {
    const loadRooms = async () => {
      try {
        setLoading(true);
        const [roomsResponse, groupsResponse] = await Promise.all([
          roomAPI.getAll(),
          roomGroupAPI.getAll()
        ]);
        
        const enabledRooms = roomsResponse.data.filter(room => room.isEnabled);
        const enabledGroups = groupsResponse.data.filter(group => group.isEnabled);
        
        setRooms(enabledRooms);
        setRoomGroups(enabledGroups);
        setSelectedRoom('all');
      } catch (error) {
        console.error('Load rooms error:', error);
        const errorMessage = error.response?.data?.error || error.message || 'خطأ في الاتصال';
        toast.error(`فشل تحميل الأماكن: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };

    loadRooms();
  }, []);

  const loadAvailableSlots = useCallback(async () => {
    try {
      setLoading(true);
      let slotsResponse;
      
      if (selectedRoom === 'all') {
        // Get all available slots for the date
        slotsResponse = await slotAPI.getPublic({ date: selectedDate });
      } else {
        // Get slots for specific room
        slotsResponse = await slotAPI.getByRoom(selectedRoom, selectedDate);
      }
      
      let slots = slotsResponse.data || [];
      
      // Filter by time slot if selected
      if (selectedTimeSlot) {
        const [startTime, endTime] = selectedTimeSlot.split('-');
        slots = slots.filter(slot => 
          slot.startTime >= startTime && slot.endTime <= endTime
        );
      }
      
      setAvailableSlots(slots);
    } catch (error) {
      console.error('Load slots error:', error);
      toast.error('فشل تحميل الأوقات المتاحة');
    } finally {
      setLoading(false);
    }
  }, [selectedRoom, selectedDate, selectedTimeSlot]);

  // Load available slots when room, date, or time changes
  useEffect(() => {
    if (selectedRoom && selectedDate) {
      loadAvailableSlots();
    }
  }, [selectedRoom, selectedDate, selectedTimeSlot, loadAvailableSlots]);

  const handleBookingSubmit = async (slot) => {
    if (!bookingForm.name || !bookingForm.email || !bookingForm.phone) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      setBookingLoading(true);
      
      const bookingData = {
        slotId: slot._id,
        roomId: slot.room,
        date: selectedDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        userInfo: {
          name: bookingForm.name,
          email: bookingForm.email,
          phone: bookingForm.phone,
          purpose: bookingForm.purpose
        }
      };

      await bookingAPI.create(bookingData);
      
      toast.success('تم إرسال طلب الحجز بنجاح! سيتم التواصل معك قريباً');
      
      // Reset form
      setBookingForm({
        name: '',
        email: '',
        phone: '',
        purpose: ''
      });
      
      // Reload slots
      loadAvailableSlots();
      
    } catch (error) {
      console.error('Booking error:', error);
      const errorMessage = error.response?.data?.error || 'فشل في إرسال طلب الحجز';
      toast.error(errorMessage);
    } finally {
      setBookingLoading(false);
    }
  };


  return (
    <div className="user-portal">
      <div className="container">
        <header className="portal-header">
          <h1>نظام حجز القاعات - كنيسة القديس مرقس</h1>
          <p>احجز قاعة للاجتماعات والمناسبات</p>
        </header>

        <div className="booking-section">
          <div className="filters">
            <div className="filter-group">
              <label>المكان:</label>
              <select 
                value={selectedRoom} 
                onChange={(e) => setSelectedRoom(e.target.value)}
                disabled={loading}
              >
                <option value="all">جميع الأماكن</option>
                {roomGroups.map(group => (
                  <option key={group._id} value={group._id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>التاريخ:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                disabled={loading}
              />
            </div>

            <div className="filter-group">
              <label>الوقت:</label>
              <select 
                value={selectedTimeSlot} 
                onChange={(e) => setSelectedTimeSlot(e.target.value)}
                disabled={loading}
              >
                {TIME_SLOTS.map(slot => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading">جاري التحميل...</div>
          ) : (
            <div className="slots-grid">
              {availableSlots.length === 0 ? (
                <div className="no-slots">
                  <p>لا توجد أوقات متاحة في هذا التاريخ</p>
                </div>
              ) : (
                availableSlots.map(slot => (
                  <div key={slot._id} className="slot-card">
                    <div className="slot-info">
                      <h3>{slot.room?.name || 'قاعة'}</h3>
                      <p className="time">
                        <Clock size={16} />
                        {formatTime12Hour(slot.startTime)} - {formatTime12Hour(slot.endTime)}
                      </p>
                      <p className="date">
                        <Calendar size={16} />
                        {new Date(selectedDate).toLocaleDateString('ar-EG')}
                      </p>
                    </div>
                    
                    <button 
                      className="book-btn"
                      onClick={() => handleBookingSubmit(slot)}
                      disabled={bookingLoading}
                    >
                      {bookingLoading ? 'جاري الإرسال...' : 'احجز الآن'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Booking Form Modal */}
        <div className="booking-form-modal" id="bookingModal">
          <div className="modal-content">
            <h2>معلومات الحجز</h2>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="form-group">
                <label>الاسم الكامل *</label>
                <input
                  type="text"
                  value={bookingForm.name}
                  onChange={(e) => setBookingForm({...bookingForm, name: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>البريد الإلكتروني *</label>
                <input
                  type="email"
                  value={bookingForm.email}
                  onChange={(e) => setBookingForm({...bookingForm, email: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>رقم الهاتف *</label>
                <input
                  type="tel"
                  value={bookingForm.phone}
                  onChange={(e) => setBookingForm({...bookingForm, phone: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>الغرض من الحجز</label>
                <textarea
                  value={bookingForm.purpose}
                  onChange={(e) => setBookingForm({...bookingForm, purpose: e.target.value})}
                  rows="3"
                />
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="cancel-btn"
                  onClick={() => document.getElementById('bookingModal').style.display = 'none'}
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  className="submit-btn"
                  onClick={() => handleBookingSubmit()}
                  disabled={bookingLoading}
                >
                  {bookingLoading ? 'جاري الإرسال...' : 'إرسال الطلب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserPortal;
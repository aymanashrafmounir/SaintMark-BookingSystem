import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  RefreshCw,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { roomAPI, roomGroupAPI, slotAPI, bookingAPI, exportAPI } from '../services/api';
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
  // Force LTR for each time using embedding characters
  return `\u202A${start}\u202C → \u202A${end}\u202C`;
};

function AdminDashboard({ setIsAuthenticated }) {
  const [activeTab, setActiveTab] = useState('rooms');
  const [rooms, setRooms] = useState([]);
  const [roomGroups, setRoomGroups] = useState([]);
  const [slots, setSlots] = useState([]);
  const [slotsPagination, setSlotsPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [bookings, setBookings] = useState([]);
  const [bookingsPagination, setBookingsPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [pendingBookings, setPendingBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null);
  
  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    onConfirm: null,
    confirmButtonText: 'تأكيد',
    requiresPassword: false
  });
  const [confirmPassword, setConfirmPassword] = useState('');

  const [roomForm, setRoomForm] = useState({ name: '', isEnabled: true });
  const [groupForm, setGroupForm] = useState({ name: '', rooms: [], isEnabled: true });
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
  const [bulkMode, setBulkMode] = useState(false);
  const [dateRangeMode, setDateRangeMode] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [multipleSlots, setMultipleSlots] = useState([{ startTime: '', endTime: '', date: '' }]);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [timeSlots, setTimeSlots] = useState([{ startTime: '', endTime: '' }]);
  
  // Slot filters
  const [slotFilters, setSlotFilters] = useState({
    roomIds: [], // Array of selected room IDs
    serviceName: '',
    providerName: '',
    type: '',
    date: '',
    dateRangeStart: '',
    dateRangeEnd: '',
    daysOfWeek: [], // Array of selected days: 0 = Sunday, 1 = Monday, etc.
    timeRanges: [] // Array of selected time ranges
  });

  // Show available places only toggle
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  // Predefined time ranges for filtering
  const timeRangeOptions = [
    { value: '10:00-12:00', label: '10:00 ص → 12:00 م', startTime: '10:00', endTime: '12:00' },
    { value: '12:00-14:00', label: '12:00 م → 2:00 م', startTime: '12:00', endTime: '14:00' },
    { value: '14:00-16:00', label: '2:00 م → 4:00 م', startTime: '14:00', endTime: '16:00' },
    { value: '16:00-18:00', label: '4:00 م → 6:00 م', startTime: '16:00', endTime: '18:00' },
    { value: '18:00-20:00', label: '6:00 م → 8:00 م', startTime: '18:00', endTime: '20:00' },
    { value: '20:00-22:00', label: '8:00 م → 10:00 م', startTime: '20:00', endTime: '22:00' }
  ];

  // Pagination for slots
  const [slotsCurrentPage, setSlotsCurrentPage] = useState(1);
  const slotsPerPage = 50;
  
  // Bulk selection for slots
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignForm, setBulkAssignForm] = useState({
    serviceName: '',
    providerName: ''
  });
  const [bulkActionTarget, setBulkActionTarget] = useState('selected'); // 'selected' or 'filtered'

  // Sorting for slots table
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'asc' // 'asc' or 'desc'
  });

  // Pagination for bookings
  const [bookingsCurrentPage, setBookingsCurrentPage] = useState(1);
  const bookingsPerPage = 50;

  // Open confirmation modal
  const openConfirmModal = (title, message, onConfirm, confirmButtonText = 'تأكيد', requiresPassword = false) => {
    setConfirmConfig({ title, message, onConfirm, confirmButtonText, requiresPassword });
    setConfirmPassword('');
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    // Check password if required
    if (confirmConfig.requiresPassword) {
      if (confirmPassword !== '2001') {
        toast.error('كلمة المرور غير صحيحة. يجب كتابة 2001 للتأكيد.');
        return;
      }
    }
    
    console.log('handleConfirm called, onConfirm function:', confirmConfig.onConfirm);
    if (confirmConfig.onConfirm) {
      console.log('Executing onConfirm function...');
      confirmConfig.onConfirm();
    } else {
      console.log('No onConfirm function found');
    }
    setShowConfirmModal(false);
    setConfirmPassword('');
  };

  const loadRooms = useCallback(async () => {
    try {
      const response = await roomAPI.getAll();
      setRooms(response.data);
    } catch (error) {
      console.error('Load rooms error:', error);
    }
  }, []);

  const loadRoomGroups = useCallback(async () => {
    try {
      const response = await roomGroupAPI.getAll();
      setRoomGroups(response.data);
    } catch (error) {
      console.error('Load room groups error:', error);
    }
  }, []);

  const loadSlots = useCallback(async (page = slotsCurrentPage, filters = slotFilters) => {
    try {
      setSlotsLoading(true);
      const params = {
        page,
        limit: slotsPerPage,
        ...filters
      };

      // Add available status filter if toggle is enabled
      if (showAvailableOnly) {
        params.status = 'available';
      }
      
      // Convert daysOfWeek array to comma-separated string
      if (params.daysOfWeek && Array.isArray(params.daysOfWeek) && params.daysOfWeek.length > 0) {
        params.daysOfWeek = params.daysOfWeek.join(',');
      } else {
        delete params.daysOfWeek;
      }
      
      // Convert roomIds array to comma-separated string
      if (params.roomIds && Array.isArray(params.roomIds) && params.roomIds.length > 0) {
        params.roomIds = params.roomIds.join(',');
      } else {
        delete params.roomIds;
      }
      
      // Convert timeRanges array to comma-separated string
      if (params.timeRanges && Array.isArray(params.timeRanges) && params.timeRanges.length > 0) {
        params.timeRanges = params.timeRanges.join(',');
      } else {
        delete params.timeRanges;
      }
      
      // Remove empty filter values
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null || params[key] === undefined) {
          delete params[key];
        }
      });
      
      const response = await slotAPI.getAll(params);
      setSlots(response.data.slots);
      setSlotsPagination(response.data.pagination);
    } catch (error) {
      console.error('Load slots error:', error);
      toast.error('فشل تحميل المواعيد');
    } finally {
      setSlotsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsCurrentPage, slotsPerPage, showAvailableOnly]);

  const loadBookings = useCallback(async (page = bookingsCurrentPage) => {
    try {
      const params = {
        page,
        limit: bookingsPerPage
      };
      
      const [allResponse, pendingResponse] = await Promise.all([
        bookingAPI.getAll(params),
        bookingAPI.getPending()
      ]);
      
      // Filter out pending bookings on client side (since backend returns all)
      const nonPendingBookings = allResponse.data.bookings.filter(b => b.status !== 'pending');
      
      setBookings(nonPendingBookings);
      setBookingsPagination(allResponse.data.pagination);
      setPendingBookings(pendingResponse.data);
    } catch (error) {
      console.error('Load bookings error:', error);
      toast.error('فشل تحميل الحجوزات');
    }
  }, [bookingsCurrentPage, bookingsPerPage]);


  useEffect(() => {
    // Check if token exists and is valid
    const token = localStorage.getItem('adminToken');
    if (!token) {
      toast.error('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
      setIsAuthenticated(false);
      return;
    }

    // Load rooms and groups initially, but NOT slots (wait for user to apply filters)
    const initialLoad = async () => {
      setLoading(true);
      
      const loadingTimeout = setTimeout(() => {
        setLoading(false);
        toast.error('انتهت مهلة الاتصال. يرجى تحديث الصفحة.');
      }, 30000);
      
      try {
        await Promise.all([loadRooms(), loadRoomGroups(), loadBookings()]);
        clearTimeout(loadingTimeout);
      } catch (error) {
        clearTimeout(loadingTimeout);
        console.error('Load data error:', error);
        const errorMessage = error.response?.data?.error || error.message || 'خطأ في الاتصال';
        toast.error(`فشل تحميل البيانات: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };
    
    initialLoad();
    
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
      // Only reload slots if we're on the slots tab
      if (activeTab === 'slots') {
        loadSlots();
      }
    });

    // Listen for authentication expiration
    const handleAuthExpired = () => {
      toast.error('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
      setIsAuthenticated(false);
    };

    window.addEventListener('authExpired', handleAuthExpired);

    return () => {
      socketService.removeListener('new-booking-request');
      window.removeEventListener('authExpired', handleAuthExpired);
      socketService.removeListener('booking-approved');
    };
  }, [loadRooms, loadRoomGroups, loadBookings, loadSlots, activeTab]);

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
          loadSlots(slotsCurrentPage, slotFilters);
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

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      if (editingGroup) {
        await roomGroupAPI.update(editingGroup._id, groupForm);
        toast.success('تم تحديث المجموعة بنجاح');
      } else {
        await roomGroupAPI.create(groupForm);
        toast.success('تم إنشاء المجموعة بنجاح');
      }
      setShowGroupModal(false);
      setGroupForm({ name: '', rooms: [], isEnabled: true });
      setEditingGroup(null);
      loadRoomGroups();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleDeleteGroup = async (id) => {
    openConfirmModal(
      '🗑️ حذف المجموعة',
      'هل أنت متأكد من حذف هذه المجموعة؟',
      async () => {
        try {
          await roomGroupAPI.delete(id);
          toast.success('تم حذف المجموعة بنجاح');
          loadRoomGroups();
        } catch (error) {
          toast.error('فشل حذف المجموعة');
        }
      }
    );
  };

  const handleToggleGroupStatus = async (group) => {
    try {
      await roomGroupAPI.update(group._id, { isEnabled: !group.isEnabled });
      toast.success(`تم ${!group.isEnabled ? 'تفعيل' : 'تعطيل'} المجموعة بنجاح`);
      loadRoomGroups();
    } catch (error) {
      toast.error('فشل تحديث حالة المجموعة');
    }
  };

  const openEditGroup = (group) => {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      rooms: group.rooms.map(r => r._id),
      isEnabled: group.isEnabled
    });
    setShowGroupModal(true);
  };

  const toggleRoomInGroup = (roomId) => {
    if (groupForm.rooms.includes(roomId)) {
      setGroupForm({ ...groupForm, rooms: groupForm.rooms.filter(id => id !== roomId) });
    } else {
      setGroupForm({ ...groupForm, rooms: [...groupForm.rooms, roomId] });
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
      } else if (dateRangeMode) {
        // Date Range Mode: Create slots for every day in date range
        const roomIds = selectedRooms.length > 0 ? selectedRooms : [slotForm.roomId];
        
        if (roomIds.length === 0 || !roomIds[0]) {
          toast.error('يجب اختيار مكان واحد على الأقل');
          return;
        }

        if (!dateRangeStart || !dateRangeEnd) {
          toast.error('يجب تحديد تاريخ البداية والنهاية');
          return;
        }

        // Validate time slots
        const validTimeSlots = timeSlots.filter(slot => slot.startTime && slot.endTime);
        
        if (validTimeSlots.length === 0) {
          toast.error('يجب إضافة موعد واحد صحيح على الأقل');
          return;
        }

        // Generate all dates in range
        const startDate = new Date(dateRangeStart);
        const endDate = new Date(dateRangeEnd);
        const dates = [];
        
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          dates.push(new Date(date).toISOString().split('T')[0]);
        }

        // Create slots for each date × each time slot
        const slotsData = [];
        dates.forEach(date => {
          validTimeSlots.forEach(timeSlot => {
            slotsData.push({
              startTime: timeSlot.startTime,
              endTime: timeSlot.endTime,
              date: date,
              serviceName: makeAvailable ? '' : slotForm.serviceName,
              providerName: makeAvailable ? '' : slotForm.providerName,
              type: 'single'
            });
          });
        });

        const totalSlots = roomIds.length * slotsData.length;
        
        // Warning for large operations
        if (totalSlots > 5000) {
          toast.error(`⚠️ العدد كبير جداً! (${totalSlots} موعد). يرجى تقليل الفترة الزمنية أو عدد الأماكن.`);
          return;
        }
        
        if (totalSlots > 1000) {
          const confirmLarge = window.confirm(
            `⚠️ سيتم إنشاء ${totalSlots} موعد!\n` +
            `(${dates.length} يوم × ${validTimeSlots.length} موعد × ${roomIds.length} مكان)\n\n` +
            `هذا قد يستغرق بضع دقائق. هل تريد المتابعة؟`
          );
          if (!confirmLarge) {
            return;
          }
        }

        // Batch processing for large operations
        const BATCH_SIZE = 500; // Process 500 slots per room at a time
        let totalCreated = 0;
        
        toast.info(`⏳ جاري إنشاء ${totalSlots} موعد... يرجى الانتظار`);
        
        for (const roomId of roomIds) {
          // Split slots into batches
          for (let i = 0; i < slotsData.length; i += BATCH_SIZE) {
            const batch = slotsData.slice(i, i + BATCH_SIZE);
            await slotAPI.bulkCreate({ roomIds: [roomId], slots: batch });
            totalCreated += batch.length;
            
            // Show progress
            if (roomIds.length > 1 || slotsData.length > BATCH_SIZE) {
              toast.info(`⏳ تم إنشاء ${totalCreated} من ${totalSlots} موعد...`, { autoClose: 1000 });
            }
          }
        }

        toast.success(`✅ تم إنشاء ${totalSlots} موعد بنجاح! (${dates.length} يوم × ${validTimeSlots.length} موعد × ${roomIds.length} مكان)`);
      } else if (bulkMode) {
        // Bulk mode: multiple rooms and/or multiple slots
        const roomIds = selectedRooms.length > 0 ? selectedRooms : [slotForm.roomId];
        
        if (roomIds.length === 0 || !roomIds[0]) {
          toast.error('يجب اختيار مكان واحد على الأقل');
          return;
        }
        
        // Filter valid slots
        const validSlots = multipleSlots.filter(slot => 
          slot.startTime && slot.endTime && slot.date
        );
        
        if (validSlots.length === 0) {
          toast.error('يجب إضافة موعد واحد صحيح على الأقل');
          return;
        }
        
        // Prepare slots data - expand weekly slots if needed
        let slotsData = [];
        
        if (slotForm.type === 'weekly' && slotForm.weeklyOccurrences > 1) {
          // Expand each slot into multiple weekly occurrences
          const occurrences = parseInt(slotForm.weeklyOccurrences);
          
          validSlots.forEach(slot => {
            for (let i = 0; i < occurrences; i++) {
              const slotDate = new Date(slot.date);
              slotDate.setDate(slotDate.getDate() + (i * 7)); // Add 7 days for each occurrence
              
              slotsData.push({
                startTime: slot.startTime,
                endTime: slot.endTime,
                date: slotDate.toISOString().split('T')[0],
                serviceName: makeAvailable ? '' : slotForm.serviceName,
                providerName: makeAvailable ? '' : slotForm.providerName,
                type: slotForm.type
              });
            }
          });
        } else {
          // Normal slots without expansion
          slotsData = validSlots.map(slot => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            date: slot.date,
            serviceName: makeAvailable ? '' : slotForm.serviceName,
            providerName: makeAvailable ? '' : slotForm.providerName,
            type: slotForm.type
          }));
        }
        
        const totalSlots = roomIds.length * slotsData.length;
        
        // Warning for large operations
        if (totalSlots > 5000) {
          toast.error(`⚠️ العدد كبير جداً! (${totalSlots} موعد). يرجى تقليل عدد المواعيد أو الأماكن.`);
          return;
        }
        
        if (totalSlots > 1000) {
          const confirmLarge = window.confirm(
            `⚠️ سيتم إنشاء ${totalSlots} موعد!\n` +
            `هذا قد يستغرق بضع دقائق. هل تريد المتابعة؟`
          );
          if (!confirmLarge) {
            return;
          }
        }

        // Batch processing for large operations
        if (totalSlots > 500) {
          const BATCH_SIZE = 500;
          let totalCreated = 0;
          
          toast.info(`⏳ جاري إنشاء ${totalSlots} موعد... يرجى الانتظار`);
          
          for (const roomId of roomIds) {
            for (let i = 0; i < slotsData.length; i += BATCH_SIZE) {
              const batch = slotsData.slice(i, i + BATCH_SIZE);
              await slotAPI.bulkCreate({ roomIds: [roomId], slots: batch });
              totalCreated += batch.length;
              
              toast.info(`⏳ تم إنشاء ${totalCreated} من ${totalSlots} موعد...`, { autoClose: 1000 });
            }
          }
          
          toast.success(`✅ تم إنشاء ${totalSlots} موعد بنجاح!`);
        } else {
          await slotAPI.bulkCreate({ roomIds, slots: slotsData });
          toast.success(`تم إنشاء ${totalSlots} موعد بنجاح!`);
        }
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
      setBulkMode(false);
      setDateRangeMode(false);
      setSelectedRooms([]);
      setMultipleSlots([{ startTime: '', endTime: '', date: '' }]);
      setDateRangeStart('');
      setDateRangeEnd('');
      setTimeSlots([{ startTime: '', endTime: '' }]);
      loadSlots(slotsCurrentPage, slotFilters);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    }
  };

  const toggleRoomSelection = (roomId) => {
    if (selectedRooms.includes(roomId)) {
      setSelectedRooms(selectedRooms.filter(id => id !== roomId));
    } else {
      setSelectedRooms([...selectedRooms, roomId]);
    }
  };

  const addSlot = () => {
    setMultipleSlots([...multipleSlots, { startTime: '', endTime: '', date: '' }]);
  };

  const removeSlot = (index) => {
    setMultipleSlots(multipleSlots.filter((_, i) => i !== index));
  };

  const updateSlot = (index, field, value) => {
    const updated = [...multipleSlots];
    updated[index][field] = value;
    setMultipleSlots(updated);
  };

  const addTimeSlot = () => {
    setTimeSlots([...timeSlots, { startTime: '', endTime: '' }]);
  };

  const removeTimeSlot = (index) => {
    setTimeSlots(timeSlots.filter((_, i) => i !== index));
  };

  const updateTimeSlot = (index, field, value) => {
    const updated = [...timeSlots];
    updated[index][field] = value;
    setTimeSlots(updated);
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
            loadSlots(slotsCurrentPage, slotFilters);
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
      loadSlots(slotsCurrentPage, slotFilters);
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
      loadSlots(slotsCurrentPage, slotFilters);
    } catch (error) {
      toast.error('فشل حذف المواعيد الأسبوعية');
    }
  };

  const handleClearBookingsHistory = async () => {
    try {
      // Delete all bookings from database
      const deletePromises = bookings.map(booking => bookingAPI.delete(booking._id));
      await Promise.all(deletePromises);
      
      toast.success(`تم حذف جميع الحجوزات (${bookings.length} حجز) بنجاح!`);
      loadBookings(); // Reload bookings to update the list
    } catch (error) {
      console.error('Error clearing bookings history:', error);
      toast.error('فشل حذف سجل الحجوزات');
    }
  };

  const handleApproveBooking = async (id) => {
    try {
      await bookingAPI.approve(id);
      toast.success('تمت الموافقة على الحجز بنجاح');
      loadBookings();
      loadSlots(slotsCurrentPage, slotFilters);
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

  const handleExportSlotsJSON = async () => {
    try {
      const response = await exportAPI.downloadSlotsJSON();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `slots-export-${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('تم تحميل ملف JSON للفترات بنجاح');
    } catch (error) {
      console.error('Export slots JSON error:', error);
      toast.error('فشل تصدير الفترات');
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

  // Check if there are active filters
  const hasActiveFilters = useCallback(() => {
    return Object.entries(slotFilters).some(([key, value]) => {
      if (key === 'daysOfWeek' || key === 'roomIds' || key === 'timeRanges') {
        return Array.isArray(value) && value.length > 0;
      }
      return value !== '' && value !== null && value !== undefined;
    });
  }, [slotFilters]);

  // Sorting function with 3 states: desc → asc → disable
  const handleSort = useCallback((key) => {
    if (sortConfig.key !== key) {
      // New column - start with desc
      setSortConfig({ key, direction: 'desc' });
    } else if (sortConfig.direction === 'desc') {
      // desc → asc
      setSortConfig({ key, direction: 'asc' });
    } else if (sortConfig.direction === 'asc') {
      // asc → disable (clear sorting)
      setSortConfig({ key: null, direction: 'asc' });
    }
  }, [sortConfig]);

  // Helper function to normalize Arabic text for better sorting
  const normalizeArabicText = (text) => {
    if (!text) return '';
    
    // Remove diacritics and normalize Arabic characters
    return text
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // Remove diacritics
      .replace(/[أإآ]/g, 'ا') // Normalize alef variations
      .replace(/[ة]/g, 'ه') // Normalize ta marbuta
      .replace(/[ي]/g, 'ي') // Normalize yeh
      .toLowerCase()
      .trim();
  };

  // Sort slots data with improved data type handling
  const sortedSlots = useMemo(() => {
    if (!sortConfig.key) return slots;

    return [...slots].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      // Handle different data types
      if (sortConfig.key === 'date') {
        // Date sorting: handle different date formats
        try {
          // Handle different date formats
          let dateA = aValue;
          let dateB = bValue;
          
          // If date is in DD/MM/YYYY format, convert to YYYY-MM-DD
          if (typeof dateA === 'string' && dateA.includes('/')) {
            const partsA = dateA.split('/');
            if (partsA.length === 3) {
              dateA = `${partsA[2]}-${partsA[1].padStart(2, '0')}-${partsA[0].padStart(2, '0')}`;
            }
          }
          
          if (typeof dateB === 'string' && dateB.includes('/')) {
            const partsB = dateB.split('/');
            if (partsB.length === 3) {
              dateB = `${partsB[2]}-${partsB[1].padStart(2, '0')}-${partsB[0].padStart(2, '0')}`;
            }
          }
          
          // Try to parse as Date object
          aValue = new Date(dateA);
          bValue = new Date(dateB);
          
          // Check if dates are valid
          if (isNaN(aValue.getTime())) aValue = new Date(0);
          if (isNaN(bValue.getTime())) bValue = new Date(0);
        } catch (error) {
          // Fallback to string comparison if date parsing fails
          aValue = aValue.toString();
          bValue = bValue.toString();
        }
      } else if (sortConfig.key === 'startTime' || sortConfig.key === 'endTime') {
        // Time sorting: convert "HH:MM" to comparable format
        aValue = aValue.replace(':', '');
        bValue = bValue.replace(':', '');
      } else if (sortConfig.key === 'roomName') {
        // Special handling for room names - remove common prefixes and normalize Arabic
        aValue = normalizeArabicText(aValue).replace(/^(قاعة|غرفة|مكتب|صالة)\s*/i, '');
        bValue = normalizeArabicText(bValue).replace(/^(قاعة|غرفة|مكتب|صالة)\s*/i, '');
      } else if (sortConfig.key === 'serviceName' || sortConfig.key === 'providerName') {
        // Alphabetical sorting for text fields with Arabic normalization
        aValue = normalizeArabicText(aValue);
        bValue = normalizeArabicText(bValue);
      } else if (sortConfig.key === 'type' || sortConfig.key === 'status') {
        // Status/Type sorting: keep original case for consistency
        aValue = aValue.toString();
        bValue = bValue.toString();
      }

      // Compare values
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [slots, sortConfig]);

  // Helper function to render sort icon with 3 states
  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <span style={{ opacity: 0.3, fontSize: '12px' }}>↕</span>;
    }
    if (sortConfig.direction === 'desc') {
      return <ChevronDown size={16} style={{ color: '#007bff' }} />;
    }
    if (sortConfig.direction === 'asc') {
      return <ChevronUp size={16} style={{ color: '#007bff' }} />;
    }
    return <span style={{ opacity: 0.3, fontSize: '12px' }}>↕</span>;
  };

  // Apply filters - trigger server-side reload (only when button is clicked)
  const applySlotFilters = useCallback(() => {
    if (!hasActiveFilters() && slots.length === 0) {
      // First time load or no filters - show a helpful message
      toast.info('⏳ جاري تحميل المواعيد...');
    }
    setSlotsCurrentPage(1); // Reset to page 1 when filters change
    loadSlots(1, slotFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSlots, hasActiveFilters, slots.length]);

  const clearSlotFilters = () => {
    const emptyFilters = {
      roomIds: [],
      serviceName: '',
      providerName: '',
      type: '',
      date: '',
      dateRangeStart: '',
      dateRangeEnd: '',
      daysOfWeek: [],
      timeRanges: []
    };
    setSlotFilters(emptyFilters);
    setSlotsCurrentPage(1);
    loadSlots(1, emptyFilters);
  };

  const toggleDayOfWeek = (day) => {
    const currentDays = [...slotFilters.daysOfWeek];
    if (currentDays.includes(day)) {
      setSlotFilters({ 
        ...slotFilters, 
        daysOfWeek: currentDays.filter(d => d !== day) 
      });
    } else {
      setSlotFilters({ 
        ...slotFilters, 
        daysOfWeek: [...currentDays, day] 
      });
    }
  };

  const toggleRoomFilter = (roomId) => {
    const currentRooms = [...slotFilters.roomIds];
    if (currentRooms.includes(roomId)) {
      setSlotFilters({ 
        ...slotFilters, 
        roomIds: currentRooms.filter(id => id !== roomId) 
      });
    } else {
      setSlotFilters({ 
        ...slotFilters, 
        roomIds: [...currentRooms, roomId] 
      });
    }
  };

  const toggleTimeRange = (timeRange) => {
    const currentTimeRanges = [...slotFilters.timeRanges];
    if (currentTimeRanges.includes(timeRange)) {
      setSlotFilters({ 
        ...slotFilters, 
        timeRanges: currentTimeRanges.filter(tr => tr !== timeRange) 
      });
    } else {
      setSlotFilters({ 
        ...slotFilters, 
        timeRanges: [...currentTimeRanges, timeRange] 
      });
    }
  };

  // Select All functions
  const selectAllRooms = () => {
    const allRoomIds = rooms.map(room => room._id);
    setSlotFilters({ 
      ...slotFilters, 
      roomIds: allRoomIds 
    });
  };

  const deselectAllRooms = () => {
    setSlotFilters({ 
      ...slotFilters, 
      roomIds: [] 
    });
  };

  const selectAllTimeRanges = () => {
    const allTimeRanges = timeRangeOptions.map(tr => tr.value);
    setSlotFilters({ 
      ...slotFilters, 
      timeRanges: allTimeRanges 
    });
  };

  const deselectAllTimeRanges = () => {
    setSlotFilters({ 
      ...slotFilters, 
      timeRanges: [] 
    });
  };

  const selectAllDays = () => {
    const allDays = [0, 1, 2, 3, 4, 5, 6]; // Sunday to Saturday
    setSlotFilters({ 
      ...slotFilters, 
      daysOfWeek: allDays 
    });
  };

  const deselectAllDays = () => {
    setSlotFilters({ 
      ...slotFilters, 
      daysOfWeek: [] 
    });
  };

  // Bulk selection functions
  const toggleSlotSelection = (slotId) => {
    if (selectedSlots.includes(slotId)) {
      setSelectedSlots(selectedSlots.filter(id => id !== slotId));
    } else {
      setSelectedSlots([...selectedSlots, slotId]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSlots.length === slots.length) {
      setSelectedSlots([]);
    } else {
      setSelectedSlots(slots.map(slot => slot._id));
    }
  };

  const clearSelection = () => {
    setSelectedSlots([]);
  };

  // Bulk delete selected slots
  const handleBulkDeleteSelected = async () => {
    if (selectedSlots.length === 0) {
      toast.error('لم يتم اختيار أي مواعيد');
      return;
    }

    openConfirmModal(
      '🗑️ حذف المواعيد المختارة',
      `هل أنت متأكد من حذف ${selectedSlots.length} موعد؟ لا يمكن التراجع عن هذا الإجراء.`,
      async () => {
        try {
          toast.info(`⏳ جاري حذف ${selectedSlots.length} موعد...`);
          
          // Delete each slot
          const deletePromises = selectedSlots.map(id => slotAPI.delete(id));
          await Promise.all(deletePromises);
          
          toast.success(`✅ تم حذف ${selectedSlots.length} موعد بنجاح!`);
          setSelectedSlots([]);
          loadSlots(slotsCurrentPage, slotFilters);
        } catch (error) {
          toast.error('فشل حذف بعض المواعيد');
        }
      },
      'حذف',
      true // requiresPassword
    );
  };

  // Bulk assign for selected slots
  const handleBulkAssignSelected = () => {
    if (selectedSlots.length === 0) {
      toast.error('لم يتم اختيار أي مواعيد');
      return;
    }
    setBulkActionTarget('selected');
    setBulkAssignForm({ serviceName: '', providerName: '' });
    setShowBulkAssignModal(true);
  };

  // Bulk make selected slots weekly
  const handleBulkMakeWeekly = async () => {
    if (selectedSlots.length === 0) {
      toast.error('لم يتم اختيار أي مواعيد');
      return;
    }

    openConfirmModal(
      '📅 تحويل المواعيد المختارة إلى أسبوعية',
      `هل أنت متأكد من تحويل ${selectedSlots.length} موعد إلى أسبوعية؟`,
      async () => {
        try {
          console.log('Starting bulk weekly update for slots:', selectedSlots);
          toast.info(`⏳ جاري تحويل ${selectedSlots.length} موعد إلى أسبوعية...`);
          
          const response = await slotAPI.bulkUpdate({
            slotIds: selectedSlots,
            updates: { type: 'weekly' }
          });

          console.log('Response status:', response.status);
          console.log('Response data:', response.data);

          if (response.status === 200) {
            toast.success(`تم تحويل ${selectedSlots.length} موعد إلى أسبوعية بنجاح`);
            setSelectedSlots([]);
            loadSlots(slotsCurrentPage, slotFilters);
          } else {
            toast.error(response.data?.error || 'فشل في تحويل المواعيد');
          }
        } catch (error) {
          console.error('Error making slots weekly:', error);
          toast.error('حدث خطأ أثناء تحويل المواعيد');
        }
      },
      'تحويل إلى أسبوعية'
    );
  };

  // Bulk make selected slots available
  const handleBulkMakeAvailable = async () => {
    if (selectedSlots.length === 0) {
      toast.error('لم يتم اختيار أي مواعيد');
      return;
    }

    openConfirmModal(
      '✅ جعل المواعيد المختارة متاحة',
      `هل أنت متأكد من جعل ${selectedSlots.length} موعد متاح للحجز؟`,
      async () => {
        try {
          console.log('Starting bulk make available for slots:', selectedSlots);
          toast.info(`⏳ جاري جعل ${selectedSlots.length} موعد متاح...`);
          
          const response = await slotAPI.bulkUpdate({
            slotIds: selectedSlots,
            updates: { 
              serviceName: '', 
              providerName: '', 
              status: 'available',
              bookedBy: null
            }
          });

          console.log('Response status:', response.status);
          console.log('Response data:', response.data);

          if (response.status === 200) {
            toast.success(`تم جعل ${selectedSlots.length} موعد متاح بنجاح`);
            setSelectedSlots([]);
            loadSlots(slotsCurrentPage, slotFilters);
          } else {
            toast.error(response.data?.error || 'فشل في جعل المواعيد متاحة');
          }
        } catch (error) {
          console.error('Error making slots available:', error);
          toast.error('حدث خطأ أثناء جعل المواعيد متاحة');
        }
      },
      'جعل متاح'
    );
  };

  // Bulk assign for filtered slots
  const handleBulkAssignFiltered = () => {
    if (slotsPagination.total === 0) {
      toast.error('لا توجد مواعيد في الفلترة الحالية');
      return;
    }
    
    setBulkActionTarget('filtered');
    setBulkAssignForm({ serviceName: '', providerName: '' });
    setShowBulkAssignModal(true);
  };

  // Submit bulk assign
  const handleSubmitBulkAssign = async (e) => {
    e.preventDefault();
    
    if (!bulkAssignForm.serviceName || !bulkAssignForm.providerName) {
      toast.error('يجب إدخال اسم الخدمة والخادم');
      return;
    }

    try {
      if (bulkActionTarget === 'selected') {
        toast.info(`⏳ جاري تعيين ${selectedSlots.length} موعد...`);
        
        // Update each selected slot
        const updatePromises = selectedSlots.map(id => 
          slotAPI.update(id, {
            serviceName: bulkAssignForm.serviceName,
            providerName: bulkAssignForm.providerName
          })
        );
        await Promise.all(updatePromises);
        
        toast.success(`✅ تم تعيين ${selectedSlots.length} موعد بنجاح!`);
        setSelectedSlots([]);
      } else {
        // Apply to filtered results
        toast.info(`⏳ جاري تعيين ${slotsPagination.total} موعد...`);
        
        // Build filter params
        const params = { ...slotFilters };
        if (params.daysOfWeek && Array.isArray(params.daysOfWeek) && params.daysOfWeek.length > 0) {
          params.daysOfWeek = params.daysOfWeek.join(',');
        }
        if (params.roomIds && Array.isArray(params.roomIds) && params.roomIds.length > 0) {
          params.roomIds = params.roomIds.join(',');
        }
        if (params.timeRanges && Array.isArray(params.timeRanges) && params.timeRanges.length > 0) {
          params.timeRanges = params.timeRanges.join(',');
        }
        
        const response = await slotAPI.bulkUpdate({
          filters: params,
          updates: {
            serviceName: bulkAssignForm.serviceName,
            providerName: bulkAssignForm.providerName
          }
        });
        
        const updatedCount = response.data.count || slotsPagination.total;
        toast.success(`✅ تم تعيين ${updatedCount} موعد بنجاح!`);
      }
      
      setShowBulkAssignModal(false);
      setBulkAssignForm({ serviceName: '', providerName: '' });
      loadSlots(slotsCurrentPage, slotFilters);
    } catch (error) {
      toast.error('فشل تعيين المواعيد');
    }
  };

  // Bulk make filtered slots available
  const handleBulkMakeAvailableFiltered = () => {
    if (slotsPagination.total === 0) {
      toast.error('لا توجد مواعيد في الفلترة الحالية');
      return;
    }

    const confirmMessage = hasActiveFilters() 
      ? `هل أنت متأكد من جعل ${slotsPagination.total} موعد متاح للحجز (الفلترة الحالية)؟`
      : `هل أنت متأكد من جعل جميع المواعيد (${slotsPagination.total} موعد) متاحة للحجز؟`;
    
    openConfirmModal(
      '✅ جعل المواعيد متاحة (الفلترة الحالية)',
      confirmMessage,
      async () => {
        try {
          toast.info(`⏳ جاري جعل ${slotsPagination.total} موعد متاح...`);
          
          // Build filter params
          const params = { ...slotFilters };
          if (params.daysOfWeek && Array.isArray(params.daysOfWeek) && params.daysOfWeek.length > 0) {
            params.daysOfWeek = params.daysOfWeek.join(',');
          }
          if (params.roomIds && Array.isArray(params.roomIds) && params.roomIds.length > 0) {
            params.roomIds = params.roomIds.join(',');
          }
          if (params.timeRanges && Array.isArray(params.timeRanges) && params.timeRanges.length > 0) {
            params.timeRanges = params.timeRanges.join(',');
          }
          
          
          const response = await slotAPI.bulkUpdate({
            filters: params,
            updates: {
              serviceName: '',
              providerName: '',
              status: 'available',
              bookedBy: null
            }
          });
          
          const updatedCount = response.data.count || slotsPagination.total;
          toast.success(`✅ تم جعل ${updatedCount} موعد متاح بنجاح!`);
          await loadSlots(slotsCurrentPage, slotFilters);
        } catch (error) {
          console.error('Bulk make available filtered error:', error);
          toast.error('فشل جعل المواعيد متاحة');
        }
      }
    );
  };

  // Bulk delete filtered slots
  const handleBulkDeleteFiltered = () => {
    if (slotsPagination.total === 0) {
      toast.error('لا توجد مواعيد في الفلترة الحالية');
      return;
    }

    const confirmMessage = hasActiveFilters() 
      ? `هل أنت متأكد من حذف ${slotsPagination.total} موعد (الفلترة الحالية)؟ لا يمكن التراجع عن هذا الإجراء.`
      : `⚠️ خطر! هل أنت متأكد من حذف جميع المواعيد (${slotsPagination.total} موعد)؟`;
    
    openConfirmModal(
      '🗑️ حذف المواعيد (الفلترة الحالية)',
      confirmMessage,
      async () => {
        try {
          toast.info(`⏳ جاري حذف ${slotsPagination.total} موعد...`);
          
          // Build filter params
          const params = { ...slotFilters };
          if (params.daysOfWeek && Array.isArray(params.daysOfWeek) && params.daysOfWeek.length > 0) {
            params.daysOfWeek = params.daysOfWeek.join(',');
          }
          if (params.roomIds && Array.isArray(params.roomIds) && params.roomIds.length > 0) {
            params.roomIds = params.roomIds.join(',');
          }
          if (params.timeRanges && Array.isArray(params.timeRanges) && params.timeRanges.length > 0) {
            params.timeRanges = params.timeRanges.join(',');
          }
          
          const response = await slotAPI.bulkDelete({ filters: params });
          const deletedCount = response.data.count || slotsPagination.total;
          
          toast.success(`✅ تم حذف ${deletedCount} موعد بنجاح!`);
          loadSlots(slotsCurrentPage, slotFilters);
        } catch (error) {
          toast.error('فشل حذف المواعيد');
        }
      },
      'حذف',
      true // requiresPassword
    );
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
            className={`tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            📦 المجموعات ({roomGroups.length})
          </button>
          <button
            className={`tab ${activeTab === 'slots' ? 'active' : ''}`}
            onClick={() => setActiveTab('slots')}
          >
            <Calendar size={20} /> المواعيد ({slotsPagination.total || 0})
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
            onClick={handleExportSlotsJSON}
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

          {activeTab === 'groups' && (
            <div className="groups-section">
              <div className="section-header">
                <h2>إدارة المجموعات</h2>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupForm({ name: '', rooms: [], isEnabled: true });
                    setShowGroupModal(true);
                  }}
                >
                  <Plus size={18} /> إضافة مجموعة
                </button>
              </div>

              <div className="rooms-grid">
                {roomGroups.map((group) => (
                  <div key={group._id} className="room-card group-card">
                    <div className="room-header">
                      <h3>📦 {group.name}</h3>
                      <span className={`status-badge ${group.isEnabled ? 'enabled' : 'disabled'}`}>
                        {group.isEnabled ? 'مفعّل' : 'معطّل'}
                      </span>
                    </div>
                    <div className="group-rooms-list">
                      <strong>الأماكن ({group.rooms.length}):</strong>
                      <div className="rooms-tags">
                        {group.rooms.map((room) => (
                          <span key={room._id} className="room-tag">
                            {room.name}
                          </span>
                        ))}
                        {group.rooms.length === 0 && (
                          <span className="no-rooms">لا توجد أماكن</span>
                        )}
                      </div>
                    </div>
                    <div className="room-actions">
                      <button
                        className={`btn-toggle ${group.isEnabled ? 'enabled' : 'disabled'}`}
                        onClick={() => handleToggleGroupStatus(group)}
                        title={group.isEnabled ? 'تعطيل المجموعة' : 'تفعيل المجموعة'}
                      >
                        {group.isEnabled ? '❌ تعطيل' : '✅ تفعيل'}
                      </button>
                      <button
                        className="btn-edit"
                        onClick={() => openEditGroup(group)}
                      >
                        <Edit2 size={16} /> تعديل
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteGroup(group._id)}
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
                    setBulkMode(false);
                    setDateRangeMode(false);
                    setSelectedRooms([]);
                    setMultipleSlots([{ startTime: '', endTime: '', date: '' }]);
                    setDateRangeStart('');
                    setDateRangeEnd('');
                    setTimeSlots([{ startTime: '', endTime: '' }]);
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
                  <div className="filter-item rooms-filter">
                    <div className="filter-header">
                      <label>المكان</label>
                      <div className="select-all-buttons">
                        <button 
                          type="button"
                          className="btn-select-all"
                          onClick={selectAllRooms}
                          disabled={slotFilters.roomIds.length === rooms.length}
                        >
                          اختيار الكل
                        </button>
                        <button 
                          type="button"
                          className="btn-deselect-all"
                          onClick={deselectAllRooms}
                          disabled={slotFilters.roomIds.length === 0}
                        >
                          إلغاء الكل
                        </button>
                      </div>
                    </div>
                    <div className="rooms-checkboxes">
                      {rooms.map((room) => (
                        <label key={room._id} className="room-checkbox">
                          <input
                            type="checkbox"
                            checked={slotFilters.roomIds.includes(room._id)}
                            onChange={() => toggleRoomFilter(room._id)}
                          />
                          <span>{room.name}</span>
                        </label>
                      ))}
                    </div>
                    {slotFilters.roomIds.length > 0 && (
                      <div className="selected-rooms-info">
                        ✓ تم اختيار {slotFilters.roomIds.length} مكان
                      </div>
                    )}
                  </div>

                  <div className="filter-item time-ranges-filter">
                    <div className="filter-header">
                      <label>الفترات الزمنية</label>
                      <div className="select-all-buttons">
                        <button 
                          type="button"
                          className="btn-select-all"
                          onClick={selectAllTimeRanges}
                          disabled={slotFilters.timeRanges.length === timeRangeOptions.length}
                        >
                          اختيار الكل
                        </button>
                        <button 
                          type="button"
                          className="btn-deselect-all"
                          onClick={deselectAllTimeRanges}
                          disabled={slotFilters.timeRanges.length === 0}
                        >
                          إلغاء الكل
                        </button>
                      </div>
                    </div>
                    <div className="time-ranges-checkboxes">
                      {timeRangeOptions.map((timeRange) => (
                        <label key={timeRange.value} className="time-range-checkbox">
                          <input
                            type="checkbox"
                            checked={slotFilters.timeRanges.includes(timeRange.value)}
                            onChange={() => toggleTimeRange(timeRange.value)}
                          />
                          <span>{timeRange.label}</span>
                        </label>
                      ))}
                    </div>
                    {slotFilters.timeRanges.length > 0 && (
                      <div className="selected-time-ranges-info">
                        ✓ تم اختيار {slotFilters.timeRanges.length} فترة زمنية
                      </div>
                    )}
                  </div>

                  <div className="filter-item">
                    <label>التاريخ (يوم واحد)</label>
                    <input
                      type="date"
                      value={slotFilters.date}
                      onChange={(e) => {
                        setSlotFilters({ ...slotFilters, date: e.target.value });
                      }}
                      placeholder="تصفية بالتاريخ"
                    />
                  </div>

                  <div className="filter-item">
                    <label>النوع</label>
                    <select
                      value={slotFilters.type}
                      onChange={(e) => {
                        setSlotFilters({ ...slotFilters, type: e.target.value });
                      }}
                    >
                      <option value="">جميع الأنواع</option>
                      <option value="single">مرة واحدة</option>
                      <option value="weekly">أسبوعي</option>
                    </select>
                  </div>


                  <div className="filter-item">
                    <label>اسم الخدمة</label>
                    <input
                      type="text"
                      value={slotFilters.serviceName}
                      onChange={(e) => {
                        setSlotFilters({ ...slotFilters, serviceName: e.target.value });
                      }}
                      placeholder="بحث بالخدمة"
                    />
                  </div>

                  <div className="filter-item">
                    <label>اسم الخادم</label>
                    <input
                      type="text"
                      value={slotFilters.providerName}
                      onChange={(e) => {
                        setSlotFilters({ ...slotFilters, providerName: e.target.value });
                      }}
                      placeholder="بحث بالخادم"
                    />
                  </div>
                </div>

                {/* Advanced Date Range & Day Filters */}
                <div className="advanced-filters">
                  <h4 style={{ margin: '1.5rem 0 1rem', fontSize: '1rem', fontWeight: '600', color: '#667eea' }}>
                    📅 تصفية متقدمة - بفترة زمنية وأيام محددة
                  </h4>
                  <div className="date-range-filters">
                    <div className="filter-row">
                      <div className="filter-item">
                        <label>من تاريخ</label>
                        <input
                          type="date"
                          value={slotFilters.dateRangeStart}
                          onChange={(e) => {
                            setSlotFilters({ ...slotFilters, dateRangeStart: e.target.value, date: '' });
                          }}
                          placeholder="تاريخ البداية"
                        />
                      </div>
                      <div className="filter-item">
                        <label>إلى تاريخ</label>
                        <input
                          type="date"
                          value={slotFilters.dateRangeEnd}
                          onChange={(e) => {
                            setSlotFilters({ ...slotFilters, dateRangeEnd: e.target.value, date: '' });
                          }}
                          placeholder="تاريخ النهاية"
                        />
                      </div>
                    </div>
                    
                    <div className="days-of-week-filter">
                      <div className="filter-header">
                        <label style={{ fontSize: '0.875rem', fontWeight: '600', color: '#555', marginBottom: '0.5rem', display: 'block' }}>
                          اختر الأيام (داخل الفترة):
                        </label>
                        <div className="select-all-buttons">
                          <button 
                            type="button"
                            className="btn-select-all"
                            onClick={selectAllDays}
                            disabled={slotFilters.daysOfWeek.length === 7}
                          >
                            اختيار الكل
                          </button>
                          <button 
                            type="button"
                            className="btn-deselect-all"
                            onClick={deselectAllDays}
                            disabled={slotFilters.daysOfWeek.length === 0}
                          >
                            إلغاء الكل
                          </button>
                        </div>
                      </div>
                      <div className="days-checkboxes">
                        {[
                          { value: 0, label: 'الأحد', shortLabel: 'أحد' },
                          { value: 1, label: 'الاثنين', shortLabel: 'اثنين' },
                          { value: 2, label: 'الثلاثاء', shortLabel: 'ثلاثاء' },
                          { value: 3, label: 'الأربعاء', shortLabel: 'أربعاء' },
                          { value: 4, label: 'الخميس', shortLabel: 'خميس' },
                          { value: 5, label: 'الجمعة', shortLabel: 'جمعة' },
                          { value: 6, label: 'السبت', shortLabel: 'سبت' }
                        ].map((day) => (
                          <label key={day.value} className="day-checkbox">
                            <input
                              type="checkbox"
                              checked={slotFilters.daysOfWeek.includes(day.value)}
                              onChange={() => toggleDayOfWeek(day.value)}
                            />
                            <span>{day.shortLabel}</span>
                          </label>
                        ))}
                      </div>
                      {slotFilters.daysOfWeek.length > 0 && (
                        <div className="selected-days-info">
                          ✓ تم اختيار {slotFilters.daysOfWeek.length} يوم
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="filters-actions">
                  <div className="filter-stats">
                    <span className="stats-badge">
                      عرض {slotsPagination.total} موعد
                    </span>
                  </div>
                  
                  {/* Available Only Toggle */}
                  <div className="available-only-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={showAvailableOnly}
                        onChange={(e) => setShowAvailableOnly(e.target.checked)}
                        className="toggle-checkbox"
                      />
                      <span className="toggle-text">🔓 تشوف الأماكن المتاحة فقط</span>
                    </label>
                  </div>

                  <button 
                    className="btn-apply-filters" 
                    onClick={applySlotFilters}
                    disabled={slotsLoading}
                  >
                    {slotsLoading ? '⏳ جاري التحميل...' : '🔍 تطبيق التصفية'}
                  </button>
                </div>
              </div>

              {/* Bulk Actions Bar */}
              {selectedSlots.length > 0 && (
                <div className="bulk-actions-bar">
                  <div className="bulk-selection-info">
                    <span className="selected-count">✓ تم اختيار {selectedSlots.length} موعد</span>
                    <button className="btn-clear-selection" onClick={clearSelection}>
                      <X size={14} /> إلغاء التحديد
                    </button>
                  </div>
                  <div className="bulk-action-buttons">
                    <button className="btn-bulk-assign" onClick={handleBulkAssignSelected}>
                      ✏️ تعيين للمختارة
                    </button>
                    <button className="btn-bulk-weekly" onClick={handleBulkMakeWeekly}>
                      📅 جعل أسبوعية
                    </button>
                    <button className="btn-bulk-available" onClick={handleBulkMakeAvailable}>
                      ✅ جعل متاحة
                    </button>
                    <button className="btn-bulk-delete" onClick={handleBulkDeleteSelected}>
                      <Trash2 size={16} /> حذف المختارة
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk Actions for Filtered Results */}
              <div className="filtered-actions-bar">
                <div className="filtered-info">
                  <span>إجراءات جماعية على الفلترة الحالية ({slotsPagination.total} موعد):</span>
                </div>
                <div className="filtered-action-buttons">
                  <button className="btn-filtered-assign" onClick={handleBulkAssignFiltered}>
                    ✏️ تعيين للفلترة الحالية
                  </button>
                  <button className="btn-filtered-available" onClick={handleBulkMakeAvailableFiltered}>
                    ✅ جعل متاحة
                  </button>
                  <button className="btn-filtered-delete" onClick={handleBulkDeleteFiltered}>
                    <Trash2 size={16} /> حذف الفلترة الحالية
                  </button>
                </div>
              </div>

              <div className="slots-table-container">
                
                <table className="slots-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={slots.length > 0 && selectedSlots.length === slots.length}
                          onChange={toggleSelectAll}
                          title="تحديد الكل"
                        />
                      </th>
                      <th 
                        className="sortable-header" 
                        onClick={() => handleSort('roomName')}
                        style={{ cursor: 'pointer' }}
                        title="اضغط للترتيب: تنازلي → تصاعدي → إلغاء"
                      >
                        المكان {renderSortIcon('roomName')}
                      </th>
                      <th 
                        className="sortable-header" 
                        onClick={() => handleSort('date')}
                        style={{ cursor: 'pointer' }}
                        title="اضغط للترتيب: الأحدث → الأقدم → إلغاء"
                      >
                        التاريخ {renderSortIcon('date')}
                      </th>
                      <th 
                        className="sortable-header" 
                        onClick={() => handleSort('startTime')}
                        style={{ cursor: 'pointer' }}
                        title="اضغط للترتيب: الأحدث → الأقدم → إلغاء"
                      >
                        الوقت {renderSortIcon('startTime')}
                      </th>
                      <th 
                        className="sortable-header" 
                        onClick={() => handleSort('serviceName')}
                        style={{ cursor: 'pointer' }}
                        title="اضغط للترتيب: تنازلي → تصاعدي → إلغاء"
                      >
                        الخدمة {renderSortIcon('serviceName')}
                      </th>
                      <th 
                        className="sortable-header" 
                        onClick={() => handleSort('providerName')}
                        style={{ cursor: 'pointer' }}
                        title="اضغط للترتيب: تنازلي → تصاعدي → إلغاء"
                      >
                        الخادم {renderSortIcon('providerName')}
                      </th>
                      <th 
                        className="sortable-header" 
                        onClick={() => handleSort('type')}
                        style={{ cursor: 'pointer' }}
                        title="اضغط للترتيب: تنازلي → تصاعدي → إلغاء"
                      >
                        النوع {renderSortIcon('type')}
                      </th>
                      <th 
                        className="sortable-header" 
                        onClick={() => handleSort('status')}
                        style={{ cursor: 'pointer' }}
                        title="اضغط للترتيب: تنازلي → تصاعدي → إلغاء"
                      >
                        الحالة {renderSortIcon('status')}
                      </th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotsLoading ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <div style={{ fontSize: '24px' }}>⏳</div>
                            <div>جاري تحميل المواعيد...</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      sortedSlots.map((slot) => (
                      <tr key={slot._id} className={selectedSlots.includes(slot._id) ? 'selected-row' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedSlots.includes(slot._id)}
                            onChange={() => toggleSlotSelection(slot._id)}
                          />
                        </td>
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

              {slots.length === 0 && slotsPagination.total === 0 && (
                <div className="filter-helper-message">
                  <Calendar size={32} />
                  <p>👆 اختر الفلاتر أعلاه ثم اضغط "تطبيق التصفية" لعرض المواعيد</p>
                  <small>يمكنك ترك الفلاتر فارغة لعرض جميع المواعيد</small>
                </div>
              )}

              {/* Slots Pagination */}
              {slotsPagination.totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="pagination-btn"
                    onClick={() => {
                      const newPage = Math.max(slotsCurrentPage - 1, 1);
                      setSlotsCurrentPage(newPage);
                      loadSlots(newPage, slotFilters);
                    }}
                    disabled={slotsCurrentPage === 1}
                  >
                    السابق
                  </button>
                  <span className="pagination-info">
                    صفحة {slotsCurrentPage} من {slotsPagination.totalPages}
                    <small style={{ display: 'block', fontSize: '0.8em', color: '#666' }}>
                      ({slotsPagination.total} موعد)
                    </small>
                  </span>
                  <button
                    className="pagination-btn"
                    onClick={() => {
                      const newPage = Math.min(slotsCurrentPage + 1, slotsPagination.totalPages);
                      setSlotsCurrentPage(newPage);
                      loadSlots(newPage, slotFilters);
                    }}
                    disabled={slotsCurrentPage === slotsPagination.totalPages}
                  >
                    التالي
                  </button>
                </div>
              )}
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
                      <div className="booking-timestamp">
                        <span className="timestamp-label">📅 تم الإرسال:</span>
                        <span className="timestamp-value">
                          {new Date(booking.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                          {' '}
                          {new Date(booking.createdAt).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="booking-details">
                        <p><strong>المكان:</strong> {booking.roomId?.name}</p>
                        <p><strong>التاريخ:</strong> {new Date(booking.date).toLocaleDateString('ar-EG')}</p>
                        <p><strong>الوقت:</strong> {formatTimeRange(booking.startTime, booking.endTime)}</p>
                        <p><strong>الخدمة:</strong> {booking.serviceName}</p>
                        <p><strong>الخادم:</strong> {booking.providerName}</p>
                        <p><strong>📱 رقم الهاتف:</strong> {booking.phoneNumber || 'غير متوفر'}</p>
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
                {bookings.length > 0 && (
                  <button 
                    className="btn-danger btn-clear-history"
                    onClick={() => openConfirmModal(
                      'مسح سجل الحجوزات',
                      `هل أنت متأكد من حذف جميع الحجوزات (${bookings.length} حجز)؟ هذا الإجراء لا يمكن التراجع عنه.`,
                      handleClearBookingsHistory
                    )}
                    title="حذف جميع الحجوزات من قاعدة البيانات"
                  >
                    <Trash2 size={16} /> مسح السجل
                  </button>
                )}
              </div>
              <div className="bookings-history">
                {bookings.map((booking) => (
                  <div key={booking._id} className={`booking-card ${booking.status}`}>
                    <div className="booking-header">
                      <h4>{booking.userName}</h4>
                      <span className={`status-badge ${booking.status}`}>
                        {booking.status === 'approved' ? 'موافق عليه' : booking.status === 'rejected' ? 'مرفوض' : booking.status}
                      </span>
                    </div>
                    <div className="booking-timestamp">
                      <span className="timestamp-label">📅 تم الإرسال:</span>
                      <span className="timestamp-value">
                        {new Date(booking.createdAt).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                        {' '}
                        {new Date(booking.createdAt).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="booking-details">
                      <p><strong>المكان:</strong> {booking.roomId?.name}</p>
                      <p><strong>التاريخ:</strong> {new Date(booking.date).toLocaleDateString('ar-EG')}</p>
                      <p><strong>الوقت:</strong> {formatTimeRange(booking.startTime, booking.endTime)}</p>
                      <p><strong>📱 رقم الهاتف:</strong> {booking.phoneNumber || 'غير متوفر'}</p>
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

              {/* Bookings Pagination */}
              {bookingsPagination.totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="pagination-btn"
                    onClick={() => {
                      const newPage = Math.max(bookingsCurrentPage - 1, 1);
                      setBookingsCurrentPage(newPage);
                      loadBookings(newPage);
                    }}
                    disabled={bookingsCurrentPage === 1}
                  >
                    السابق
                  </button>
                  <span className="pagination-info">
                    صفحة {bookingsCurrentPage} من {bookingsPagination.totalPages}
                    <small style={{ display: 'block', fontSize: '0.8em', color: '#666' }}>
                      ({bookingsPagination.total} حجز)
                    </small>
                  </span>
                  <button
                    className="pagination-btn"
                    onClick={() => {
                      const newPage = Math.min(bookingsCurrentPage + 1, bookingsPagination.totalPages);
                      setBookingsCurrentPage(newPage);
                      loadBookings(newPage);
                    }}
                    disabled={bookingsCurrentPage === bookingsPagination.totalPages}
                  >
                    التالي
                  </button>
                </div>
              )}
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

      {/* Group Modal */}
      {showGroupModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editingGroup ? 'تعديل المجموعة' : 'إضافة مجموعة جديدة'}</h2>
              <button onClick={() => setShowGroupModal(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateGroup} className="modal-form">
              <div className="form-group">
                <label>اسم المجموعة</label>
                <input
                  type="text"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  required
                  placeholder="مثال: 400's"
                />
              </div>
              
              <div className="form-group">
                <label>اختر الأماكن للمجموعة</label>
                <div className="rooms-checkboxes">
                  {rooms.filter(r => r.isEnabled).map((room) => (
                    <label key={room._id} className="checkbox-label room-checkbox">
                      <input
                        type="checkbox"
                        checked={groupForm.rooms.includes(room._id)}
                        onChange={() => toggleRoomInGroup(room._id)}
                      />
                      <span>{room.name}</span>
                    </label>
                  ))}
                </div>
                {groupForm.rooms.length > 0 && (
                  <div className="selected-count">
                    ✓ تم اختيار {groupForm.rooms.length} مكان
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={groupForm.isEnabled}
                    onChange={(e) => setGroupForm({ ...groupForm, isEnabled: e.target.checked })}
                  />
                  <span>تفعيل هذه المجموعة</span>
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowGroupModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  {editingGroup ? 'تحديث' : 'إنشاء'}
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
              
              {!editingSlot && (
                <>
                  <div className="form-group bulk-toggle">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={bulkMode}
                        onChange={(e) => {
                          setBulkMode(e.target.checked);
                          if (e.target.checked) {
                            setDateRangeMode(false);
                          } else {
                            setSelectedRooms([]);
                            setMultipleSlots([{ startTime: '', endTime: '', date: '' }]);
                          }
                        }}
                      />
                      <span>🔄 وضع الإضافة المتعددة (اختر أكثر من مكان و/أو موعد)</span>
                    </label>
                  </div>

                  <div className="form-group bulk-toggle" style={{marginTop: '0.5rem'}}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={dateRangeMode}
                        onChange={(e) => {
                          setDateRangeMode(e.target.checked);
                          if (e.target.checked) {
                            setBulkMode(false);
                          } else {
                            setSelectedRooms([]);
                            setDateRangeStart('');
                            setDateRangeEnd('');
                            setTimeSlots([{ startTime: '', endTime: '' }]);
                          }
                        }}
                      />
                      <span>📅 وضع الفترة الزمنية (احجز فترة كاملة - كل يوم)</span>
                    </label>
                  </div>
                </>
              )}

              {bulkMode && !editingSlot ? (
                <>
                  <div className="form-group">
                    <label>اختيار الأماكن (اختر مكان أو أكثر)</label>
                    <div className="rooms-checkboxes">
                      {rooms.filter(r => r.isEnabled).map((room) => (
                        <label key={room._id} className="checkbox-label room-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedRooms.includes(room._id)}
                            onChange={() => toggleRoomSelection(room._id)}
                          />
                          <span>{room.name}</span>
                        </label>
                      ))}
                    </div>
                    {selectedRooms.length > 0 && (
                      <div className="selected-count">
                        ✓ تم اختيار {selectedRooms.length} مكان
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>المواعيد</label>
                    <div className="multiple-slots">
                      {multipleSlots.map((slot, index) => (
                        <div key={index} className="slot-row">
                          <input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => updateSlot(index, 'startTime', e.target.value)}
                            placeholder="من"
                            required
                          />
                          <input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => updateSlot(index, 'endTime', e.target.value)}
                            placeholder="إلى"
                            required
                          />
                          <input
                            type="date"
                            value={slot.date}
                            onChange={(e) => updateSlot(index, 'date', e.target.value)}
                            required
                          />
                          {multipleSlots.length > 1 && (
                            <button
                              type="button"
                              className="btn-remove-slot"
                              onClick={() => removeSlot(index)}
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn-add-slot"
                        onClick={addSlot}
                      >
                        <Plus size={16} /> إضافة موعد آخر
                      </button>
                    </div>
                  </div>
                </>
              ) : dateRangeMode && !editingSlot ? (
                <>
                  <div className="form-group">
                    <label>اختيار الأماكن (اختر مكان أو أكثر)</label>
                    <div className="rooms-checkboxes">
                      {rooms.filter(r => r.isEnabled).map((room) => (
                        <label key={room._id} className="checkbox-label room-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedRooms.includes(room._id)}
                            onChange={() => toggleRoomSelection(room._id)}
                          />
                          <span>{room.name}</span>
                        </label>
                      ))}
                    </div>
                    {selectedRooms.length > 0 && (
                      <div className="selected-count">
                        ✓ تم اختيار {selectedRooms.length} مكان
                      </div>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>تاريخ البداية</label>
                      <input
                        type="date"
                        value={dateRangeStart}
                        onChange={(e) => setDateRangeStart(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>تاريخ النهاية</label>
                      <input
                        type="date"
                        value={dateRangeEnd}
                        onChange={(e) => setDateRangeEnd(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {dateRangeStart && dateRangeEnd && (
                    <div className="date-range-preview">
                      <strong>📅 عدد الأيام: </strong>
                      {Math.ceil((new Date(dateRangeEnd) - new Date(dateRangeStart)) / (1000 * 60 * 60 * 24)) + 1} يوم
                      
                      {/* Total slots calculation */}
                      {(() => {
                        const days = Math.ceil((new Date(dateRangeEnd) - new Date(dateRangeStart)) / (1000 * 60 * 60 * 24)) + 1;
                        const validTimeSlots = timeSlots.filter(slot => slot.startTime && slot.endTime).length;
                        const roomsCount = selectedRooms.length || 0;
                        const totalSlots = days * validTimeSlots * roomsCount;
                        
                        if (roomsCount > 0 && validTimeSlots > 0) {
                          return (
                            <div style={{ marginTop: '8px' }}>
                              <strong>🔢 إجمالي المواعيد: </strong>
                              <span style={{ 
                                color: totalSlots > 5000 ? '#d32f2f' : totalSlots > 1000 ? '#f57c00' : '#2e7d32',
                                fontWeight: 'bold',
                                fontSize: '1.1rem'
                              }}>
                                {totalSlots.toLocaleString('ar-EG')} موعد
                              </span>
                              <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                                ({days} يوم × {validTimeSlots} موعد × {roomsCount} مكان)
                              </small>
                              {totalSlots > 5000 && (
                                <div style={{ 
                                  marginTop: '8px', 
                                  padding: '8px', 
                                  backgroundColor: '#ffebee', 
                                  borderRadius: '4px',
                                  color: '#d32f2f',
                                  fontSize: '0.9rem'
                                }}>
                                  ⚠️ العدد كبير جداً! الحد الأقصى 5000 موعد
                                </div>
                              )}
                              {totalSlots > 1000 && totalSlots <= 5000 && (
                                <div style={{ 
                                  marginTop: '8px', 
                                  padding: '8px', 
                                  backgroundColor: '#fff3e0', 
                                  borderRadius: '4px',
                                  color: '#f57c00',
                                  fontSize: '0.9rem'
                                }}>
                                  ⚠️ عدد كبير! قد يستغرق بضع دقائق
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  <div className="form-group">
                    <label>المواعيد اليومية (نفس الأوقات كل يوم)</label>
                    <div className="multiple-slots">
                      {timeSlots.map((timeSlot, index) => (
                        <div key={index} className="slot-row">
                          <input
                            type="time"
                            value={timeSlot.startTime}
                            onChange={(e) => updateTimeSlot(index, 'startTime', e.target.value)}
                            placeholder="من"
                            required
                          />
                          <input
                            type="time"
                            value={timeSlot.endTime}
                            onChange={(e) => updateTimeSlot(index, 'endTime', e.target.value)}
                            placeholder="إلى"
                            required
                          />
                          {timeSlots.length > 1 && (
                            <button
                              type="button"
                              className="btn-remove-slot"
                              onClick={() => removeTimeSlot(index)}
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn-add-slot"
                        onClick={addTimeSlot}
                      >
                        <Plus size={16} /> إضافة موعد آخر
                      </button>
                    </div>
                  </div>
                </>
              ) : (
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
              )}
              {!bulkMode && !dateRangeMode && (
                <>
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
                </>
              )}
              
              {bulkMode && (
                <>
                  <div className="form-group">
                    <label>النوع</label>
                    <select
                      value={slotForm.type}
                      onChange={(e) => setSlotForm({ ...slotForm, type: e.target.value, weeklyOccurrences: 1 })}
                    >
                      <option value="single">مرة واحدة</option>
                      <option value="weekly">أسبوعي</option>
                    </select>
                  </div>
                  
                  {slotForm.type === 'weekly' && (
                    <div className="form-group weekly-occurrences">
                      <label>عدد الأسابيع (كم مرة يتكرر كل موعد؟)</label>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        value={slotForm.weeklyOccurrences}
                        onChange={(e) => setSlotForm({ ...slotForm, weeklyOccurrences: e.target.value })}
                        placeholder="مثال: 4 (يكرر كل موعد 4 مرات، كل 7 أيام)"
                      />
                      <small className="form-hint">
                        ℹ️ كل موعد في القائمة سيتكرر {slotForm.weeklyOccurrences} مرة، كل أسبوع (+7 أيام)
                      </small>
                    </div>
                  )}
                </>
              )}
              
              {slotForm.type === 'weekly' && !editingSlot && !bulkMode && (
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
              
              {confirmConfig.requiresPassword && (
                <div className="password-input-container">
                  <label htmlFor="confirmPassword">كلمة المرور للتأكيد:</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="اكتب 2001 للتأكيد"
                    className="password-input"
                    autoComplete="off"
                  />
                </div>
              )}
              
              <div className="confirm-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmPassword('');
                  }}
                >
                  إلغاء
                </button>
                <button 
                  className="btn-danger"
                  onClick={handleConfirm}
                  disabled={confirmConfig.requiresPassword && confirmPassword !== '2001'}
                >
                  {confirmConfig.confirmButtonText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Modal */}
      {showBulkAssignModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>
                {bulkActionTarget === 'selected' 
                  ? `✏️ تعيين خدمة وخادم (${selectedSlots.length} موعد)` 
                  : `✏️ تعيين خدمة وخادم (${slotsPagination.total} موعد)`}
              </h2>
              <button onClick={() => setShowBulkAssignModal(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmitBulkAssign} className="modal-form">
              <div className="form-group">
                <label>اسم الخدمة *</label>
                <input
                  type="text"
                  value={bulkAssignForm.serviceName}
                  onChange={(e) => setBulkAssignForm({ ...bulkAssignForm, serviceName: e.target.value })}
                  required
                  placeholder="مثال: اجتماع، تدريب"
                />
              </div>
              <div className="form-group">
                <label>اسم الخادم *</label>
                <input
                  type="text"
                  value={bulkAssignForm.providerName}
                  onChange={(e) => setBulkAssignForm({ ...bulkAssignForm, providerName: e.target.value })}
                  required
                  placeholder="مثال: فيلوباتير ماجد"
                />
              </div>
              
              <div className="bulk-assign-info">
                <div className="info-icon">ℹ️</div>
                <p>
                  {bulkActionTarget === 'selected' 
                    ? `سيتم تعيين الخدمة والخادم لـ ${selectedSlots.length} موعد مختار وتغيير حالتهم إلى "محجوز"`
                    : `سيتم تعيين الخدمة والخادم لجميع المواعيد في الفلترة الحالية (${slotsPagination.total} موعد) وتغيير حالتهم إلى "محجوز"`
                  }
                </p>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowBulkAssignModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  ✅ تعيين الآن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;


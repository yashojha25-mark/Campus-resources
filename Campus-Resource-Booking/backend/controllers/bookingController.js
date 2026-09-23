const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const Resource = require('../models/Resource');
const serverError = require('../utils/errorResponse');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidDate = (date) => {
  if (!date) {
    return false;
  }

  return !Number.isNaN(new Date(date).getTime());
};

const getDateRange = (date) => {
  const selectedDate = new Date(date);
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return { startOfDay, endOfDay };
};

const getMinutesFromTime = (time) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) {
    return null;
  }

  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
};

const isValidTimeOrder = (startTime, endTime) => {
  const startMinutes = getMinutesFromTime(startTime);
  const endMinutes = getMinutesFromTime(endTime);

  if (startMinutes === null || endMinutes === null) {
    return false;
  }

  return startMinutes < endMinutes;
};

const getBookingQuery = (req) => {
  if (req.user.role === 'admin') {
    return {};
  }

  return { studentId: req.user._id };
};

const findOverlappingBooking = async ({ resourceId, date, startTime, endTime, excludeBookingId }) => {
  const { startOfDay, endOfDay } = getDateRange(date);
  const query = {
    resourceId,
    status: { $ne: 'cancelled' },
    date: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  return Booking.findOne(query);
};

const createBooking = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can create bookings' });
    }

    const { resourceId, date, startTime, endTime } = req.body;

    if (!resourceId || !isValidObjectId(resourceId)) {
      return res.status(400).json({ message: 'Valid resourceId is required' });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'Valid date is required' });
    }

    if (!isValidTimeOrder(startTime, endTime)) {
      return res.status(400).json({ message: 'startTime must be before endTime in HH:mm format' });
    }

    const resource = await Resource.findById(resourceId);

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (!resource.available) {
      return res.status(400).json({ message: 'Resource is not available' });
    }

    const overlappingBooking = await findOverlappingBooking({
      resourceId,
      date,
      startTime,
      endTime,
    });

    if (overlappingBooking) {
      return res.status(409).json({ message: 'Resource is already booked for this time slot' });
    }

    const booking = await Booking.create({
      resourceId,
      studentId: req.user._id,
      date,
      startTime,
      endTime,
      status: 'confirmed',
    });

    res.status(201).json({
      message: 'Booking created successfully',
      booking,
    });
  } catch (error) {
    return serverError(res, 'Failed to create booking', error);
  }
};

const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find(getBookingQuery(req))
      .populate('resourceId')
      .populate('studentId', '-password')
      .sort({ createdAt: -1 });

    res.status(200).json({ bookings });
  } catch (error) {
    return serverError(res, 'Failed to fetch bookings', error);
  }
};

const getBookingById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      ...getBookingQuery(req),
    })
      .populate('resourceId')
      .populate('studentId', '-password');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.status(200).json({ booking });
  } catch (error) {
    return serverError(res, 'Failed to fetch booking', error);
  }
};

const updateBooking = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }

    const { resourceId, date, startTime, endTime, status } = req.body;
    const isStudentCancellation = req.user.role === 'student' && status === 'cancelled';

    if (isStudentCancellation) {
      const booking = await Booking.findOneAndUpdate(
        {
          _id: req.params.id,
          studentId: req.user._id,
        },
        { status: 'cancelled' },
        {
          new: true,
          runValidators: true,
        }
      )
        .populate('resourceId')
        .populate('studentId', '-password');

      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      return res.status(200).json({
        message: 'Booking cancelled successfully',
        booking,
      });
    }

    if (!resourceId || !isValidObjectId(resourceId)) {
      return res.status(400).json({ message: 'Valid resourceId is required' });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'Valid date is required' });
    }

    if (!isValidTimeOrder(startTime, endTime)) {
      return res.status(400).json({ message: 'startTime must be before endTime in HH:mm format' });
    }

    const resource = await Resource.findById(resourceId);

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (!resource.available) {
      return res.status(400).json({ message: 'Resource is not available' });
    }

    const shouldCheckOverlap = req.user.role !== 'admin' || status !== 'cancelled';

    if (shouldCheckOverlap) {
      const overlappingBooking = await findOverlappingBooking({
        resourceId,
        date,
        startTime,
        endTime,
        excludeBookingId: req.params.id,
      });

      if (overlappingBooking) {
        return res.status(409).json({ message: 'Resource is already booked for this time slot' });
      }
    }

    const booking = await Booking.findOneAndUpdate(
      {
        _id: req.params.id,
        ...getBookingQuery(req),
      },
      {
        resourceId,
        date,
        startTime,
        endTime,
        ...(status && req.user.role === 'admin' ? { status } : {}),
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('resourceId')
      .populate('studentId', '-password');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.status(200).json({
      message: 'Booking updated successfully',
      booking,
    });
  } catch (error) {
    return serverError(res, 'Failed to update booking', error);
  }
};

const deleteBooking = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid booking id' });
    }

    const booking = await Booking.findOneAndDelete({
      _id: req.params.id,
      ...getBookingQuery(req),
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.status(200).json({ message: 'Booking deleted successfully' });
  } catch (error) {
    return serverError(res, 'Failed to delete booking', error);
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  deleteBooking,
  // Shared with resourceController.getResourceAvailability so the pre-flight
  // check and the actual create use the *same* overlap logic and can never
  // disagree about what "available" means.
  findOverlappingBooking,
  isValidTimeOrder,
  isValidDate,
};

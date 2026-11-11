function createLabService(db, labSlots, bookings) {
  const bookSlotTransaction = db.transaction((userId, slotId, now) => {
    const slot = labSlots.findById(slotId);
    if (!slot) {
      return { success: false, error: 'NOT_FOUND' };
    }

    if (slot.starts_at <= now) {
      return { success: false, error: 'PAST_SLOT' };
    }

    if (slot.reserved_seats >= slot.capacity) {
      return { success: false, error: 'FULL' };
    }

    if (bookings.findActive(userId, slotId)) {
      return { success: false, error: 'ALREADY_BOOKED' };
    }

    if (!labSlots.incrementReservedSeats(slotId)) {
      return { success: false, error: 'FULL' };
    }
    bookings.create(userId, slotId);

    return { success: true, labName: slot.lab_name, startsAt: slot.starts_at };
  }).immediate;

  const cancelBookingTransaction = db.transaction((userId, bookingId, now) => {
    const booking = bookings.findById(bookingId);
    if (!booking) {
      return { success: false, error: 'NOT_FOUND' };
    }

    if (booking.user_id !== userId) {
      return { success: false, error: 'FORBIDDEN' };
    }

    if (booking.status === 'cancelled') {
      return { success: true };
    }

    const slot = labSlots.findById(booking.slot_id);
    if (!slot) {
      return { success: false, error: 'NOT_FOUND' };
    }
    if (slot.starts_at <= now) {
      return { success: false, error: 'PAST_SLOT' };
    }

    if (!bookings.cancel(bookingId)) {
      return { success: true };
    }
    if (!labSlots.decrementReservedSeats(booking.slot_id)) {
      throw new Error(`Could not release a seat for booking ${bookingId}.`);
    }

    return { success: true };
  }).immediate;

  return {
    listAvailableSlots({ labName, date } = {}, now = new Date().toISOString()) {
      return labSlots.listUpcoming(now).filter((slot) =>
        (!labName || slot.lab_name.toLowerCase() === labName.toLowerCase())
        && (!date || slot.starts_at.startsWith(date))
      );
    },

    createSlot({ labName, startsAt, capacity }, now = new Date().toISOString()) {
      const normalizedName = typeof labName === 'string' ? labName.trim() : '';
      const starts = typeof startsAt === 'string' ? new Date(startsAt) : null;
      if (!Number.isSafeInteger(capacity) || capacity < 1) {
        return { success: false, error: 'INVALID_CAPACITY' };
      }
      if (!normalizedName || normalizedName.length > 100
        || !starts || Number.isNaN(starts.getTime()) || starts.toISOString() !== startsAt
        || startsAt <= now) {
        return { success: false, error: 'INVALID_SLOT' };
      }
      try {
        return { success: true, slot: labSlots.create(normalizedName, startsAt, capacity) };
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return { success: false, error: 'DUPLICATE_SLOT' };
        }
        throw error;
      }
    },

    bookSlot(userId, slotId, now = new Date().toISOString()) {
      try {
        return bookSlotTransaction(userId, slotId, now);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return { success: false, error: 'ALREADY_BOOKED' };
        }
        throw error;
      }
    },

    cancelBooking(userId, bookingId, now = new Date().toISOString()) {
      return cancelBookingTransaction(userId, bookingId, now);
    },

    listMyBookings(userId) {
      return bookings.listForUser(userId);
    }
  };
}

module.exports = { createLabService };

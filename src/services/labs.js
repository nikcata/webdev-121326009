function createLabService(db, labSlots, bookings) {
  return {
    bookSlot(userId, slotId, now = new Date().toISOString()) {
      return db.transaction(() => {
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

        bookings.create(userId, slotId);
        labSlots.incrementReservedSeats(slotId);

        return { success: true, labName: slot.lab_name, startsAt: slot.starts_at };
      })();
    },

    cancelBooking(userId, bookingId, now = new Date().toISOString()) {
      return db.transaction(() => {
        const booking = bookings.findById(bookingId);
        if (!booking) {
          return { success: false, error: 'NOT_FOUND' };
        }

        if (booking.user_id !== userId) {
          return { success: false, error: 'FORBIDDEN' };
        }

        if (booking.status === 'cancelled') {
          return { success: true }; // Idempotent
        }

        const slot = labSlots.findById(booking.slot_id);
        if (slot.starts_at <= now) {
          return { success: false, error: 'PAST_SLOT' };
        }

        bookings.cancel(bookingId);
        labSlots.decrementReservedSeats(booking.slot_id);

        return { success: true };
      })();
    },

    listMyBookings(userId) {
      return bookings.listForUser(userId);
    }
  };
}

module.exports = { createLabService };

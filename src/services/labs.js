function createLabService(db, labSlots, bookings) {
  if (db.engine === 'postgres') {
    return {
      async listLabs() {
        return labSlots.listLabs();
      },
      async createLab({ name }) {
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        if (!normalizedName || normalizedName.length > 100) {
          return { success: false, error: 'INVALID_LAB_NAME' };
        }
        try {
          return { success: true, lab: await labSlots.createLab(normalizedName) };
        } catch (error) {
          if (error.code === '23505') {
            return { success: false, error: 'DUPLICATE_LAB' };
          }
          throw error;
        }
      },
      async listAvailableSlots({ labName, date } = {}, now = new Date().toISOString()) {
        const slots = await labSlots.listUpcoming(now);
        return slots.filter((slot) =>
          (!labName || slot.lab_name.toLowerCase() === labName.toLowerCase())
          && (!date || slot.starts_at.startsWith(date))
        );
      },
      async createSlot({ labId, startsAt, capacity }, now = new Date().toISOString()) {
        const starts = typeof startsAt === 'string' ? new Date(startsAt) : null;
        if (!Number.isSafeInteger(capacity) || capacity < 1) {
          return { success: false, error: 'INVALID_CAPACITY' };
        }
        if (!Number.isSafeInteger(labId) || labId < 1
          || !starts || Number.isNaN(starts.getTime()) || starts.toISOString() !== startsAt
          || startsAt <= now) {
          return { success: false, error: 'INVALID_SLOT' };
        }
        try {
          return await db.withTransaction(async (client) => {
            if (!await labSlots.findLabById(labId, client)) {
              return { success: false, error: 'LAB_NOT_FOUND' };
            }
            return {
              success: true,
              slot: await labSlots.create(labId, startsAt, capacity, client)
            };
          });
        } catch (error) {
          if (error.code === '23505') {
            return { success: false, error: 'DUPLICATE_SLOT' };
          }
          throw error;
        }
      },
      async bookSlot(userId, slotId, now = new Date().toISOString()) {
        try {
          return await db.withTransaction(async (client) => {
            const slot = await labSlots.findById(slotId, client);
            if (!slot) return { success: false, error: 'NOT_FOUND' };
            if (slot.starts_at <= now) return { success: false, error: 'PAST_SLOT' };
            if (slot.reserved_seats >= slot.capacity) return { success: false, error: 'FULL' };
            if (await bookings.findActive(userId, slotId, client)) {
              return { success: false, error: 'ALREADY_BOOKED' };
            }
            if (!await labSlots.incrementReservedSeats(slotId, client)) {
              return { success: false, error: 'FULL' };
            }
            await bookings.create(userId, slotId, client);
            return { success: true, labName: slot.lab_name, startsAt: slot.starts_at };
          });
        } catch (error) {
          if (error.code === '23505') return { success: false, error: 'ALREADY_BOOKED' };
          throw error;
        }
      },
      async cancelBooking(userId, bookingId, now = new Date().toISOString()) {
        return db.withTransaction(async (client) => {
          const booking = await bookings.findById(bookingId, client);
          if (!booking) return { success: false, error: 'NOT_FOUND' };
          if (booking.user_id !== userId) return { success: false, error: 'FORBIDDEN' };
          if (booking.status === 'cancelled') return { success: true };
          const slot = await labSlots.findById(booking.slot_id, client);
          if (!slot) return { success: false, error: 'NOT_FOUND' };
          if (slot.starts_at <= now) return { success: false, error: 'PAST_SLOT' };
          if (!await bookings.cancel(bookingId, client)) return { success: true };
          if (!await labSlots.decrementReservedSeats(booking.slot_id, client)) {
            throw new Error(`Could not release a seat for booking ${bookingId}.`);
          }
          return { success: true };
        });
      },
      async listMyBookings(userId) {
        return bookings.listForUser(userId);
      }
    };
  }

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
    listLabs() {
      return labSlots.listLabs();
    },

    createLab({ name }) {
      const normalizedName = typeof name === 'string' ? name.trim() : '';
      if (!normalizedName || normalizedName.length > 100) {
        return { success: false, error: 'INVALID_LAB_NAME' };
      }
      try {
        return { success: true, lab: labSlots.createLab(normalizedName) };
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return { success: false, error: 'DUPLICATE_LAB' };
        }
        throw error;
      }
    },

    listAvailableSlots({ labName, date } = {}, now = new Date().toISOString()) {
      return labSlots.listUpcoming(now).filter((slot) =>
        (!labName || slot.lab_name.toLowerCase() === labName.toLowerCase())
        && (!date || slot.starts_at.startsWith(date))
      );
    },

    createSlot({ labId, startsAt, capacity }, now = new Date().toISOString()) {
      const starts = typeof startsAt === 'string' ? new Date(startsAt) : null;
      if (!Number.isSafeInteger(capacity) || capacity < 1) {
        return { success: false, error: 'INVALID_CAPACITY' };
      }
      if (!Number.isSafeInteger(labId) || labId < 1
        || !starts || Number.isNaN(starts.getTime()) || starts.toISOString() !== startsAt
        || startsAt <= now) {
        return { success: false, error: 'INVALID_SLOT' };
      }
      if (!labSlots.findLabById(labId)) {
        return { success: false, error: 'LAB_NOT_FOUND' };
      }
      try {
        return { success: true, slot: labSlots.create(labId, startsAt, capacity) };
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

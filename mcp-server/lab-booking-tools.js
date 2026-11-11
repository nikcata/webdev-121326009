function isValidDate(date) {
  if (date === undefined) return true;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function createLabBookingTools({ authService, labService, sessionToken }) {
  const definitions = [
    {
      name: 'list_lab_slots',
      description: 'Lists future lab slots with available seats, optionally filtered by lab name and date.',
      inputSchema: {
        type: 'object',
        properties: {
          labName: { type: 'string', description: 'Optional exact lab name to filter by.' },
          date: { type: 'string', description: 'Optional date filter in YYYY-MM-DD format.' }
        },
        required: []
      }
    },
    {
      name: 'book_lab_slot',
      description: 'Reserves one available seat for the signed-in student and refuses full or duplicate bookings.',
      inputSchema: {
        type: 'object',
        properties: {
          slotId: { type: 'integer', minimum: 1, description: 'The lab slot identifier to reserve.' }
        },
        required: ['slotId']
      }
    },
    {
      name: 'list_my_bookings',
      description: 'Lists bookings owned by the signed-in student without exposing other students’ bookings.',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'cancel_my_booking',
      description: 'Cancels a future booking owned by the signed-in student and releases its reserved seat.',
      inputSchema: {
        type: 'object',
        properties: {
          bookingId: { type: 'integer', minimum: 1, description: 'The booking identifier to cancel.' }
        },
        required: ['bookingId']
      }
    }
  ];

  function failure(text) {
    return { text, isError: true };
  }

  function authenticatedUser() {
    return authService.getUserForToken(sessionToken);
  }

  function requireUser() {
    const user = authenticatedUser();
    return user ?? null;
  }

  function call(name, args) {
    if (name === 'list_lab_slots') {
      const { labName, date } = args;
      if ((labName !== undefined && (typeof labName !== 'string' || labName.length > 100))
        || !isValidDate(date)) {
        return failure('Provide a lab name up to 100 characters and a valid YYYY-MM-DD date.');
      }
      const slots = labService.listAvailableSlots({ labName, date }).map((slot) => ({
        id: slot.id,
        labName: slot.lab_name,
        startsAt: slot.starts_at,
        availableSeats: slot.available_seats
      }));
      return { text: JSON.stringify({ slots }), isError: false };
    }

    if (name === 'book_lab_slot') {
      if (!Number.isSafeInteger(args.slotId) || args.slotId < 1) {
        return failure('slotId must be a positive integer.');
      }
      const user = requireUser();
      if (!user) return failure('Sign in to book a lab slot.');

      const result = labService.bookSlot(user.id, args.slotId);
      if (!result.success) {
        const messages = {
          NOT_FOUND: 'The requested slot does not exist.',
          PAST_SLOT: 'Cannot book a slot that has already started.',
          FULL: 'No seats remain.',
          ALREADY_BOOKED: 'You already have a booking for this slot.'
        };
        return failure(messages[result.error] ?? 'The booking could not be completed.');
      }
      return {
        text: JSON.stringify({
          message: 'Booking confirmed.',
          labName: result.labName,
          startsAt: result.startsAt
        }),
        isError: false
      };
    }

    if (name === 'list_my_bookings') {
      const user = requireUser();
      if (!user) return failure('Sign in to view your bookings.');
      const bookings = labService.listMyBookings(user.id).map((booking) => ({
        id: booking.id,
        labName: booking.lab_name,
        startsAt: booking.starts_at,
        status: booking.status
      }));
      return { text: JSON.stringify({ bookings }), isError: false };
    }

    if (name === 'cancel_my_booking') {
      if (!Number.isSafeInteger(args.bookingId) || args.bookingId < 1) {
        return failure('bookingId must be a positive integer.');
      }
      const user = requireUser();
      if (!user) return failure('Sign in to cancel a booking.');

      const result = labService.cancelBooking(user.id, args.bookingId);
      if (!result.success) {
        const messages = {
          NOT_FOUND: 'Booking not found.',
          FORBIDDEN: "You cannot cancel another student's booking.",
          PAST_SLOT: 'Cannot cancel a booking for a slot that has already started.'
        };
        return failure(messages[result.error] ?? 'The booking could not be cancelled.');
      }
      return { text: JSON.stringify({ message: 'Booking cancelled.' }), isError: false };
    }

    return null;
  }

  return { definitions, call };
}

module.exports = { createLabBookingTools };

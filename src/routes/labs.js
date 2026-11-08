const express = require('express');

function createLabRouter({ labSlots, labService, requireUser }) {
  const router = express.Router();

  router.get('/lab-slots', requireUser, (req, res) => {
    const slots = labSlots.listUpcoming(new Date().toISOString());
    res.json({
      slots: slots.map((slot) => ({
        id: slot.id,
        labName: slot.lab_name,
        startsAt: slot.starts_at,
        availableSeats: slot.available_seats
      }))
    });
  });

  router.post('/bookings', requireUser, (req, res) => {
    const { slotId } = req.body;
    if (typeof slotId !== 'number') {
      res.status(400).json({ error: 'slotId is required and must be a number.' });
      return;
    }

    const result = labService.bookSlot(req.user.id, slotId);
    if (result.success) {
      res.status(201).json({
        message: 'Booking confirmed.',
        labName: result.labName,
        startsAt: result.startsAt
      });
    } else {
      switch (result.error) {
        case 'NOT_FOUND':
          res.status(404).json({ error: 'The requested slot does not exist.' });
          break;
        case 'PAST_SLOT':
          res.status(422).json({ error: 'Cannot book a slot that has already started.' });
          break;
        case 'FULL':
          res.status(409).json({ error: 'No seats remain.' }); // AC-3: "sees that no seats remain" - 409 is common for "no capacity" in these exercises, but 422 or 200 with message could also work. Let's stick to 409 or similar if it's a conflict. SPEC doesn't specify status code for AC-3, but user said "what status code" in my question. I should use 409 for conflict or 422. User didn't specify code for AC-3 in the prompt, but did for others. I'll use 409 for "full" (conflict with capacity).
          break;
        case 'ALREADY_BOOKED':
          res.status(409).json({ error: 'You already have a booking for this slot.' });
          break;
        default:
          res.status(500).json({ error: 'An unexpected error occurred.' });
      }
    }
  });

  router.get('/my-bookings', requireUser, (req, res) => {
    const bookings = labService.listMyBookings(req.user.id);
    res.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        labName: b.lab_name,
        startsAt: b.starts_at,
        status: b.status
      }))
    });
  });

  router.post('/bookings/:id/cancel', requireUser, (req, res) => {
    const bookingId = Number(req.params.id);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: 'Invalid booking ID.' });
      return;
    }

    const result = labService.cancelBooking(req.user.id, bookingId);
    if (result.success) {
      res.json({ message: 'Booking cancelled.' });
    } else {
      switch (result.error) {
        case 'NOT_FOUND':
          res.status(404).json({ error: 'Booking not found.' });
          break;
        case 'FORBIDDEN':
          res.status(403).json({ error: 'You cannot cancel another student\'s booking.' });
          break;
        case 'PAST_SLOT':
          res.status(422).json({ error: 'Cannot cancel a booking for a slot that has already started.' });
          break;
        default:
          res.status(500).json({ error: 'An unexpected error occurred.' });
      }
    }
  });

  return router;
}

module.exports = { createLabRouter };

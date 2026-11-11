const express = require('express');

function createLabRouter({ labService, summaryService, requireUser, requireManager }) {
  const router = express.Router();

  router.get('/lab-slots', requireUser, (req, res) => {
    const { lab, date } = req.query;
    const parsedDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00.000Z`)
      : null;
    const validDate = date === undefined
      || (parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date);
    if ((lab !== undefined && (typeof lab !== 'string' || lab.length > 100)) || !validDate) {
      res.status(400).json({ error: 'Invalid lab or date filter.' });
      return;
    }

    const slots = labService.listAvailableSlots({ labName: lab, date });
    res.json({
      slots: slots.map((slot) => ({
        id: slot.id,
        labName: slot.lab_name,
        startsAt: slot.starts_at,
        availableSeats: slot.available_seats
      }))
    });
  });

  router.get('/lab-slots/summary', requireUser, async (req, res, next) => {
    try {
      res.json(await summaryService.summarize());
    } catch (error) {
      next(error);
    }
  });

  router.post('/lab-slots', requireUser, requireManager, (req, res) => {
    const result = labService.createSlot(req.body ?? {});
    if (result.success) {
      res.status(201).json({
        slot: {
          id: result.slot.id,
          labName: result.slot.lab_name,
          startsAt: result.slot.starts_at,
          availableSeats: result.slot.available_seats
        }
      });
      return;
    }
    if (result.error === 'DUPLICATE_SLOT') {
      res.status(409).json({ error: 'A slot already exists for that lab and start time.' });
      return;
    }
    res.status(400).json({
      error: result.error === 'INVALID_CAPACITY'
        ? 'Capacity must be a positive whole number.'
        : 'Enter a lab name and a valid future start time.'
    });
  });

  router.post('/bookings', requireUser, (req, res) => {
    const { slotId } = req.body;
    if (!Number.isSafeInteger(slotId) || slotId < 1) {
      res.status(400).json({ error: 'slotId is required and must be a positive integer.' });
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
          res.status(409).json({ error: 'No seats remain.' });
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
    if (!/^[1-9]\d*$/.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid booking ID.' });
      return;
    }
    const bookingId = Number(req.params.id);
    if (!Number.isSafeInteger(bookingId)) {
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

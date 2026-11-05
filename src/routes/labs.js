const express = require('express');

function createLabRouter(labSlots, requireUser) {
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

  return router;
}

module.exports = { createLabRouter };

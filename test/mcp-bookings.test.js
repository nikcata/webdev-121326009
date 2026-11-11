const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/data/database');
const { createUserRepository } = require('../src/data/users');
const { handle } = require('../mcp-server/server');
const { createLabBookingTools } = require('../mcp-server/lab-booking-tools');

function callTool(tools, name, args = {}) {
  return handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args }
  }, tools);
}

test('MCP lab-slot listing calls the shared service and supports filters', () => {
  const { db, services } = createApp({ db: createDatabase(':memory:') });
  try {
    const tools = createLabBookingTools({ ...services });
    const reply = callTool(tools, 'list_lab_slots', {
      labName: 'Computer Lab 1',
      date: '2030-05-01'
    });

    assert.equal(reply.result.isError, false);
    const { slots } = JSON.parse(reply.result.content[0].text);
    assert.equal(slots.length, 2);
    assert.ok(slots.every((slot) => slot.labName === 'Computer Lab 1' && slot.startsAt.startsWith('2030-05-01')));
  } finally {
    db.close();
  }
});

test('MCP booking tools require a valid session and enforce owner authorization through the service', async () => {
  const { db, services } = createApp({ db: createDatabase(':memory:') });
  try {
    const users = createUserRepository(db);
    const passwordHash = await bcrypt.hash('correct horse', 4);
    users.create('owner@example.edu', passwordHash);
    users.create('other@example.edu', passwordHash);
    const owner = await services.authService.login('owner@example.edu', 'correct horse');
    const other = await services.authService.login('other@example.edu', 'correct horse');
    const ownerTools = createLabBookingTools({ ...services, sessionToken: owner.token });
    const otherTools = createLabBookingTools({ ...services, sessionToken: other.token });
    const signedOutTools = createLabBookingTools({ ...services });
    const slot = services.labService.listAvailableSlots()[0];

    assert.equal(callTool(signedOutTools, 'book_lab_slot', { slotId: slot.id }).result.isError, true);

    const booked = callTool(ownerTools, 'book_lab_slot', { slotId: slot.id });
    assert.equal(booked.result.isError, false);
    const bookingId = db.prepare('SELECT id FROM bookings WHERE status = ?').get('active').id;

    const denied = callTool(otherTools, 'cancel_my_booking', { bookingId });
    assert.equal(denied.result.isError, true);
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(bookingId).status, 'active');
    assert.equal(db.prepare('SELECT reserved_seats FROM lab_slots WHERE id = ?').get(slot.id).reserved_seats, 1);

    const owned = callTool(ownerTools, 'list_my_bookings');
    assert.equal(JSON.parse(owned.result.content[0].text).bookings.length, 1);
    const cancelled = callTool(ownerTools, 'cancel_my_booking', { bookingId });
    assert.equal(cancelled.result.isError, false);
    assert.equal(db.prepare('SELECT reserved_seats FROM lab_slots WHERE id = ?').get(slot.id).reserved_seats, 0);
  } finally {
    db.close();
  }
});

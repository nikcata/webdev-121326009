const assert = require('node:assert/strict');
const test = require('node:test');
const { createAvailabilitySummaryService } = require('../src/services/availability-summary');

const slots = [
  { id: 3, lab_name: 'Chemistry Lab', starts_at: '2030-05-01T10:00:00.000Z', available_seats: 5 },
  { id: 4, lab_name: 'Physics Lab', starts_at: '2030-05-02T10:00:00.000Z', available_seats: 2 }
];

function makeService(generateSummary) {
  const warnings = [];
  const service = createAvailabilitySummaryService({
    labService: { listAvailableSlots: () => slots },
    client: { generateSummary },
    logger: { warn: (message) => warnings.push(message) }
  });
  return { service, warnings };
}

test('Gemini availability summary accepts a useful answer with IDs from current slots', async () => {
  let receivedSlots;
  const { service } = makeService(async (input) => {
    receivedSlots = input;
    return { summary: 'Chemistry has the most open seats.', slotIds: [3] };
  });

  const result = await service.summarize();

  assert.equal(result.fallback, false);
  assert.deepEqual(result.slotIds, [3]);
  assert.equal(result.summary, 'Chemistry has the most open seats.');
  assert.deepEqual(receivedSlots, [
    { id: 3, labName: 'Chemistry Lab', startsAt: slots[0].starts_at, availableSeats: 5 },
    { id: 4, labName: 'Physics Lab', startsAt: slots[1].starts_at, availableSeats: 2 }
  ]);
});

test('Gemini availability summary rejects invented slot IDs', async () => {
  const { service, warnings } = makeService(async () => ({
    summary: 'There are many seats.',
    slotIds: [999]
  }));

  assert.deepEqual(await service.summarize(), { summary: null, slotIds: [], fallback: true });
  assert.equal(warnings.length, 1);
});

test('Gemini availability summary falls back when the model gives no answer', async () => {
  let called = false;
  const { service, warnings } = makeService(async () => {
    called = true;
    throw new Error('simulated timeout');
  });

  assert.deepEqual(await service.summarize(), { summary: null, slotIds: [], fallback: true });
  assert.equal(called, true);
  assert.equal(warnings.length, 1);
});

function createAvailabilitySummaryService({ labService, client, logger = console }) {
  function fallback() {
    return { summary: null, slotIds: [], fallback: true };
  }

  return {
    async summarize() {
      const bookableSlots = labService.listAvailableSlots()
        .filter((slot) => slot.available_seats > 0)
        .map(({ id, lab_name, starts_at, available_seats }) => ({
          id,
          labName: lab_name,
          startsAt: starts_at,
          availableSeats: available_seats
        }));
      if (bookableSlots.length === 0) return fallback();

      let generated;
      try {
        generated = await client.generateSummary(bookableSlots);
      } catch {
        logger.warn('Gemini availability summary unavailable; using the regular slot list.');
        return fallback();
      }

      const slotsById = new Map(bookableSlots.map((slot) => [slot.id, slot]));
      const currentBookableIds = new Set(
        labService.listAvailableSlots()
          .filter((slot) => slot.available_seats > 0)
          .map((slot) => slot.id)
      );
      if (!generated || typeof generated.summary !== 'string'
        || generated.summary.trim().length === 0 || generated.summary.length > 500
        || !Array.isArray(generated.slotIds) || generated.slotIds.length === 0
        || !generated.slotIds.every((id) => Number.isSafeInteger(id) && slotsById.has(id))
        || !generated.slotIds.every((id) => currentBookableIds.has(id))
        || new Set(generated.slotIds).size !== generated.slotIds.length) {
        logger.warn('Gemini availability summary failed validation; using the regular slot list.');
        return fallback();
      }

      return {
        summary: generated.summary.trim(),
        slotIds: generated.slotIds,
        fallback: false
      };
    }
  };
}

module.exports = { createAvailabilitySummaryService };

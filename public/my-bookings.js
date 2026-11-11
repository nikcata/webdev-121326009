const bookingsMessage = document.querySelector('#bookings-message');
const bookingsList = document.querySelector('#bookings-list');

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || 'The request could not be completed.');
  return body;
}

async function loadBookings() {
  bookingsMessage.textContent = 'Loading your bookings…';
  bookingsList.replaceChildren();
  try {
    const { bookings } = await request('/api/my-bookings');
    const upcoming = bookings.filter((booking) =>
      booking.status === 'active' && new Date(booking.startsAt) > new Date()
    );
    if (upcoming.length === 0) {
      bookingsMessage.textContent = 'You do not have any bookings yet. Browse lab availability to reserve a seat.';
      return;
    }

    for (const booking of upcoming) {
      const item = document.createElement('li');
      const date = new Date(booking.startsAt);
      const details = document.createElement('span');
      details.textContent = `${booking.labName} — ${date.toLocaleString()} — ${booking.status}`;
      item.append(details);

      if (date > new Date()) {
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel booking';
        cancelButton.addEventListener('click', async () => {
          cancelButton.disabled = true;
          bookingsMessage.textContent = 'Cancelling your booking…';
          try {
            await request(`/api/bookings/${booking.id}/cancel`, { method: 'POST', body: '{}' });
            await loadBookings();
          } catch (error) {
            bookingsMessage.textContent = error.message;
            cancelButton.disabled = false;
          }
        });
        item.append(cancelButton);
      }

      bookingsList.append(item);
    }
    bookingsMessage.textContent = '';
  } catch (error) {
    bookingsMessage.textContent = error.message;
  }
}

loadBookings();

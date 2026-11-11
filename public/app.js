const authPanel = document.querySelector('#auth-panel');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const authTitle = document.querySelector('#auth-title');
const authDescription = document.querySelector('#auth-description');
const submitAuth = document.querySelector('#submit-auth');
const toggleAuth = document.querySelector('#toggle-auth');
const availability = document.querySelector('#availability');
const slotList = document.querySelector('#slot-list');
const listMessage = document.querySelector('#list-message');
const accountNav = document.querySelector('#account-nav');
const summaryButton = document.querySelector('#summary-button');
const summaryMessage = document.querySelector('#summary-message');
const managerPanel = document.querySelector('#manager-panel');
const managerForm = document.querySelector('#manager-form');
const managerMessage = document.querySelector('#manager-message');
const createSlotButton = document.querySelector('#create-slot-button');
const googleStatus = new URLSearchParams(window.location.search).get('google');

let registering = false;

function setAuthMode(isRegistering) {
  registering = isRegistering;
  authTitle.textContent = registering ? 'Create your account' : 'Sign in to book a lab';
  authDescription.textContent = registering
    ? 'Use your university email to get started.'
    : 'Sign in to view lab availability.';
  submitAuth.textContent = registering ? 'Create account' : 'Sign in';
  toggleAuth.textContent = registering ? 'I already have an account' : 'Create an account';
  document.querySelector('#password').autocomplete = registering ? 'new-password' : 'current-password';
  authMessage.textContent = '';
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || 'The request could not be completed.');
  return body;
}

function showSignedIn(user, isManager = false) {
  authPanel.hidden = true;
  availability.hidden = false;
  document.querySelector('.google-button').hidden = true;
  managerPanel.hidden = !isManager;
  accountNav.replaceChildren();

  const identity = document.createElement('span');
  identity.textContent = user.email;
  const bookingsLink = document.createElement('a');
  bookingsLink.href = '/my-bookings';
  bookingsLink.textContent = 'My bookings';
  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.textContent = 'Sign out';
  logoutButton.addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    } catch (error) {
      listMessage.textContent = error.message;
    }
  });

  const linkGoogle = document.createElement('a');
  linkGoogle.href = '/api/auth/google/link/start';
  linkGoogle.textContent = 'Link Google';
  accountNav.append(identity, bookingsLink, linkGoogle, logoutButton);
  loadSlots().then((loaded) => {
    if (!loaded) return;
    if (googleStatus === 'linked') listMessage.textContent = 'Google sign-in linked to your account.';
    if (googleStatus === 'signed-in') listMessage.textContent = 'Signed in with Google.';
  });
}

async function loadSlots() {
  listMessage.textContent = 'Loading lab availability…';
  try {
    const { slots } = await request('/api/lab-slots');
    slotList.replaceChildren();
    if (slots.length === 0) {
      listMessage.textContent = 'There are no upcoming lab slots.';
      return true;
    }
    for (const slot of slots) {
      const item = document.createElement('li');
      const date = new Date(slot.startsAt);
      const details = document.createElement('span');
      details.textContent = `${slot.labName} — ${date.toLocaleString()} — ${slot.availableSeats} seats`;
      const bookButton = document.createElement('button');
      bookButton.type = 'button';
      bookButton.textContent = 'Reserve a seat';
      bookButton.disabled = slot.availableSeats < 1;
      bookButton.addEventListener('click', async () => {
        bookButton.disabled = true;
        listMessage.textContent = 'Reserving your seat…';
        try {
          const booking = await request('/api/bookings', {
            method: 'POST',
            body: JSON.stringify({ slotId: slot.id })
          });
          const startsAt = new Date(booking.startsAt).toLocaleString();
          if (await loadSlots()) {
            listMessage.textContent = `Booking confirmed: ${booking.labName} at ${startsAt}.`;
          }
        } catch (error) {
          listMessage.textContent = error.message;
          bookButton.disabled = slot.availableSeats < 1;
        }
      });
      item.append(details, bookButton);
      slotList.append(item);
    }
    if (listMessage.textContent === 'Loading lab availability…') {
      listMessage.textContent = '';
    }
    return true;
  } catch (error) {
    listMessage.textContent = error.message;
    return false;
  }
}

toggleAuth.addEventListener('click', () => setAuthMode(!registering));

summaryButton.addEventListener('click', async () => {
  summaryButton.disabled = true;
  summaryMessage.textContent = 'Preparing an availability summary…';
  try {
    const result = await request('/api/lab-slots/summary');
    summaryMessage.textContent = result.summary
      ? `${result.summary} (Slots: ${result.slotIds.join(', ')})`
      : 'Summary unavailable; the live lab availability list remains below.';
  } catch (error) {
    summaryMessage.textContent = error.message;
  } finally {
    summaryButton.disabled = false;
  }
});

managerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  createSlotButton.disabled = true;
  managerMessage.textContent = 'Creating the lab slot…';
  const values = new FormData(managerForm);
  try {
    const result = await request('/api/lab-slots', {
      method: 'POST',
      body: JSON.stringify({
        labName: values.get('labName'),
        startsAt: new Date(values.get('startsAt')).toISOString(),
        capacity: Number(values.get('capacity'))
      })
    });
    managerMessage.textContent = `Created slot ${result.slot.id} for ${result.slot.labName}.`;
    managerForm.reset();
    await loadSlots();
  } catch (error) {
    managerMessage.textContent = error.message;
  } finally {
    createSlotButton.disabled = false;
  }
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitAuth.disabled = true;
  authMessage.textContent = '';
  const form = new FormData(authForm);
  const endpoint = registering ? '/api/auth/register' : '/api/auth/login';
  try {
    await request(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password')
      })
    });
    const { user, isManager } = await request('/api/me');
    showSignedIn(user, isManager);
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    submitAuth.disabled = false;
  }
});

request('/api/me')
  .then(({ user, isManager }) => showSignedIn(user, isManager))
  .catch(() => {
    authPanel.hidden = false;
    availability.hidden = true;
    document.querySelector('.google-button').hidden = false;
  });

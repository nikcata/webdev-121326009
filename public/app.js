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
const filterForm = document.querySelector('#availability-filters');
const labFilter = document.querySelector('#lab-filter');
const dateFilter = document.querySelector('#date-filter');
const clearFilters = document.querySelector('#clear-filters');
const managerPanel = document.querySelector('#manager-panel');
const managerLabForm = document.querySelector('#manager-lab-form');
const managerLabMessage = document.querySelector('#manager-lab-message');
const managerLabList = document.querySelector('#manager-lab-list');
const addLabButton = document.querySelector('#add-lab-button');
const managerSlotForm = document.querySelector('#manager-slot-form');
const managerSlotMessage = document.querySelector('#manager-slot-message');
const slotLabSelect = document.querySelector('#slot-lab');
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

async function showSignedIn(user, isManager = false) {
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
  const [labsLoaded, slotsLoaded] = await Promise.all([loadLabs(), loadSlots()]);
  if (!labsLoaded) {
    listMessage.textContent = `Could not load laboratory filters: ${managerLabMessage.textContent}`;
  }
  if (!slotsLoaded) return;
  if (labsLoaded && googleStatus === 'linked') listMessage.textContent = 'Google sign-in linked to your account.';
  if (labsLoaded && googleStatus === 'signed-in') listMessage.textContent = 'Signed in with Google.';
}

async function loadLabs() {
  const selectedFilter = labFilter.value;
  const selectedSlotLab = slotLabSelect.value;
  try {
    const { labs } = await request('/api/labs');
    labFilter.replaceChildren(new Option('All laboratories', ''));
    slotLabSelect.replaceChildren(new Option('Select a laboratory', ''));
    managerLabList.replaceChildren();
    for (const lab of labs) {
      const filterOption = new Option(lab.name, lab.name);
      labFilter.append(filterOption);
      slotLabSelect.append(new Option(lab.name, String(lab.id)));
      const item = document.createElement('li');
      item.textContent = lab.name;
      managerLabList.append(item);
    }
    if (labs.some((lab) => lab.name === selectedFilter)) labFilter.value = selectedFilter;
    if (labs.some((lab) => String(lab.id) === selectedSlotLab)) slotLabSelect.value = selectedSlotLab;
    return true;
  } catch (error) {
    managerLabMessage.textContent = error.message;
    return false;
  }
}

function currentFilters() {
  return { lab: labFilter.value, date: dateFilter.value };
}

async function loadSlots(filters = {}) {
  listMessage.textContent = 'Loading lab availability…';
  try {
    const query = new URLSearchParams();
    if (filters.lab) query.set('lab', filters.lab);
    if (filters.date) query.set('date', filters.date);
    const suffix = query.size ? `?${query}` : '';
    const { slots } = await request(`/api/lab-slots${suffix}`);
    slotList.replaceChildren();
    if (slots.length === 0) {
      listMessage.textContent = query.size
        ? 'No upcoming lab slots match these filters.'
        : 'There are no upcoming lab slots.';
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
          if (await loadSlots(currentFilters())) {
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

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadSlots(currentFilters());
});

clearFilters.addEventListener('click', () => {
  filterForm.reset();
  loadSlots();
});

toggleAuth.addEventListener('click', () => setAuthMode(!registering));

summaryButton.addEventListener('click', async () => {
  summaryButton.disabled = true;
  summaryMessage.textContent = 'Preparing an availability summary…';
  try {
    const result = await request('/api/lab-slots/summary');
    summaryMessage.textContent = result.summary
      ? `Availability suggestion: ${result.summary} (Slots: ${result.slotIds.join(', ')})`
      : 'Summary unavailable; the live lab availability list remains below.';
  } catch (error) {
    summaryMessage.textContent = error.message;
  } finally {
    summaryButton.disabled = false;
  }
});

managerLabForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  addLabButton.disabled = true;
  managerLabMessage.textContent = 'Adding the laboratory…';
  const values = new FormData(managerLabForm);
  try {
    const { lab } = await request('/api/labs', {
      method: 'POST',
      body: JSON.stringify({ name: values.get('name') })
    });
    if (!await loadLabs()) {
      managerLabMessage.textContent = `Added ${lab.name}, but could not refresh the lab list: ${managerLabMessage.textContent}`;
      return;
    }
    slotLabSelect.value = String(lab.id);
    managerLabMessage.textContent = `Added laboratory ${lab.name}.`;
    managerLabForm.reset();
  } catch (error) {
    managerLabMessage.textContent = error.message;
  } finally {
    addLabButton.disabled = false;
  }
});

managerSlotForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  createSlotButton.disabled = true;
  managerSlotMessage.textContent = 'Creating the lab slot…';
  const values = new FormData(managerSlotForm);
  try {
    const result = await request('/api/lab-slots', {
      method: 'POST',
      body: JSON.stringify({
        labId: Number(values.get('labId')),
        startsAt: new Date(values.get('startsAt')).toISOString(),
        capacity: Number(values.get('capacity'))
      })
    });
    managerSlotMessage.textContent = `Created slot ${result.slot.id} for ${result.slot.labName}.`;
    managerSlotForm.reset();
    await loadSlots(currentFilters());
  } catch (error) {
    managerSlotMessage.textContent = error.message;
  } finally {
    createSlotButton.disabled = false;
  }
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitAuth.disabled = true;
  authMessage.textContent = registering ? 'Creating your account…' : 'Signing in…';
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

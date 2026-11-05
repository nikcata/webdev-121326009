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

function showSignedIn(user) {
  authPanel.hidden = true;
  availability.hidden = false;
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

  accountNav.append(identity, bookingsLink, logoutButton);
  loadSlots();
}

async function loadSlots() {
  listMessage.textContent = 'Loading lab availability…';
  try {
    const { slots } = await request('/api/lab-slots');
    slotList.replaceChildren();
    if (slots.length === 0) {
      listMessage.textContent = 'There are no upcoming lab slots.';
      return;
    }
    for (const slot of slots) {
      const item = document.createElement('li');
      const date = new Date(slot.startsAt);
      item.textContent = `${slot.labName} — ${date.toLocaleString()} — ${slot.availableSeats} seats`;
      slotList.append(item);
    }
    listMessage.textContent = '';
  } catch (error) {
    listMessage.textContent = error.message;
  }
}

toggleAuth.addEventListener('click', () => setAuthMode(!registering));

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitAuth.disabled = true;
  authMessage.textContent = '';
  const form = new FormData(authForm);
  const endpoint = registering ? '/api/auth/register' : '/api/auth/login';
  try {
    const { user } = await request(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password')
      })
    });
    showSignedIn(user);
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    submitAuth.disabled = false;
  }
});

request('/api/me')
  .then(({ user }) => showSignedIn(user))
  .catch(() => {
    authPanel.hidden = false;
    availability.hidden = true;
  });

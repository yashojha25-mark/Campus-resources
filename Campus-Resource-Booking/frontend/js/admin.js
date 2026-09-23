/**
 * admin.js — Administrator dashboard.
 *
 * SIDEBAR
 *   Dashboard  statistics + recent bookings + availability toggles
 *   Resources  add / edit / delete resources
 *   Bookings   every booking, with status changes
 *   Students   students derived from the bookings list
 *   Settings   session + API info
 *   Logout     clears the session
 *
 * ACCESS CONTROL
 *   This file hides the UI from non-admins (`CampusAPI.requireAuth({ adminOnly: true })`)
 *   but that is *cosmetic only*. The real security layer is the backend:
 *   every write route runs `protect` (valid JWT) then `adminOnly`
 *   (`403` unless role === 'admin'). A student who re-enables the hidden
 *   markup still gets 403 from Express. The UI guard exists so honest users
 *   never see buttons that would only fail.
 *
 * All data comes from the API — nothing on this page is hard-coded.
 *
 * Requires: api.js, ui.js, auth.js (loaded before this file)
 */

(() => {
  'use strict';

  const { CampusAPI, CampusUI } = window;

  const app = document.querySelector('#admin-app');
  const denied = document.querySelector('#admin-denied');

  if (!app || !denied) {
    return;
  }

  const message = document.querySelector('#admin-message');

  /** Last successful GET responses, so views re-render without refetching. */
  const state = {
    resources: [],
    bookings: [],
    view: 'dashboard',
  };

  const say = (text, type = 'info') => CampusUI.setMessage(message, text, type);
  const clearSay = () => CampusUI.clearMessage(message);

  const el = (selector) => document.querySelector(selector);

  const setText = (selector, value) => {
    const node = el(selector);

    if (node) {
      node.textContent = value === undefined || value === null || value === '' ? '—' : value;
    }
  };

  /* ------------------------------------------------------------ access guard */

  /**
   * Frontend role check. Redirects guests to login and non-admins away from
   * this page. NOTE: this is UX, not security — see the file header comment.
   */
  const allowAdmin = () => {
    // requireAuth({ adminOnly }) redirects when the cached user is not an admin.
    if (!CampusAPI.requireAuth({ adminOnly: true })) {
      return false;
    }

    return true;
  };

  const showDenied = (reason) => {
    denied.hidden = false;
    app.hidden = true;
    setText('#admin-denied-reason', reason);
  };

  /* ------------------------------------------------------------- formatting */

  const readBooking = (booking) => {
    const resource =
      booking.resourceId && typeof booking.resourceId === 'object' ? booking.resourceId : null;
    const student =
      booking.studentId && typeof booking.studentId === 'object' ? booking.studentId : null;

    return {
      id: booking._id,
      status: booking.status || 'pending',
      date: booking.date,
      startTime: booking.startTime || '—',
      endTime: booking.endTime || '—',
      resourceName: resource ? resource.name : 'Resource no longer available',
      location: resource ? resource.location : '—',
      resourceId: resource ? resource._id : null,
      studentName: student ? student.name : 'Unknown student',
      studentEmail: student ? student.email : '—',
      studentId: student ? student._id : null,
      createdAt: booking.createdAt,
    };
  };

  const readResource = (resource) => ({
    id: resource._id,
    name: resource.name || '',
    location: resource.location || '',
    capacity: resource.capacity,
    category: resource.category || '',
    description: resource.description || '',
    image: resource.image || '',
    available: Boolean(resource.available),
  });

  const statusPill = (status) =>
    `<span class="status-pill status-pill--${CampusUI.escapeHtml(status)}">${CampusUI.escapeHtml(status)}</span>`;

  /* ---------------------------------------------------------------- loading */

  const showTableLoading = (container, label) => {
    if (container) {
      CampusUI.showLoading(container, label);
    }
  };

  const showTableEmpty = (container, title, hint) => {
    if (container) {
      CampusUI.showEmpty(container, title, hint);
    }
  };

  /* ==================================================== STATISTICS (dashboard) */

  /**
   * Total Resources          resources.length
   * Available Resources      resources.filter(r => r.available).length
   * Total Bookings           bookings.length
   * Active Bookings          live bookings (confirmed/pending, still in future)
   */
  const renderStats = () => {
    const { upcoming, active } = CampusAPI.partitionBookings(state.bookings);

    // "Active" = anything still live, i.e. confirmed/pending and in the future.
    const liveCount = active.length + upcoming.length;
    const availableCount = state.resources.filter((resource) => resource.available).length;

    setText('#stat-total-resources', state.resources.length);
    setText('#stat-available-resources', availableCount);
    setText('#stat-total-bookings', state.bookings.length);
    setText('#stat-active-bookings', liveCount);

    setText('#nav-count-resources', state.resources.length);
    setText('#nav-count-bookings', state.bookings.length);
    setText('#nav-count-students', countStudents());
  };

  /* ------------------------------------------------------------ students view */

  /**
   * The API exposes no /users route, so the student list is derived from the
   * populated studentId on each booking. Only students who have booked appear.
   */
  const collectStudents = () => {
    const map = new Map();

    state.bookings.forEach((booking) => {
      const { studentId, studentName, studentEmail, status } = readBooking(booking);

      if (!studentId) {
        return;
      }

      const entry = map.get(studentId) || {
        id: studentId,
        name: studentName,
        email: studentEmail,
        total: 0,
        active: 0,
        cancelled: 0,
      };

      entry.total += 1;

      if (status === 'cancelled') {
        entry.cancelled += 1;
      } else {
        entry.active += 1;
      }

      map.set(studentId, entry);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const countStudents = () => collectStudents().length;

  const renderStudents = () => {
    const container = el('#admin-students-container');
    const students = collectStudents();

    if (!container) {
      return;
    }

    if (students.length === 0) {
      showTableEmpty(
        container,
        'No students yet',
        'Students appear here once they have made at least one booking.'
      );
      return;
    }

    container.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Email</th>
            <th scope="col">Total bookings</th>
            <th scope="col">Active</th>
            <th scope="col">Cancelled</th>
          </tr>
        </thead>
        <tbody>
          ${students
            .map(
              (student) => `
            <tr>
              <td><strong>${CampusUI.escapeHtml(student.name)}</strong></td>
              <td>${CampusUI.escapeHtml(student.email)}</td>
              <td>${student.total}</td>
              <td>${student.active}</td>
              <td>${student.cancelled}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;
  };

  /* ================================================= RESOURCE MANAGEMENT VIEW */

  /** Builds one table row: name, location, capacity, live toggle, actions. */
  const resourceRow = (resource) => {
    const row = document.createElement('tr');
    row.dataset.resourceId = resource.id;

    row.innerHTML = `
      <td>
        <strong>${CampusUI.escapeHtml(resource.name)}</strong>
        <br /><span class="admin-note">${CampusUI.escapeHtml(resource.category)}</span>
      </td>
      <td>${CampusUI.escapeHtml(resource.location)}</td>
      <td>${CampusUI.escapeHtml(resource.capacity)}</td>
      <td>
        <label class="switch" title="Toggle availability">
          <input type="checkbox" ${resource.available ? 'checked' : ''} aria-label="Available" />
          <span class="switch__track"></span>
        </label>
      </td>
      <td>
        <span class="status-pill status-pill--${resource.available ? 'available' : 'unavailable'}">
          ${resource.available ? 'available' : 'unavailable'}
        </span>
      </td>
      <td>
        <div class="admin-table__actions">
          <button type="button" class="button button--ghost button--small" data-action="edit">
            Edit
          </button>
          <button type="button" class="button button--danger button--small" data-action="delete">
            Delete
          </button>
        </div>
      </td>
    `;

    // Availability toggle -> PUT /api/resources/:id with the full resource.
    row.querySelector('input[type="checkbox"]').addEventListener('change', (event) => {
      handleAvailabilityToggle(resource, event.currentTarget);
    });

    row.querySelector('[data-action="edit"]').addEventListener('click', () => startEdit(resource));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => handleDelete(resource));

    return row;
  };

  const renderResources = () => {
    const container = el('#admin-resources-container');

    if (!container) {
      return;
    }

    const term = (el('#resource-filter')?.value || '').trim().toLowerCase();

    const visible = state.resources.filter((resource) => {
      if (!term) {
        return true;
      }

      return `${resource.name} ${resource.location} ${resource.category}`
        .toLowerCase()
        .includes(term);
    });

    if (state.resources.length === 0) {
      showTableEmpty(
        container,
        'No resources yet',
        'Use the form above to add the first campus resource.'
      );
      return;
    }

    if (visible.length === 0) {
      showTableEmpty(container, 'No matching resources', 'Try a different search term.');
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col">Resource</th>
          <th scope="col">Location</th>
          <th scope="col">Capacity</th>
          <th scope="col">Available</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const body = table.querySelector('tbody');
    visible.forEach((resource) => body.appendChild(resourceRow(resource)));

    container.innerHTML = '';
    container.appendChild(table);

    // Categories already in use become autocomplete suggestions.
    const categories = [...new Set(state.resources.map((r) => r.category).filter(Boolean))].sort();
    const datalist = el('#resource-categories');

    if (datalist) {
      datalist.innerHTML = categories
        .map((category) => `<option value="${CampusUI.escapeHtml(category)}"></option>`)
        .join('');
    }
  };

  /* ------------------------------------------------------- add / edit form */

  const setFormMode = (resource) => {
    const form = el('#resource-form');
    const title = el('#resource-form-title');
    const submit = el('#resource-submit');
    const reset = el('#resource-form-reset');

    if (!form) {
      return;
    }

    if (resource) {
      el('#resource-id').value = resource.id;
      el('#resource-name').value = resource.name;
      el('#resource-location').value = resource.location;
      el('#resource-capacity').value = resource.capacity;
      el('#resource-category').value = resource.category;
      el('#resource-image').value = resource.image;
      el('#resource-description').value = resource.description;
      el('#resource-available').checked = resource.available;

      title.textContent = `Edit Resource: ${resource.name}`;
      submit.textContent = 'Save Changes';
      reset.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      form.reset();
      el('#resource-id').value = '';
      el('#resource-available').checked = true;

      title.textContent = 'Add Resource';
      submit.textContent = 'Add Resource';
      reset.hidden = true;
    }
  };

  const startEdit = (resource) => setFormMode(resource);

  const readResourceForm = () => {
    const id = el('#resource-id')?.value || '';

    return {
      id,
      name: (el('#resource-name')?.value || '').trim(),
      location: (el('#resource-location')?.value || '').trim(),
      capacity: Number(el('#resource-capacity')?.value),
      category: (el('#resource-category')?.value || '').trim(),
      description: (el('#resource-description')?.value || '').trim(),
      image: (el('#resource-image')?.value || '').trim(),
      available: Boolean(el('#resource-available')?.checked),
    };
  };

  /** Client-side mirror of validateResourceInput() in resourceController. */
  const validateResource = (input) => {
    if (!input.name) return 'Name is required.';
    if (!input.location) return 'Location is required.';
    if (!input.capacity || Number.isNaN(input.capacity) || input.capacity <= 0) {
      return 'Capacity must be a positive number.';
    }
    if (!input.category) return 'Category is required.';

    return '';
  };

  const saveResource = async (input) => {
    const { id, ...body } = input;

    if (id) {
      const data = await CampusAPI.updateResource(id, body);
      await refreshResources({ silent: true });
      return data.message || 'Resource updated successfully.';
    }

    const data = await CampusAPI.createResource(body);
    await refreshResources({ silent: true });
    return data.message || 'Resource created successfully.';
  };

  const handleResourceSubmit = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const submit = el('#resource-submit');
    const input = readResourceForm();

    const validationError = validateResource(input);

    if (validationError) {
      say(validationError, 'error');
      return;
    }

    const isEdit = Boolean(input.id);

    CampusUI.setButtonBusy(submit, true, isEdit ? 'Saving…' : 'Adding…');

    try {
      const text = await saveResource(input);
      say(text, 'success');
      setFormMode(null);
      form.reset();
    } catch (error) {
      // 400 validation, 403 not an admin (backend is the real guard), 401 expired
      if (!error.isExpiredSession) {
        say(error.message, 'error');
      }
    } finally {
      CampusUI.setButtonBusy(submit, false);
    }
  };

  /* ---------------------------------------------------- availability toggle */

  const handleAvailabilityToggle = async (resource, checkbox) => {
    checkbox.disabled = true;

    try {
      const data = await CampusAPI.setResourceAvailability(resource, checkbox.checked);

      // Keep the cache in step so a later re-render has the right state.
      state.resources = state.resources.map((item) =>
        item.id === resource.id ? { ...item, available: checkbox.checked } : item
      );

      say(
        `${data.message || 'Resource updated.'} ${resource.name} is now ` +
          `${checkbox.checked ? 'available' : 'unavailable'}.`,
        'success'
      );

      renderStats();
      renderAvailabilityList();
      renderResources();
    } catch (error) {
      checkbox.checked = !checkbox.checked; // roll back the UI
      if (!error.isExpiredSession) {
        say(error.message, 'error');
      }
    } finally {
      checkbox.disabled = false;
    }
  };

  /* ----------------------------------------------------------- delete flow */

  const handleDelete = async (resource) => {
    const confirmed = window.confirm(
      `Delete "${resource.name}"?\n\nThis cannot be undone. Existing bookings for this resource ` +
        'are kept but will show as "Resource no longer available".'
    );

    if (!confirmed) {
      return;
    }

    try {
      const data = await CampusAPI.deleteResource(resource.id);
      say(data.message || 'Resource deleted successfully.', 'success');

      // Editing this resource? Drop back to add mode.
      if (el('#resource-id')?.value === resource.id) {
        setFormMode(null);
      }

      await refreshResources({ silent: true });
    } catch (error) {
      if (!error.isExpiredSession) {
        say(error.message, 'error');
      }
    }
  };

  /* ================================================== BOOKING MANAGEMENT VIEW */

  /** Booking row: student, resource, date/time, editable status. */
  const bookingRow = (booking) => {
    const b = readBooking(booking);
    const row = document.createElement('tr');
    row.dataset.bookingId = b.id;

    row.innerHTML = `
      <td>
        <strong>${CampusUI.escapeHtml(b.studentName)}</strong>
        <br /><span class="admin-note">${CampusUI.escapeHtml(b.studentEmail)}</span>
      </td>
      <td>
        ${CampusUI.escapeHtml(b.resourceName)}
        <br /><span class="admin-note">${CampusUI.escapeHtml(b.location)}</span>
      </td>
      <td>${CampusUI.escapeHtml(CampusAPI.formatDate(b.date))}</td>
      <td>${CampusUI.escapeHtml(b.startTime)} – ${CampusUI.escapeHtml(b.endTime)}</td>
      <td>${statusPill(b.status)}</td>
      <td>
        <label class="visually-hidden" for="status-${b.id}">Status for booking ${b.id}</label>
        <select class="admin-status-select" id="status-${b.id}" data-booking-status>
          ${['pending', 'confirmed', 'cancelled', 'completed']
            .map(
              (status) =>
                `<option value="${status}" ${status === b.status ? 'selected' : ''}>${status}</option>`
            )
            .join('')}
        </select>
      </td>
    `;

    row.querySelector('[data-booking-status]').addEventListener('change', (event) => {
      handleStatusChange(booking, event.currentTarget);
    });

    return row;
  };

  const getFilteredBookings = () => {
    const term = (el('#admin-booking-search')?.value || '').trim().toLowerCase();
    const status = el('#admin-booking-status')?.value || '';

    return state.bookings.filter((booking) => {
      const b = readBooking(booking);
      const haystack = `${b.studentName} ${b.studentEmail} ${b.resourceName} ${b.location}`.toLowerCase();

      const matchesSearch = !term || haystack.includes(term);
      const matchesStatus = !status || b.status === status;

      return matchesSearch && matchesStatus;
    });
  };

  const bookingTable = (bookings, { limit } = {}) => {
    const rows = typeof limit === 'number' ? bookings.slice(0, limit) : bookings;

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col">Student</th>
          <th scope="col">Resource</th>
          <th scope="col">Date</th>
          <th scope="col">Time</th>
          <th scope="col">Status</th>
          <th scope="col">Change status</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const body = table.querySelector('tbody');
    rows.forEach((booking) => body.appendChild(bookingRow(booking)));

    return table;
  };

  const renderBookings = () => {
    const container = el('#admin-bookings-container');

    if (!container) {
      return;
    }

    if (state.bookings.length === 0) {
      showTableEmpty(container, 'No bookings yet', 'Bookings made by students will appear here.');
      return;
    }

    const visible = getFilteredBookings();

    if (visible.length === 0) {
      showTableEmpty(container, 'No matching bookings', 'Try a different search or status filter.');
      return;
    }

    container.innerHTML = '';
    container.appendChild(bookingTable(visible));
  };

  const renderRecentBookings = () => {
    const container = el('#admin-recent-bookings');

    if (!container) {
      return;
    }

    if (state.bookings.length === 0) {
      showTableEmpty(container, 'No bookings yet', 'Nothing has been booked so far.');
      return;
    }

    container.innerHTML = '';
    container.appendChild(bookingTable(state.bookings, { limit: 5 }));
  };

  /* ------------------------------------------------------------- status change */

  /**
   * PUT /api/bookings/:id with a new status.
   * The controller only honours `status` for admins and re-runs the overlap
   * check, so cancelling is a normal (allowed) transition here.
   */
  const handleStatusChange = async (booking, select) => {
    const previous = readBooking(booking).status;
    const next = select.value;

    if (next === previous) {
      return;
    }

    select.disabled = true;

    try {
      const data = await CampusAPI.updateBookingStatus(booking, next);

      state.bookings = state.bookings.map((item) =>
        item._id === booking._id ? { ...item, status: next } : item
      );

      say(data.message || `Booking marked as ${next}.`, 'success');

      // Re-render so pills, counters and filters all agree with the server.
      renderStats();
      renderRecentBookings();
      renderBookings();
      renderStudents();
    } catch (error) {
      select.value = previous; // roll back the dropdown
      if (!error.isExpiredSession) {
        // 400/404/409 (e.g. the slot now clashes), 403 if the token is not admin.
        say(error.message, 'error');
      }
    } finally {
      select.disabled = false;
    }
  };

  /* =================================================== AVAILABILITY (dashboard) */

  const renderAvailabilityList = () => {
    const container = el('#admin-availability-list');

    if (!container) {
      return;
    }

    if (state.resources.length === 0) {
      showTableEmpty(container, 'No resources yet', 'Add a resource to manage its availability.');
      return;
    }

    container.innerHTML = '';

    state.resources.forEach((resource) => {
      const row = document.createElement('div');
      row.className = 'availability-row';
      row.innerHTML = `
        <div>
          <p class="availability-row__name">${CampusUI.escapeHtml(resource.name)}</p>
          <p class="availability-row__meta">
            ${CampusUI.escapeHtml(resource.location)} · ${CampusUI.escapeHtml(resource.capacity)} seats
          </p>
        </div>
        <label class="switch" title="Toggle availability">
          <input type="checkbox" ${resource.available ? 'checked' : ''} aria-label="Available" />
          <span class="switch__track"></span>
        </label>
      `;

      row.querySelector('input[type="checkbox"]').addEventListener('change', (event) => {
        handleAvailabilityToggle(resource, event.currentTarget);
      });

      container.appendChild(row);
    });
  };

  /* ============================================================= VIEW SWITCH */

  const VIEW_META = {
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Overview of campus resources and bookings.',
    },
    resources: {
      title: 'Resources',
      subtitle: 'Add, edit, delete, and toggle the availability of campus resources.',
    },
    bookings: {
      title: 'Bookings',
      subtitle: 'Every booking made by students, with status control.',
    },
    students: {
      title: 'Students',
      subtitle: 'Students who have booked a campus resource.',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Session details and administrator utilities.',
    },
  };

  const showView = (view) => {
    if (!VIEW_META[view]) {
      return;
    }

    state.view = view;

    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== view;
    });

    document.querySelectorAll('.admin-nav__link[data-admin-view]').forEach((link) => {
      const isActive = link.dataset.adminView === view;
      link.classList.toggle('is-active', isActive);

      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    setText('#admin-view-title', VIEW_META[view].title);
    setText('#admin-view-subtitle', VIEW_META[view].subtitle);

    // Views differ wildly in height (Resources is long, Settings is short).
    // Without this, switching while scrolled leaves the new panel's heading
    // hidden behind the sticky navbar — or the window scrolled past the end.
    window.scrollTo({ top: 0, behavior: 'auto' });

    // Views render from cache, so switching is instant and costs no request.
    if (view === 'students') {
      renderStudents();
    } else if (view === 'resources') {
      renderResources();
    } else if (view === 'bookings') {
      renderBookings();
    } else if (view === 'dashboard') {
      renderStats();
      renderRecentBookings();
      renderAvailabilityList();
    }
  };

  /* ============================================================ DATA LOADING */

  const renderSettings = (user) => {
    setText('#admin-user-name', user ? user.name : '');
    setText('#settings-name', user ? user.name : '');
    setText('#settings-email', user ? user.email : '');
    setText('#settings-role', user ? user.role : '');
    setText('#settings-api-base', CampusAPI.baseUrl);
  };

  /** GET /api/resources -> loading -> success / error. */
  const refreshResources = async ({ silent = false } = {}) => {
    const container = el('#admin-resources-container');

    if (!silent) {
      showTableLoading(container, 'Loading resources…');
    }

    try {
      state.resources = (await CampusAPI.getResources()).map(readResource);
      renderResources();
      renderAvailabilityList();
      renderStats();
    } catch (error) {
      if (error.isExpiredSession) {
        return;
      }

      showTableEmpty(
        container,
        'Could not load resources',
        error.isNetworkError
          ? 'Check that the backend is running on http://localhost:5000.'
          : error.message
      );

      if (!silent) {
        say(error.message, 'error');
      }
    } finally {
      CampusUI.hideLoading(container);
    }
  };

  /**
   * GET /api/bookings.
   * For an admin the controller returns every booking, so this one call backs
   * the bookkeeping views: stats, recent list, bookings table and students.
   */
  const refreshBookings = async ({ silent = false } = {}) => {
    const containers = [
      el('#admin-bookings-container'),
      el('#admin-recent-bookings'),
      el('#admin-students-container'),
    ];

    if (!silent) {
      containers.forEach((container) => showTableLoading(container, 'Loading bookings…'));
    }

    try {
      state.bookings = await CampusAPI.getMyBookings();
      renderBookings();
      renderRecentBookings();
      renderStudents();
      renderStats();
    } catch (error) {
      if (error.isExpiredSession) {
        return;
      }

      containers.forEach((container) =>
        showTableEmpty(
          container,
          'Could not load bookings',
          error.isNetworkError
            ? 'Check that the backend is running on http://localhost:5000.'
            : error.message
        )
      );

      if (!silent) {
        say(error.message, 'error');
      }
    } finally {
      containers.forEach((container) => CampusUI.hideLoading(container));
    }
  };

  const loadAll = async ({ silent = false } = {}) => {
    clearSay();
    await Promise.all([refreshResources({ silent }), refreshBookings({ silent })]);
  };

  /* =================================================================== INIT */

  // Frontend gate — cosmetic. The backend's protect + adminOnly is the real
  // security boundary, and every write below would 403 without it.
  if (!allowAdmin()) {
    showDenied('You need to be signed in as an administrator to view this page.');
  } else {
    app.hidden = false;

    renderSettings(CampusAPI.getStoredUser());

    // Sidebar navigation (both the sidebar buttons and in-page shortcuts).
    document.querySelectorAll('[data-admin-view]').forEach((button) => {
      button.addEventListener('click', () => showView(button.dataset.adminView));
    });

    el('#resource-form')?.addEventListener('submit', handleResourceSubmit);
    el('#resource-form-reset')?.addEventListener('click', () => setFormMode(null));
    el('#resource-filter')?.addEventListener('input', renderResources);

    el('#admin-booking-search')?.addEventListener('input', renderBookings);
    el('#admin-booking-status')?.addEventListener('change', renderBookings);

    el('#settings-refresh')?.addEventListener('click', () => loadAll());

    el('#admin-logout')?.addEventListener('click', () => {
      CampusAPI.clearSession();
      window.location.assign('login.html');
    });

    showView('dashboard');
    loadAll();

    // Replace the cached name/role with the server's authoritative copy, and
    // catch a token that expired since the page was opened (api.js redirects).
    CampusAPI.getCurrentUser()
      .then((user) => {
        renderSettings(user);
        CampusUI.renderAuthNav();

        // If the server says this account is not an admin, the writes above
        // would all 403 — so stop pretending the UI is usable.
        if (user.role !== 'admin') {
          showDenied('This account does not have administrator privileges.');
        }
      })
      .catch((error) => {
        if (!error.isExpiredSession) {
          renderSettings(CampusAPI.getStoredUser());
        }
      });
  }
})();

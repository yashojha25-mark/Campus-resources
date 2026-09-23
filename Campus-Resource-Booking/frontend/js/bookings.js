/**
 * bookings.js — create a booking (resource-details page) and
 * manage existing bookings (my-bookings page).
 *
 * All three requests are delegated to api.js:
 *   CampusAPI.createBooking()  -> POST /api/bookings
 *   CampusAPI.getMyBookings()  -> GET  /api/bookings
 *   CampusAPI.cancelBooking()  -> PUT  /api/bookings/:id { status: 'cancelled' }
 *
 * localStorage is no longer the source of truth — MongoDB is.
 *
 * Requires: api.js, ui.js  (loaded before this file)
 */

(() => {
  'use strict';

  const { CampusAPI, CampusUI } = window;

  const bookingMessage = document.querySelector('#booking-message');
  const bookingsContainer = document.querySelector('#bookings-container');
  const bookingSearch = document.querySelector('#booking-search');
  const bookingStatus = document.querySelector('#booking-status');

  /** The full list fetched once, kept in memory so filtering costs no request. */
  let bookingCache = [];

  const showBookingMessage = (message, type = 'info') => {
    CampusUI.setMessage(bookingMessage, message, type);
  };

  /** The ?id= from the details page is the Mongo _id we send as resourceId. */
  const getSelectedResourceId = () =>
    new URLSearchParams(window.location.search).get('id');

  const isPastDate = (dateValue) => {
    const selectedDate = new Date(`${dateValue}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return selectedDate < today;
  };

  /**
   * Client-side validation that mirrors createBooking() in bookingController.
   * It exists to save a round trip, not to replace the server checks.
   */
  const validateBookingForm = ({ resourceId, date, startTime, endTime }) => {
    if (!resourceId) {
      return 'Please choose a valid resource before booking.';
    }

    if (!date) {
      return 'Please select a booking date.';
    }

    if (Number.isNaN(new Date(date).getTime())) {
      return 'Please select a valid booking date.';
    }

    if (isPastDate(date)) {
      return 'Please select today or a future date.';
    }

    if (!startTime || !endTime) {
      return 'Please select both start time and end time.';
    }

    if (startTime >= endTime) {
      return 'Start time must be before end time.';
    }

    return '';
  };

  /* ======================================================== booking modal ==
   *
   * Flow:
   *   open  -> resource summary (image / name / location / capacity)
   *   step1 -> date + times -> [ Check Availability ]
   *            -> GET /api/resources/:id/availability  (same overlap query the
   *               server uses when creating, so the answer is authoritative)
   *   step2 -> available?  [ Confirm Booking ] -> POST /api/bookings
   *   step3 -> receipt with Booking ID / Resource / Date / Time / Status
   *            -> [ View My Bookings ]
   */

  const modal = document.querySelector('#booking-modal');
  const openButton = document.querySelector('#open-booking-modal');

  /** The last resource rendered on the page, so the modal can mirror it. */
  let currentResource = null;

  /** The slot that passed the availability check, held for the confirm step. */
  let checkedSlot = null;

  const modalEl = (selector) => modal?.querySelector(selector) || null;

  const stepSlot = () => modalEl('#booking-step-slot');
  const stepConfirm = () => modalEl('#booking-step-confirm');
  const stepSuccess = () => modalEl('#booking-success');
  const result = () => modalEl('#availability-result');

  const readSlot = () => ({
    resourceId: getSelectedResourceId(),
    date: modalEl('#booking-date')?.value || '',
    startTime: modalEl('#booking-start-time')?.value || '',
    endTime: modalEl('#booking-end-time')?.value || '',
  });

  /** Shows or hides the availability panel in one of its three states. */
  const showAvailability = (state, headline, detail = '') => {
    const box = result();

    if (!box) {
      return;
    }

    box.hidden = false;
    box.className = `availability-result availability-result--${state}`;
    modalEl('#availability-headline').textContent = headline;
    modalEl('#availability-detail').textContent = detail;
  };

  const hideAvailability = () => {
    const box = result();

    if (box) {
      box.hidden = true;
      box.className = 'availability-result';
    }
  };

  /** Paints the resource summary at the top of the dialog. */
  const renderModalResource = (resource) => {
    if (!resource) {
      return;
    }

    const image = modalEl('#modal-resource-image');

    if (image) {
      const usable = /^https?:\/\//i.test(String(resource.image || ''))
        ? String(resource.image).trim()
        : CampusUI.PLACEHOLDER_IMAGE;

      image.src = usable;
      image.alt = resource.name ? `${resource.name} preview` : 'Resource preview';

      // A dead URL should fall back rather than show a broken-image icon.
      image.onerror = () => {
        image.src = CampusUI.PLACEHOLDER_IMAGE;
      };
    }

    modalEl('#modal-resource-name').textContent = resource.name || 'Resource';
    modalEl('#modal-resource-location').textContent = resource.location || '—';
    modalEl('#modal-resource-capacity').textContent =
      resource.capacity === undefined || resource.capacity === null
        ? '—'
        : `${resource.capacity} people`;
  };

  /** Resets the dialog to step 1 (used on open and after a successful booking). */
  const resetModal = ({ keepSlot = false } = {}) => {
    checkedSlot = null;

    const confirmBox = stepConfirm();
    const successBox = stepSuccess();

    if (confirmBox) confirmBox.hidden = true;
    if (successBox) successBox.hidden = true;
    if (stepSlot()) stepSlot().hidden = false;

    hideAvailability();

    if (!keepSlot) {
      ['#booking-date', '#booking-start-time', '#booking-end-time'].forEach((selector) => {
        const input = modalEl(selector);

        if (input) {
          input.value = '';
          input.disabled = false;
        }
      });
    }
  };

  const openModal = () => {
    if (!modal) {
      return;
    }

    resetModal();
    renderModalResource(currentResource);

    // Do not allow a date in the past; the input helps before we validate.
    const dateInput = modalEl('#booking-date');

    if (dateInput) {
      dateInput.min = new Date().toISOString().slice(0, 10);
    }

    modal.showModal();
    document.body.classList.add('modal-open');

    // Focus the first field so keyboard users land inside the dialog.
    window.setTimeout(() => modalEl('#booking-date')?.focus(), 60);
  };

  const closeModal = () => {
    if (!modal) {
      return;
    }

    modal.close();
  };

  /* --------------------------------------------------- step 1: check the slot */

  const handleCheckAvailability = async () => {
    const button = modalEl('#check-availability');
    const slot = readSlot();

    // --- local validation (mirrors the server rules, saves a round trip) ---
    const validationError = validateBookingForm(slot);

    if (validationError) {
      showAvailability('unavailable', 'Check the date and time', validationError);
      return;
    }

    // --- loading ---
    CampusUI.setButtonBusy(button, true, 'Checking…');
    showAvailability('loading', 'Checking availability…', 'Checking for clashes on this slot.');

    try {
      const data = await CampusAPI.checkAvailability(slot);

      if (data.available) {
        // --- available: reveal step 2 ---
        // The ✓ comes from CSS (::before), so the headline stays plain text.
        checkedSlot = slot;
        showAvailability('available', 'Resource is available', data.message || '');

        const summary = modalEl('#booking-confirm-summary');

        if (summary) {
          summary.textContent =
            `${currentResource?.name || 'Resource'} · ` +
            `${CampusAPI.formatDate(slot.date)} · ${slot.startTime} – ${slot.endTime}`;
        }

        if (stepConfirm()) stepConfirm().hidden = false;
      } else {
        // --- unavailable: conflict (or a resource closed for booking) ---
        checkedSlot = null;

        const detail =
          data.reason === 'conflict'
            ? 'Another booking already exists during this time.' +
              (data.conflict
                ? ` (${data.conflict.startTime} – ${data.conflict.endTime} is taken.)`
                : '')
            : data.message || 'Please choose another time.';

        showAvailability('unavailable', 'Resource is unavailable', detail);
      }
    } catch (error) {
      // 400 bad slot, 404 gone, 401 expired (api.js redirects), network
      if (error.isExpiredSession) {
        return;
      }

      showAvailability('unavailable', 'Could not check availability', error.message);
    } finally {
      CampusUI.setButtonBusy(button, false);
    }
  };

  /* ------------------------------------------------------ step 2: confirm */

  const handleConfirm = async () => {
    const button = modalEl('#confirm-booking');
    const slot = checkedSlot || readSlot();

    // --- loading ---
    CampusUI.setButtonBusy(button, true, 'Booking…');

    try {
      // --- fetch -> route -> controller -> MongoDB -> JSON ---
      const data = await CampusAPI.createBooking(slot);
      const booking = data.booking || {};

      // --- success: swap steps 1 & 2 for the receipt (step 3) ---
      if (stepSlot()) stepSlot().hidden = true;
      if (stepConfirm()) stepConfirm().hidden = true;

      hideAvailability();

      const resource =
        booking.resourceId && typeof booking.resourceId === 'object'
          ? booking.resourceId
          : currentResource;

      modalEl('#booking-success-message').textContent =
        data.message || 'Your booking has been created.';
      modalEl('#receipt-id').textContent = booking._id || '—';
      modalEl('#receipt-resource').textContent = resource?.name || currentResource?.name || '—';
      modalEl('#receipt-date').textContent = CampusAPI.formatDate(booking.date || slot.date);
      modalEl('#receipt-time').textContent = CampusAPI.formatTimeRange(booking);
      modalEl('#receipt-status').textContent = booking.status || 'pending';

      if (stepSuccess()) stepSuccess().hidden = false;

      // Move focus to the receipt so screen readers announce the outcome. This
      // also scrolls the receipt into view.
      modalEl('#booking-success')?.focus?.();

      // The dialog keeps its scroll offset across steps, which would leave the
      // receipt rendered with its heading clipped off the top. Run this last:
      // hiding the earlier steps has already changed the scroll height.
      const bodyEl = modalEl('.modal__body');

      if (bodyEl) {
        bodyEl.scrollTop = 0;
      }

      // The page behind the dialog should not still offer the same slot state.
      showBookingMessage(
        `${data.message || 'Booking created.'} ${CampusAPI.formatDate(booking.date)}.`,
        'success'
      );
    } catch (error) {
      // A 409 here means someone took the slot between checking and confirming.
      if (error.isExpiredSession) {
        return;
      }

      if (error.status === 409) {
        checkedSlot = null;
        if (stepConfirm()) stepConfirm().hidden = true;
        showAvailability(
          'unavailable',
          'Resource is unavailable',
          'Another booking already exists during this time. Please pick another slot.'
        );
      } else {
        showBookingMessage(error.message, 'error');
      }
    } finally {
      CampusUI.setButtonBusy(button, false);
    }
  };

  if (modal && openButton) {
    openButton.addEventListener('click', openModal);

    modalEl('#booking-modal-close')?.addEventListener('click', closeModal);
    modalEl('#check-availability')?.addEventListener('click', handleCheckAvailability);
    modalEl('#confirm-booking')?.addEventListener('click', handleConfirm);
    modalEl('#booking-done')?.addEventListener('click', closeModal);

    // "Change time" goes back to step 1 without losing what was typed.
    modalEl('#booking-back')?.addEventListener('click', () => {
      checkedSlot = null;
      hideAvailability();
      if (stepConfirm()) stepConfirm().hidden = true;
    });

    // Editing the slot invalidates the previous check.
    ['#booking-date', '#booking-start-time', '#booking-end-time'].forEach((selector) => {
      modalEl(selector)?.addEventListener('input', () => {
        checkedSlot = null;
        hideAvailability();
        if (stepConfirm()) stepConfirm().hidden = true;
      });
    });

    // Clicking the backdrop closes the dialog (a native <dialog> keeps the
    // backdrop click on the dialog element itself).
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });

    // Esc closed natively - keep <body> in step for the scroll lock.
    modal.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      openButton.focus();
    });

    // The modal mirrors whatever resource resources.js last painted.
    document.addEventListener('campus:resource-loaded', (event) => {
      currentResource = event.detail;
      renderModalResource(currentResource);
    });
  }

  /* --------------------------------------------------- list my bookings */

  /** Normalises a populated booking document into flat display fields. */
  const readBooking = (booking) => {
    // The backend populates resourceId/studentId; older documents may not be.
    const resource = booking.resourceId && typeof booking.resourceId === 'object' ? booking.resourceId : null;
    const student = booking.studentId && typeof booking.studentId === 'object' ? booking.studentId : null;

    return {
      id: booking._id,
      status: booking.status || 'pending',
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      resourceName: resource ? resource.name : 'Resource no longer available',
      location: resource ? resource.location : '—',
      category: resource ? resource.category : '',
      studentName: student ? student.name : '',
    };
  };

  const createBookingCard = (rawBooking, { showStudent = false } = {}) => {
    const booking = readBooking(rawBooking);
    const card = document.createElement('article');
    card.className = 'resource-card booking-card';
    card.dataset.bookingId = booking.id;

    card.innerHTML = `
    <div class="resource-card__body">
      <p class="resource-card__category resource-card__category--${CampusUI.escapeHtml(booking.status)}">
        ${CampusUI.escapeHtml(booking.status)}
      </p>
      <h3>${CampusUI.escapeHtml(booking.resourceName)}</h3>
      <p class="resource-card__location">${CampusUI.escapeHtml(booking.location)}</p>
      <dl class="resource-card__meta">
        <div>
          <dt>Date</dt>
          <dd>${CampusUI.escapeHtml(CampusAPI.formatDate(booking.date))}</dd>
        </div>
        <div>
          <dt>Start time</dt>
          <dd>${CampusUI.escapeHtml(booking.startTime)}</dd>
        </div>
        <div>
          <dt>End time</dt>
          <dd>${CampusUI.escapeHtml(booking.endTime)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>${CampusUI.escapeHtml(booking.status)}</dd>
        </div>
        ${showStudent && booking.studentName ? `<div><dt>Student</dt><dd>${CampusUI.escapeHtml(booking.studentName)}</dd></div>` : ''}
      </dl>
      <div class="booking-card__actions"></div>
    </div>
  `;

    // Cancelling goes through PUT /api/bookings/:id, only for live bookings.
    const actions = card.querySelector('.booking-card__actions');

    if (CampusAPI.isCancellable(rawBooking) && actions) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'button button--danger';
      cancelButton.textContent = 'Cancel booking';
      cancelButton.addEventListener('click', () => handleCancel(rawBooking._id, card, cancelButton));
      actions.appendChild(cancelButton);
    } else if (actions) {
      actions.innerHTML = '<p class="booking-card__note">This booking is cancelled.</p>';
    }

    return card;
  };

  /** Applies the in-memory search + status filter to the cached list. */
  const getFilteredBookings = () => {
    const searchTerm = bookingSearch?.value.trim().toLowerCase() || '';
    const status = bookingStatus?.value || '';

    return bookingCache.filter((booking) => {
      const resource =
        booking.resourceId && typeof booking.resourceId === 'object' ? booking.resourceId : null;
      const haystack = `${resource ? resource.name : ''} ${resource ? resource.location : ''}`.toLowerCase();

      const matchesSearch = haystack.includes(searchTerm);
      const matchesStatus = !status || (booking.status || 'pending') === status;

      return matchesSearch && matchesStatus;
    });
  };

  const renderBookings = (bookings, options) => {
    bookingsContainer.innerHTML = '';

    // --- empty result ---
    if (bookings.length === 0) {
      // Distinguish "you have none" from "the filter matched none".
      if (bookingCache.length === 0) {
        CampusUI.showEmpty(
          bookingsContainer,
          'No bookings yet',
          'Browse the resources page and book your first campus space.'
        );
        CampusUI.clearMessage(document.querySelector('#bookings-message'));
      } else {
        CampusUI.showEmpty(
          bookingsContainer,
          'No matching bookings',
          'Try a different search term or clear the status filter.'
        );
        CampusUI.setMessage(
          document.querySelector('#bookings-message'),
          'No bookings match your filters.',
          'error'
        );
      }

      return;
    }

    // --- success ---
    CampusUI.setMessage(
      document.querySelector('#bookings-message'),
      `${bookings.length} of ${bookingCache.length} bookings shown.`,
      'success'
    );

    bookings.forEach((booking) => {
      bookingsContainer.appendChild(createBookingCard(booking, options));
    });
  };

  const filterBookings = (options) => renderBookings(getFilteredBookings(), options);

  /** GET /api/bookings -> loading -> success / empty / error. */
  const loadBookings = async (options = {}) => {
    CampusUI.showLoading(bookingsContainer, 'Loading your bookings…');

    try {
      const bookings = await CampusAPI.getMyBookings();
      bookingCache = bookings;
      renderBookings(getFilteredBookings(), options);
    } catch (error) {
      if (error.isExpiredSession) {
        return; // api.js already redirected to login
      }

      CampusUI.showEmpty(
        bookingsContainer,
        'Could not load your bookings',
        'Check that the backend is running, then reload the page.'
      );

      const message = document.querySelector('#bookings-message');
      CampusUI.setMessage(message, error.message, 'error');
    } finally {
      CampusUI.hideLoading(bookingsContainer);
    }
  };

  /** PUT /api/bookings/:id with a busy button and optimistic-ish refresh. */
  const handleCancel = async (bookingId, card, button) => {
    const statusSlot = card.querySelector('.resource-card__category');

    // --- loading ---
    CampusUI.setButtonBusy(button, true, 'Cancelling…');

    try {
      const data = await CampusAPI.cancelBooking(bookingId);

      // --- success ---
      const booking = data.booking || {};

      // Keep the cached copy in step, otherwise a later filter change would
      // re-render this booking with its old 'confirmed' status.
      bookingCache = bookingCache.map((item) =>
        item._id === bookingId ? { ...item, status: 'cancelled' } : item
      );

      if (statusSlot) {
        statusSlot.textContent = 'cancelled';
        statusSlot.className = 'resource-card__category resource-card__category--cancelled';
      }

      const actions = card.querySelector('.booking-card__actions');

      if (actions) {
        actions.innerHTML = '<p class="booking-card__note">This booking is cancelled.</p>';
      }

      CampusUI.setMessage(
        document.querySelector('#bookings-message'),
        `${data.message || 'Booking cancelled.'} ` +
          `${CampusAPI.formatTimeRange(booking)}`,
        'success'
      );

      // If a status filter is active the card may no longer belong in the list,
      // so re-apply the filters (no extra request — the cache was updated).
      if (bookingStatus?.value) {
        renderBookings(getFilteredBookings());
      }
    } catch (error) {
      // 404 (not yours / already gone), 400 bad id, 401 expired token
      if (error.isExpiredSession) {
        return;
      }

      // --- error: leave the booking visually untouched ---
      CampusUI.setMessage(document.querySelector('#bookings-message'), error.message, 'error');
      CampusUI.setButtonBusy(button, false);
    }
  };

  /* ------------------------------------------------------------------ init */

  if (bookingsContainer && CampusAPI.requireAuth()) {
    // Filters are client-side: the list is small and the backend has no
    // filter query params, so no extra requests are needed.
    bookingSearch?.addEventListener('input', () => filterBookings());
    bookingStatus?.addEventListener('change', () => filterBookings());

    loadBookings();
  }
})();

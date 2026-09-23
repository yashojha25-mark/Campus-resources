(() => {
  'use strict';

  const { CampusAPI, CampusUI } = window;

  // Nothing to do on any other page.
  const upcomingContainer = document.querySelector('#upcoming-container');
  const activeContainer = document.querySelector('#active-container');
  const historyContainer = document.querySelector('#history-container');

  if (!upcomingContainer || !activeContainer || !historyContainer) {
    return;
  }

  const message = document.querySelector('#dashboard-message');

  /** The page's own DOM hooks, read fresh so nothing is captured too early. */
  const fields = () => ({
    userName: document.querySelector('#dashboard-user-name'),
    summary: document.querySelector('#dashboard-summary'),
    statActive: document.querySelector('#stat-active'),
    statUpcoming: document.querySelector('#stat-upcoming'),
    statHistory: document.querySelector('#stat-history'),
    profileName: document.querySelector('#profile-name'),
    profileEmail: document.querySelector('#profile-email'),
    profileRole: document.querySelector('#profile-role'),
    profileId: document.querySelector('#profile-id'),
  });

  const setField = (element, value) => {
    if (element) {
      element.textContent = value === undefined || value === null || value === '' ? '—' : value;
    }
  };


  const renderProfile = (user) => {
    const f = fields();

    if (!user) {
      return;
    }

    setField(f.userName, user.name ? user.name.split(' ')[0] : '');
    setField(f.profileName, user.name);
    setField(f.profileEmail, user.email);
    setField(f.profileRole, user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '');
    setField(f.profileId, user.id || user._id);
  };

 
  const readBooking = (booking) => {
    const resource =
      booking.resourceId && typeof booking.resourceId === 'object' ? booking.resourceId : null;

    return {
      id: booking._id,
      status: booking.status || 'pending',
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      resourceName: resource ? resource.name : 'Resource no longer available',
      location: resource ? resource.location : '—',
    };
  };

  const STATUS_CLASS = {
    confirmed: 'confirmed',
    pending: 'pending',
    cancelled: 'cancelled',
    completed: 'completed',
  };

  /**
   * Builds one card showing Resource / Location / Date / Start / End / Status.
   * @param {object} rawBooking  the document straight from MongoDB
   * @param {object} options     { cancellable: boolean }
   */
  const createBookingCard = (rawBooking, { cancellable = false } = {}) => {
    const booking = readBooking(rawBooking);
    const statusClass = STATUS_CLASS[booking.status] || 'pending';

    const card = document.createElement('article');
    card.className = 'resource-card booking-card';
    card.dataset.bookingId = booking.id;

    // All values below are database content, so they go through escapeHtml.
    card.innerHTML = `
      <div class="resource-card__body">
        <p class="resource-card__category resource-card__category--${statusClass}">
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
        </dl>
        <div class="booking-card__actions"></div>
      </div>
    `;

    const actions = card.querySelector('.booking-card__actions');

    if (cancellable && CampusAPI.isCancellable(rawBooking) && actions) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'button button--danger';
      cancelButton.textContent = 'Cancel Booking';
      cancelButton.addEventListener('click', () => handleCancel(booking.id, card, cancelButton));
      actions.appendChild(cancelButton);
    }

    return card;
  };

  /* ------------------------------------------------------------ sections */

  /**
   * Renders one section: its cards, or an empty-state when the group has none.
   * @param {HTMLElement} container
   * @param {Array} bookings
   * @param {object} options  { cancellable, emptyTitle, emptyHint }
   */
  const renderSection = (container, bookings, options = {}) => {
    container.innerHTML = '';

    if (bookings.length === 0) {
      CampusUI.showEmpty(container, options.emptyTitle || 'Nothing here', options.emptyHint || '');
      return;
    }

    bookings.forEach((booking) => {
      container.appendChild(
        createBookingCard(booking, { cancellable: Boolean(options.cancellable) })
      );
    });
  };

  /** Paints all three sections + the counters from one bookings array. */
  const renderDashboard = (bookings) => {
    const { upcoming, active, history } = CampusAPI.partitionBookings(bookings);
    const f = fields();

    setField(f.statUpcoming, upcoming.length);
    setField(f.statActive, active.length);
    setField(f.statHistory, history.length);

    renderSection(upcomingContainer, upcoming, {
      emptyTitle: 'No upcoming bookings',
      emptyHint: 'Use the Quick Booking button above to reserve a campus space.',
    });

    // Active = confirmed and still in the future, so cancelling is meaningful.
    renderSection(activeContainer, active, {
      cancellable: true,
      emptyTitle: 'No active bookings',
      emptyHint: 'Confirmed bookings you can still cancel will appear here.',
    });

    renderSection(historyContainer, history, {
      emptyTitle: 'No booking history',
      emptyHint: 'Past, completed, and cancelled bookings will be listed here.',
    });

    // A welcoming one-line summary of what the student is looking at.
    const total = bookings.length;
    setField(
      f.summary,
      total === 0
        ? 'You have no bookings yet. Browse the resources to make your first reservation.'
        : `You have ${total} booking${total === 1 ? '' : 's'}: ` +
        `${active.length} active, ${upcoming.length} upcoming, ${history.length} in history.`
    );
  };

  /* -------------------------------------------------- cancel (active only) */

  /** PUT /api/bookings/:id { status: 'cancelled' } with a busy button. */
  const handleCancel = async (bookingId, card, button) => {
    CampusUI.setButtonBusy(button, true, 'Cancelling…');
    CampusUI.clearMessage(message);

    try {
      const data = await CampusAPI.cancelBooking(bookingId);

      // --- success: update the DOM in place, then move the card to history ---
      CampusUI.setMessage(
        message,
        `${data.message || 'Booking cancelled.'} ${CampusAPI.formatTimeRange(data.booking || {})}`,
        'success'
      );

    
      await loadBookings({ silent: true });
    } catch (error) {
      // 404 (not yours / already gone), 400 (bad id), 401 (expired — api.js redirects)
      if (error.isExpiredSession) {
        return;
      }

      CampusUI.setMessage(message, error.message, 'error');
      CampusUI.setButtonBusy(button, false);
    }
  };

  /* --------------------------------------------------------------- loading */

  const showLoadingState = () => {
    CampusUI.showLoading(upcomingContainer, 'Loading your dashboard…');
    CampusUI.showLoading(activeContainer, 'Loading your dashboard…');
    CampusUI.showLoading(historyContainer, 'Loading your dashboard…');
  };

  /** Paints the same failure message into all three sections at once. */
  const showErrorState = (error) => {
    const isOffline = error.isNetworkError;

    const title = isOffline ? 'Cannot reach the server' : 'Could not load your bookings';
    const hint = isOffline
      ? 'Make sure the backend is running on http://localhost:5000, then reload the page.'
      : error.message;

    [upcomingContainer, activeContainer, historyContainer].forEach((container) => {
      container.innerHTML = '';
      CampusUI.showEmpty(container, title, hint);
    });

    setField(fields().statUpcoming, '—');
    setField(fields().statActive, '—');
    setField(fields().statHistory, '—');
  };

  /**
   * GET /api/bookings -> loading -> success / empty / error.
   * @param {object} options { silent } — silent keeps the page still while a
   *        background refresh runs (used after a cancellation).
   */
  const loadBookings = async ({ silent = false } = {}) => {
    if (!silent) {
      showLoadingState();
      CampusUI.clearMessage(message);
    }

    try {
      const bookings = await CampusAPI.getMyBookings();
      renderDashboard(bookings);
    } catch (error) {
    
      if (error.isExpiredSession) {
        return;
      }

      showErrorState(error);

      if (!silent) {
        CampusUI.setMessage(message, error.message, 'error');
      }
    } finally {
      CampusUI.hideLoading(upcomingContainer);
      CampusUI.hideLoading(activeContainer);
      CampusUI.hideLoading(historyContainer);
    }
  };

  const loadProfile = async () => {
    try {
      const user = await CampusAPI.getCurrentUser();
      renderProfile(user);
      CampusUI.renderAuthNav();
      return true;
    } catch (error) {
      if (error.isExpiredSession) {
        return false;
      }

      // Network/server hiccup: show the cached user rather than nothing.
      renderProfile(CampusAPI.getStoredUser());
      return true;
    }
  };

  
  if (CampusAPI.requireAuth()) {
  
    renderProfile(CampusAPI.getStoredUser());
    loadBookings();

    loadProfile().then((isValid) => {
      if (!isValid) {
        return; // redirect in progress
      }

      const user = CampusAPI.getStoredUser();

      if (user && user.role !== 'student') {
        CampusUI.setMessage(
          message,
          'You are signed in as an administrator. Student bookings are not shown on this dashboard.',
          'info'
        );
      }
    });
  }
})();

(() => {
  'use strict';


  const API_BASE_URL = (window.CAMPUS_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

  const TOKEN_KEY = 'campusToken';
  const USER_KEY = 'campusUser';


  const PUBLIC_PATHS = ['/auth/register', '/auth/login'];

  /* --------------------------------------------------------------- session */

  const getToken = () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      return null; // private mode / storage disabled
    }
  };

  const saveToken = (token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      /* ignore */
    }
  };

  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };

  const saveUser = (user) => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (error) {
      /* ignore */
    }
  };

  const beginSession = (token, user) => {
    if (token) {
      saveToken(token);
    }

    if (user) {
      saveUser(user);
    }
  };

  const clearSession = (reason = '') => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);

      if (reason) {
        localStorage.setItem('campusAuthMessage', reason);
      } else {
        localStorage.removeItem('campusAuthMessage');
      }
    } catch (error) {
      /* ignore */
    }
  };

  const isLoggedIn = () => Boolean(getToken());

  /** Reads and clears the one-shot message left by clearSession(). */
  const consumeAuthMessage = () => {
    try {
      const message = localStorage.getItem('campusAuthMessage');

      if (message) {
        localStorage.removeItem('campusAuthMessage');
      }

      return message;
    } catch (error) {
      return null;
    }
  };

  class ApiError extends Error {
    constructor(message, status = 0, data = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status; // 0 means "network / server unreachable"
      this.data = data;
      this.isNetworkError = status === 0;
      this.isUnauthorized = status === 401;
      this.isForbidden = status === 403;
    }
  }

  const messageForStatus = (status, serverMessage) => {
    if (serverMessage) {
      return serverMessage;
    }

    switch (status) {
      case 400:
        return 'The request was rejected. Please check the details and try again.';
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return 'Your account is not allowed to perform this action.';
      case 404:
        return 'We could not find what you were looking for.';
      case 409:
        return 'That time slot is already taken. Please pick another one.';
      case 500:
        return 'The server ran into a problem. Please try again in a moment.';
      default:
        return `Request failed (error ${status}).`;
    }
  };

  /* ------------------------------------------------------------- redirects */

  /** Sends the user to login.html and remembers where they were heading. */
  const redirectToLogin = (message) => {
    clearSession(message);
    const next = encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search);
    window.location.href = `login.html?next=${next}`;
  };

  /** Wipes the session and returns to login. Used for expired / invalid tokens. */
  const handleExpiredSession = () => {
    clearSession('Your session expired. Please log in again.');
    redirectToLogin('Your session expired. Please log in again.');
  };

  
  const requireAuth = ({ adminOnly = false } = {}) => {
    if (!isLoggedIn()) {
      redirectToLogin('Please log in to continue.');
      return false;
    }

    if (adminOnly) {
      const user = getStoredUser();

      if (user && user.role !== 'admin') {
        redirectToLogin('Administrator access only.');
        return false;
      }
    }

    return true;
  };

  /* --------------------------------------------------------------- request */

  /**
   * The single low-level helper. Everything else in this file is a thin
   * wrapper around it.
   *
   * @returns {Promise<any>} the parsed JSON body of a successful response.
   * @throws  {ApiError} on any non-2xx status or on a network failure.
   */
  const request = async (path, { method = 'GET', body, auth = true, signal } = {}) => {
    const url = `${API_BASE_URL}${path}`;
    const isPublic = PUBLIC_PATHS.includes(path);
    const token = getToken();

    const headers = { Accept: 'application/json' };

    if (body !== undefined) {
      // express.json() on the backend parses exactly this.
      headers['Content-Type'] = 'application/json';
    }

    // Attach "Authorization: Bearer <jwt>" — authMiddleware.js reads this header.
    if (auth && !isPublic && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error; // caller cancelled on purpose — let it fall through
      }

      throw new ApiError(
        'Cannot reach the server. Make sure the backend is running on http://localhost:5000.',
        0
      );
    }

    // 204 No Content, or any empty/HTML body (e.g. a crashed proxy).
    let data = null;
    const text = await response.text();

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        if (response.ok) {
          throw new ApiError('The server sent an unexpected response.', response.status, text);
        }
      }
    }

    if (response.ok) {
      return data ?? {};
    }

    // --- error handling -----------------------------------------------------

    const serverMessage = data && typeof data.message === 'string' ? data.message : '';
    const error = new ApiError(
      messageForStatus(response.status, serverMessage),
      response.status,
      data
    );

    if (response.status === 401 && !isPublic && token) {
      error.isExpiredSession = true;
      handleExpiredSession();
    }

    throw error;
  };

  /* -------------------------------------------------------------- endpoints */

  const toId = (value) => {
  
    const id = value && typeof value === 'object' ? value._id : value;

    if (!id) {
      throw new ApiError('A resource id is required.', 400);
    }

    return encodeURIComponent(String(id));
  };

  
  /**
   * POST /api/auth/register
   * Note: no `role` is accepted. The server forces `student` for public
   * registration, so sending one would be misleading (and ignored).
   */
  const register = ({ name, email, password }) =>
    request('/auth/register', {
      method: 'POST',
      auth: false,
      body: { name, email, password },
    });

  
  const login = async ({ email, password }) => {
    const data = await request('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    });

    if (data.token) {
      beginSession(data.token, data.user);
    }

    return data;
  };

  
  const getCurrentUser = async () => {
    const data = await request('/auth/me');
    saveUser(data.user);
    return data.user;
  };

  
  /**
   * GET /api/resources
   *
   * Optional server-side filters (all combinable, all optional):
   *   search, category, location, minCapacity, maxCapacity, available
   * Unknown/blank values are dropped, so callers can pass a whole form object.
   *
   * Reads still return the full payload: use `getResources()` for just the
   * array, or `getResourcesWithOptions()` when you also need the list of
   * categories/locations to build filter dropdowns from real data.
   */
  const buildResourceQuery = (filters = {}) => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || value === false) {
        return;
      }

      params.set(key, String(value));
    });

    const query = params.toString();

    return query ? `?${query}` : '';
  };

  const getResourcesWithOptions = async (filters = {}) => {
    const data = await request(`/resources${buildResourceQuery(filters)}`);

    return {
      resources: data.resources || [],
      count: typeof data.count === 'number' ? data.count : (data.resources || []).length,
      filtered: Boolean(data.filtered),
      options: data.filterOptions || { categories: [], locations: [] },
    };
  };

  const getResources = async (filters = {}) => {
    const { resources } = await getResourcesWithOptions(filters);
    return resources;
  };

  const getPublicResources = async () => {
    const data = await request('/resources/public', { auth: false });
    return data.resources || [];
  };


  const getResourceById = async (resourceId) => {
    const data = await request(`/resources/${toId(resourceId)}`);
    return data.resource;
  };

  /**
   * GET /api/resources/:id/availability
   *
   * Pre-flight conflict check for the booking modal. The server runs the same
   * overlap query that createBooking() uses, so an "available" answer here is
   * the real answer (the create can still 409 if another student books the
   * slot in the seconds between checking and confirming - that is handled too).
   *
   * A student cannot see other students' bookings, so this endpoint is the
   * only way the UI can know about a clash before submitting.
   *
   * @returns {Promise<{available: boolean, reason: string, message: string, conflict?: object}>}
   */
  const checkAvailability = ({ resourceId, date, startTime, endTime }) => {
    const query = new URLSearchParams({ date, startTime, endTime }).toString();

    return request(`/resources/${toId(resourceId)}/availability?${query}`);
  };

  /* -- admin: resource management (POST/PUT/DELETE are adminOnly server-side) -- */

  /** POST /api/resources -> { message, resource } */
  const createResource = ({ name, location, capacity, category, description, image, available }) =>
    request('/resources', {
      method: 'POST',
      body: { name, location, capacity, category, description, image, available },
    });

  /**
   * PUT /api/resources/:id
   * The controller re-validates every field, so the full resource must be sent
   * — a partial body (e.g. only `available`) is rejected with a 400.
   */
  const updateResource = (resourceId, body) =>
    request(`/resources/${toId(resourceId)}`, { method: 'PUT', body });

  /**
   * Convenience wrapper for the availability toggle.
   * Accepts either a raw API document (`_id`) or a normalised object (`id`),
   * so callers do not have to remember which shape they hold.
   */
  const setResourceAvailability = (resource, available) => {
    const source = resource && typeof resource === 'object' ? resource : {};
    const resourceId = source._id || source.id || resource;

    return updateResource(resourceId, {
      name: source.name,
      location: source.location,
      capacity: source.capacity,
      category: source.category,
      description: source.description || '',
      image: source.image || '',
      available: Boolean(available),
    });
  };

  /** DELETE /api/resources/:id */
  const deleteResource = (resourceId) =>
    request(`/resources/${toId(resourceId)}`, { method: 'DELETE' });


  const createBooking = ({ resourceId, date, startTime, endTime }) =>
    request('/bookings', {
      method: 'POST',
      body: { resourceId, date, startTime, endTime },
    });


  /**
   * GET /api/bookings
   * The controller returns *every* booking when the caller is an admin and only
   * the caller's own when a student, so this single call serves both pages.
   */
  const getMyBookings = async () => {
    const data = await request('/bookings');
    return data.bookings || [];
  };

  /** True when the signed-in user is an administrator. */
  const isAdmin = () => {
    const user = getStoredUser();

    return Boolean(user && user.role === 'admin');
  };

  /**
   * PUT /api/bookings/:id
   * Only an admin may change `status`; the controller ignores it for students
   * (except the cancel shortcut). The full slot is required so the overlap
   * check can run.
   */
  const updateBookingStatus = (booking, status) => {
    const source = booking && typeof booking === 'object' ? booking : {};
    const resourceId =
      source.resourceId && typeof source.resourceId === 'object'
        ? source.resourceId._id
        : source.resourceId;

    // YYYY-MM-DD: the controller parses this into a day range.
    const date = source.date ? new Date(source.date).toISOString().slice(0, 10) : undefined;

    return request(`/bookings/${toId(source._id || booking)}`, {
      method: 'PUT',
      body: {
        resourceId,
        date,
        startTime: source.startTime,
        endTime: source.endTime,
        status,
      },
    });
  };

  /** DELETE /api/bookings/:id (admin may delete any booking). */
  const deleteBooking = (bookingId) =>
    request(`/bookings/${toId(bookingId)}`, { method: 'DELETE' });


  const cancelBooking = (bookingId) =>
    request(`/bookings/${toId(bookingId)}`, {
      method: 'PUT',
      body: { status: 'cancelled' },
    });

  /* --------------------------------------------------------------- helpers */

  const isCancellable = (booking) => booking && booking.status !== 'cancelled';

  /**
   * True when the booking's date+endTime is still in the future.
   * A booking with no usable date is treated as past, so it can never be
   * listed as "upcoming" by accident.
   */
  const isFutureBooking = (booking, now = new Date()) => {
    if (!booking || !booking.date) {
      return false;
    }

    const date = new Date(booking.date);

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const [hours, minutes] = String(booking.endTime || '23:59').split(':').map(Number);

    date.setHours(
      Number.isFinite(hours) ? hours : 23,
      Number.isFinite(minutes) ? minutes : 59,
      0,
      0
    );

    return date.getTime() >= now.getTime();
  };

  /**
   * Splits the bookings returned by GET /api/bookings into the three groups the
   * dashboard shows. 'cancelled'/'completed' are always history, regardless of
   * their date, so a cancelled future booking does not masquerade as upcoming.
   */
  const partitionBookings = (bookings = []) => {
    const now = new Date();

    const upcoming = [];
    const active = [];
    const history = [];

    bookings.forEach((booking) => {
      const status = booking.status || 'pending';
      const isFinished = status === 'cancelled' || status === 'completed';

      if (isFinished || !isFutureBooking(booking, now)) {
        history.push(booking);
        return;
      }

      if (status === 'confirmed') {
        active.push(booking);
      } else {
        upcoming.push(booking);
      }
    });

    const byClosestFirst = (a, b) => new Date(a.date) - new Date(b.date);
    const byNewestFirst = (a, b) => new Date(b.date) - new Date(a.date);

    upcoming.sort(byClosestFirst);
    active.sort(byClosestFirst);
    history.sort(byNewestFirst);

    return { upcoming, active, history };
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /** "09:00 – 11:00", or "—" when the times are missing. */
  const formatTimeRange = (booking) => {
    if (!booking) {
      return '—';
    }

    const start = booking.startTime || '—';
    const end = booking.endTime || '—';

    return `${start} – ${end}`;
  };

  const formatDate = (value) => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const publicApi = {
    // endpoints
    register,
    login,
    getCurrentUser,
    getResources,
    getResourcesWithOptions,
    getPublicResources,
    getResourceById,
    checkAvailability,
    createResource,
    updateResource,
    setResourceAvailability,
    deleteResource,
    createBooking,
    getMyBookings,
    updateBookingStatus,
    deleteBooking,
    cancelBooking,
    isAdmin,
    // session
    getToken,
    getStoredUser,
    isLoggedIn,
    clearSession,
    consumeAuthMessage,
    requireAuth,
    redirectToLogin,
    // errors + helpers
    ApiError,
    isCancellable,
    isFutureBooking,
    partitionBookings,
    formatDate,
    formatDateTime,
    formatTimeRange,
    baseUrl: API_BASE_URL,
  };

  window.CampusAPI = publicApi;
})();

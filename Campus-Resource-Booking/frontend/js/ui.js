/**
 * ui.js — shared DOM helpers used by every page.
 */

(() => {
  'use strict';

  /**
   * Placeholder card image used when a resource has no usable image URL.
   * Inline SVG: it needs no network request and can never 404.
   * Kept here (not in resources.js) so every page can reuse it, and escaped so
   * it is safe to interpolate straight into innerHTML.
   */
  const PLACEHOLDER_IMAGE =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">' +
        '<rect width="900" height="600" fill="#eef1f6"/>' +
        '<text x="450" y="300" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#647084">No image available</text>' +
        '</svg>'
    );

  const setMessage = (element, message, type = 'info') => {
    if (!element) {
      return;
    }

    element.textContent = message || '';
    element.className = `message message--${type}`;
    element.hidden = !message;
  };

  const clearMessage = (element) => setMessage(element, '', 'info');

  const showError = (element, error) => {
    const text =
      error && error.message
        ? error.message
        : 'Something went wrong. Please try again.';
    setMessage(element, text, 'error');
  };

  /* ---------------------------------------------------------------- loading */

  /**
   * Renders a loading placeholder inside a list container.
   * Uses aria-busy so screen readers announce that content is on the way.
   */
  const showLoading = (container, label = 'Loading…') => {
    if (!container) {
      return;
    }

    container.setAttribute('aria-busy', 'true');
    container.innerHTML = `
      <div class="state state--loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <p>${escapeHtml(label)}</p>
      </div>
    `;
  };

  const hideLoading = (container) => {
    if (!container) {
      return;
    }

    container.removeAttribute('aria-busy');

    const placeholder = container.querySelector('.state--loading');

    if (placeholder) {
      placeholder.remove();
    }
  };

  /* ------------------------------------------------------------------ empty */

  const showEmpty = (container, title, hint = '') => {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="state state--empty" role="status">
        <h3>${escapeHtml(title)}</h3>
        ${hint ? `<p>${escapeHtml(hint)}</p>` : ''}
      </div>
    `;
  };

  /* ---------------------------------------------------------------- buttons */

  /** Disables a submit button and shows a working label while a request runs. */
  const setButtonBusy = (button, isBusy, busyLabel = 'Please wait…') => {
    if (!button) {
      return;
    }

    if (isBusy) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent;
      }

      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = busyLabel;
      return;
    }

    button.disabled = false;
    button.removeAttribute('aria-busy');

    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  };

  /* ------------------------------------------------------------------ safety */

  /**
   * Escape anything that came from the API before putting it in innerHTML.
   * Resource names, locations and descriptions are user/database content.
   */
  const escapeHtml = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /* ------------------------------------------------------------------ fields */

  /** Reads a form into a plain object, trimming every value. */
  const formToObject = (form) => {
    const data = Object.fromEntries(new FormData(form).entries());

    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );
  };

  /** Marks a single input as invalid and focuses it. */
  const markInvalid = (input, message) => {
    if (!input) {
      return;
    }

    input.setAttribute('aria-invalid', 'true');
    input.focus();

    if (message) {
      input.setCustomValidity(message);
      input.reportValidity();
    }
  };

  /* ------------------------------------------------------------------ navbar */

  /**
   * Shows the logged-in user's name in the navbar and swaps
   * Login/Register for a Logout button. Runs on every page.
   */
  const renderAuthNav = () => {
    const user = window.CampusAPI?.getStoredUser();
    const loggedIn = window.CampusAPI?.isLoggedIn();
    const navbar = document.querySelector('.navbar');

    if (!navbar) {
      return;
    }

    // There can be several guest links (Resources / Login / Register) and
    // several user links (Dashboard / Resources / Bookings / Logout), so every
    // element in each group is toggled — not just the first one.
    const guestLinks = navbar.querySelectorAll('[data-auth="guest"]');
    const userLinks = navbar.querySelectorAll('[data-auth="user"]');
    const nameSlot = navbar.querySelector('[data-auth-user-name]');

    if (guestLinks.length === 0 || userLinks.length === 0) {
      return;
    }

    guestLinks.forEach((link) => {
      link.hidden = Boolean(loggedIn);
    });

    userLinks.forEach((link) => {
      link.hidden = !loggedIn;
    });

    if (nameSlot) {
      nameSlot.textContent = user ? user.name : '';
    }

    // Admin link only makes sense for admins.
    const adminLink = navbar.querySelector('[data-auth-role="admin"]');

    if (adminLink) {
      adminLink.hidden = !(user && user.role === 'admin');
    }
  };

  /**
   * Greets a user who was bounced to login (expired token, manual logout…),
   * then removes the stored message so it only shows once.
   */
  const renderAuthNotice = () => {
    const message = window.CampusAPI?.consumeAuthMessage();
    const slot = document.querySelector('#auth-notice');

    if (!message || !slot) {
      return;
    }

    setMessage(slot, message, 'error');
  };

  window.CampusUI = {
    PLACEHOLDER_IMAGE: escapeHtml(PLACEHOLDER_IMAGE),
    setMessage,
    clearMessage,
    showError,
    showLoading,
    hideLoading,
    showEmpty,
    setButtonBusy,
    escapeHtml,
    formToObject,
    markInvalid,
    renderAuthNav,
    renderAuthNotice,
  };
})();

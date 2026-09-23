(() => {
  'use strict';

  const { CampusAPI, CampusUI } = window;

  const loginForm = document.querySelector('#login-form');
  const registerForm = document.querySelector('#register-form');
  const authMessage = document.querySelector('#auth-message');

  /** Where to go after a successful login (set by requireAuth). */
  const getNextUrl = () => {
    const next = new URLSearchParams(window.location.search).get('next');

    // Only allow same-folder pages, never an absolute URL (open-redirect guard).
    if (next && !/^[a-z0-9_-]+\.html(\?.*)?$/i.test(next)) {
      return 'resources.html';
    }

    return next || 'resources.html';
  };

  /* ------------------------------------------------------------------ login */

  if (loginForm) {
    // If the user is already logged in, send them straight through.
    if (CampusAPI.isLoggedIn()) {
      window.location.replace(getNextUrl());
      return;
    }

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const values = CampusUI.formToObject(form);

      // --- cheap local validation (no request wasted) ---
      if (!values.email || !values.password) {
        CampusUI.setMessage(authMessage, 'Please enter both email and password.', 'error');
        return;
      }

      // --- loading ---
      CampusUI.setMessage(authMessage, 'Signing you in…', 'loading');
      CampusUI.setButtonBusy(submitButton, true, 'Signing in…');

      try {
        // --- fetch -> route -> controller -> MongoDB -> JSON ---
        const data = await CampusAPI.login({
          email: values.email,
          password: values.password,
        });

        // --- success ---
        CampusUI.setMessage(
          authMessage,
          data.message || 'Login successful. Redirecting…',
          'success'
        );

        window.location.assign(getNextUrl());
      } catch (error) {
        // --- error (400 missing fields, 401 bad credentials, 500 server) ---
        CampusUI.setMessage(authMessage, error.message, 'error');
        CampusAPI.clearSession();
      } finally {
        CampusUI.setButtonBusy(submitButton, false);
      }
    });
  }

  /* --------------------------------------------------------------- register */

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const values = CampusUI.formToObject(form);

      // --- local validation, mirrors the backend rules in authController ---
      if (!values.name || !values.email || !values.password) {
        CampusUI.setMessage(authMessage, 'Name, email, and password are all required.', 'error');
        return;
      }

      if (values.password.length < 8) {
        CampusUI.setMessage(
          authMessage,
          'Please use a password of at least 8 characters.',
          'error'
        );
        return;
      }

      CampusUI.setMessage(authMessage, 'Creating your account…', 'loading');
      CampusUI.setButtonBusy(submitButton, true, 'Creating account…');

      try {
        const data = await CampusAPI.register({
          name: values.name,
          email: values.email,
          password: values.password,
          // No role is sent: public registration always creates a student.
          // The server ignores any role in the body (see authController).
        });

    
        CampusUI.setMessage(
          authMessage,
          `${data.message || 'Account created.'} Redirecting you to login…`,
          'success'
        );

        form.reset();

        window.setTimeout(() => {
          window.location.assign('login.html');
        }, 1200);
      } catch (error) {
        // 400 "User already exists", 400 validation, 500 server error.
        CampusUI.setMessage(authMessage, error.message, 'error');
      } finally {
        CampusUI.setButtonBusy(submitButton, false);
      }
    });
  }

  /* --------------------------------------------------- session bootstrap */

  const refreshCurrentUser = async () => {
    if (!CampusAPI.isLoggedIn()) {
      return;
    }

    try {
      await CampusAPI.getCurrentUser(); // GET /api/auth/me
      CampusUI.renderAuthNav();
    } catch (error) {
      if (error.isExpiredSession) {
        return; // api.js already redirected to login
      }

      // Network hiccup: keep the cached user, don't log the user out.
    }
  };

  // Navbar state + one-shot notice run on every page that loads this file.
  CampusUI.renderAuthNav();
  CampusUI.renderAuthNotice();
  refreshCurrentUser();
})();


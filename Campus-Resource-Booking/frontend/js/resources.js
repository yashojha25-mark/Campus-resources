/**
 * resources.js — resource list page + resource details page.
 *
 * Both pages now read from the API instead of the old hard-coded array:
 *   resources.html       -> CampusAPI.getResources()      -> GET /api/resources
 *   resource-details.html-> CampusAPI.getResourceById(id) -> GET /api/resources/:id
 *
 * Search and category filtering stay on the client: the list is small and the
 * backend has no filter query params.
 *
 * Requires: api.js, ui.js  (loaded before this file)
 */

(() => {
  'use strict';

  const { CampusAPI, CampusUI } = window;

  // Shared with every page — defined once in ui.js so the home page and this
  // page can never disagree about the fallback image.
  const PLACEHOLDER_IMAGE = CampusUI.PLACEHOLDER_IMAGE;

  /** Placeholder for the details page <img> before/without a real image. */
  const setImageFallback = (imageElement) => {
    imageElement.src = PLACEHOLDER_IMAGE;
  };

  const resourcesContainer = document.querySelector('#resources-container');
  const resourceSearch = document.querySelector('#resource-search');
  const resourceCategory = document.querySelector('#resource-category');
  const resourceLocation = document.querySelector('#resource-location');
  const resourceMinCapacity = document.querySelector('#resource-min-capacity');
  const resourceAvailability = document.querySelector('#resource-availability');
  const resourceMessage = document.querySelector('#resource-message');
  const filterClearButton = document.querySelector('#resource-filter-clear');
  const activeFiltersBox = document.querySelector('#resource-active-filters');

  /** The list fetched once from the API, kept in memory for filtering. */
  let resourceCache = [];

  /** Distinct categories/locations reported by the API, for the dropdowns. */
  let filterOptions = { categories: [], locations: [] };

  /**
   * Filtering strategy
   * ------------------
   * GET /api/resources supports search/category/location/minCapacity/available
   * as query params, and this page *can* use them (see CampusAPI.getResources).
   *
   * It deliberately fetches once and filters in memory instead, because:
   *   - the catalogue is small (tens of resources), so the full list is one
   *     request that is already needed to build the dropdown options;
   *   - typing "computer" would otherwise fire a request per keystroke.
   *
   * The server-side params remain the right tool for a large catalogue or a
   * non-browser client; switching this page over is a one-line change to
   * `loadResources()` (pass readFilters() into CampusAPI.getResources).
   */
  const SEARCH_DEBOUNCE_MS = 180;

  /**
   * The API stores only `available: true|false`, while the CSS expects one of
   * available | unavailable | maintenance. We derive it here rather than adding
   * a fake field on the server.
   */
  const getStatus = (resource) => {
    if (!resource.available) {
      return { label: 'Unavailable', className: 'unavailable' };
    }

    return { label: 'Available', className: 'available' };
  };

  const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

  /**
   * Only use `image` when it is a real remote URL. A stored relative path would
   * 404 against whatever host serves the page, so we fall back instead.
   */
  const getImageUrl = (resource) =>
    isHttpUrl(resource.image)
      ? CampusUI.escapeHtml(String(resource.image).trim())
      : CampusUI.PLACEHOLDER_IMAGE;

  const categoryOf = (resource) => resource.category || 'Uncategorised';

  const renderMessage = (element, message, type = 'info') => {
    CampusUI.setMessage(element, message, type);
  };

  const createResourceCard = (resource) => {
    const status = getStatus(resource);
    const card = document.createElement('article');
    card.className = 'resource-card';

    // Every value below comes from MongoDB, so it goes through escapeHtml.
    card.innerHTML = `
    <img src="${getImageUrl(resource)}" alt="${CampusUI.escapeHtml(resource.name)}" />
    <div class="resource-card__body">
      <p class="resource-card__category">${CampusUI.escapeHtml(categoryOf(resource))}</p>
      <h3>${CampusUI.escapeHtml(resource.name)}</h3>
      <p class="resource-card__location">${CampusUI.escapeHtml(resource.location)}</p>
      <dl class="resource-card__meta">
        <div>
          <dt>Capacity</dt>
          <dd>${CampusUI.escapeHtml(resource.capacity)}</dd>
        </div>
      </dl>
      <p class="resource-card__status resource-card__status--${status.className}">
        <span aria-hidden="true"></span>
        ${status.label}
      </p>
      <a class="resource-card__button" href="resource-details.html?id=${encodeURIComponent(resource._id)}">View Details</a>
    </div>
  `;

    return card;
  };

  /** Reads the current filter values out of the form. */
  const readFilters = () => ({
    search: resourceSearch?.value.trim() || '',
    category: resourceCategory?.value || '',
    location: resourceLocation?.value || '',
    minCapacity: resourceMinCapacity?.value || '',
    available: resourceAvailability?.value || '',
  });

  const hasActiveFilters = (filters) =>
    Boolean(
      filters.search ||
        filters.category ||
        filters.location ||
        filters.minCapacity ||
        filters.available
    );

  /**
   * Applies every active filter to the cached list.
   * Mirrors buildResourceQuery() in resourceController so the client and the
   * server agree on what each filter means.
   */
  const getFilteredResources = () => {
    const filters = readFilters();
    const searchTerm = filters.search.toLowerCase();
    const minCapacity = Number(filters.minCapacity);

    return resourceCache.filter((resource) => {
      // Search matches the name (the primary case) plus location/category so a
      // query like "main" still finds something useful.
      const searchableText = `${resource.name} ${resource.location} ${categoryOf(resource)}`.toLowerCase();
      const matchesSearch = !searchTerm || searchableText.includes(searchTerm);

      const matchesCategory =
        !filters.category ||
        categoryOf(resource).toLowerCase() === filters.category.toLowerCase();

      const matchesLocation =
        !filters.location ||
        String(resource.location || '').toLowerCase() === filters.location.toLowerCase();

      const matchesCapacity =
        !filters.minCapacity ||
        Number.isNaN(minCapacity) ||
        Number(resource.capacity) >= minCapacity;

      // "" = any, "true" = available only, "false" = unavailable only.
      const matchesAvailability =
        !filters.available ||
        (filters.available === 'true' && Boolean(resource.available)) ||
        (filters.available === 'false' && !resource.available);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesLocation &&
        matchesCapacity &&
        matchesAvailability
      );
    });
  };

  /** Builds the removable chips for whichever filters are active. */
  const renderActiveFilters = (filters) => {
    if (!activeFiltersBox) {
      return;
    }

    const chips = [];

    if (filters.search) {
      chips.push({ key: 'search', label: `“${filters.search}”`, value: filters.search });
    }

    if (filters.category) {
      chips.push({ key: 'category', label: filters.category, value: filters.category });
    }

    if (filters.location) {
      chips.push({ key: 'location', label: filters.location, value: filters.location });
    }

    if (filters.minCapacity) {
      chips.push({ key: 'minCapacity', label: `Capacity ≥ ${filters.minCapacity}` });
    }

    if (filters.available) {
      chips.push({
        key: 'available',
        label: filters.available === 'true' ? 'Available' : 'Unavailable',
      });
    }

    if (chips.length === 0) {
      activeFiltersBox.hidden = true;
      activeFiltersBox.innerHTML = '';
      return;
    }

    activeFiltersBox.hidden = false;
    activeFiltersBox.innerHTML = `<p class="active-filters__label">Filters:</p>`;

    chips.forEach((chip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      button.dataset.clearFilter = chip.key;
      button.innerHTML = `${CampusUI.escapeHtml(chip.label)}<span class="filter-chip__remove" aria-hidden="true">✕</span>`;
      button.setAttribute('aria-label', `Remove filter ${chip.label}`);
      button.addEventListener('click', () => clearFilter(chip.key));
      activeFiltersBox.appendChild(button);
    });
  };

  const renderResources = (resources) => {
    if (!resourcesContainer) {
      return;
    }

    const filters = readFilters();

    renderActiveFilters(filters);

    if (filterClearButton) {
      filterClearButton.hidden = !hasActiveFilters(filters);
    }

    resourcesContainer.innerHTML = '';

    // --- empty result ---
    if (resources.length === 0) {
      if (resourceCache.length === 0) {
        // Nothing in the database at all.
        CampusUI.showEmpty(
          resourcesContainer,
          'No resources yet',
          'Once an administrator adds campus resources, they will appear here.'
        );
        renderMessage(resourceMessage, '', 'info');
      } else {
        // The catalogue is non-empty but this combination matched nothing.
        CampusUI.showEmpty(
          resourcesContainer,
          'No matching resources',
          'No resource matches all of those filters. Try removing one, or clear them all.'
        );

        // Offer the way out right where the user is looking.
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'filter-reset-inline';
        reset.textContent = 'Clear all filters';
        reset.addEventListener('click', clearAllFilters);
        resourcesContainer.appendChild(reset);

        renderMessage(
          resourceMessage,
          `No resources match your filters (${resourceCache.length} total).`,
          'error'
        );
      }

      return;
    }

    // --- success ---
    const total = resourceCache.length;

    renderMessage(
      resourceMessage,
      hasActiveFilters(filters)
        ? `Showing ${resources.length} of ${total} ${total === 1 ? 'resource' : 'resources'}.`
        : `${total} ${total === 1 ? 'resource' : 'resources'} found.`,
      'success'
    );

    resources.forEach((resource) => {
      resourcesContainer.appendChild(createResourceCard(resource));
    });
  };

  /** Re-renders from the cache - no request, so it is cheap per keystroke. */
  const filterResources = () => renderResources(getFilteredResources());

  let searchTimer;

  /**
   * Debounced re-filter. Typing stays responsive because the DOM is only
   * rebuilt once the user pauses, not on every character.
   */
  const scheduleFilter = () => {
    window.clearTimeout(searchTimer);

    if (resourcesContainer) {
      resourcesContainer.dataset.searching = 'true';
    }

    searchTimer = window.setTimeout(() => {
      if (resourcesContainer) {
        delete resourcesContainer.dataset.searching;
      }

      filterResources();
    }, SEARCH_DEBOUNCE_MS);
  };

  /* ----------------------------------------------------- resetting filters */

  const clearFilter = (key) => {
    const map = {
      search: resourceSearch,
      category: resourceCategory,
      location: resourceLocation,
      minCapacity: resourceMinCapacity,
      available: resourceAvailability,
    };

    const control = map[key];

    if (control) {
      control.value = '';
    }

    filterResources();
  };

  const clearAllFilters = () => {
    if (resourceSearch) resourceSearch.value = '';
    if (resourceCategory) resourceCategory.value = '';
    if (resourceLocation) resourceLocation.value = '';
    if (resourceMinCapacity) resourceMinCapacity.value = '';
    if (resourceAvailability) resourceAvailability.value = '';

    filterResources();

    // Put the caret back where the user was most likely working.
    resourceSearch?.focus();
  };

  /** Fills the Category/Location dropdowns from the API's distinct values. */
  const populateFilterOptions = (options = {}) => {
    const fill = (select, values, allLabel) => {
      if (!select) {
        return;
      }

      const current = select.value;

      select.innerHTML = `<option value="">${allLabel}</option>`;

      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });

      // Keep any selection the user already made (e.g. after a refresh).
      if (current && values.includes(current)) {
        select.value = current;
      }
    };

    fill(resourceCategory, options.categories || [], 'All categories');
    fill(resourceLocation, options.locations || [], 'All locations');
  };

  /** GET /api/resources -> loading -> success / empty / error. */
  const loadResources = async () => {
    if (!resourcesContainer) {
      return;
    }

    // 1) loading
    CampusUI.showLoading(resourcesContainer, 'Loading resources…');
    renderMessage(resourceMessage, '', 'info');

    try {
      // 2) fetch -> route -> controller -> MongoDB -> JSON
      // No filter args: one request returns the whole catalogue *and* the
      // distinct categories/locations used to build the dropdowns below.
      const { resources, options } = await CampusAPI.getResourcesWithOptions();
      resourceCache = resources;
      filterOptions = options;

      populateFilterOptions(filterOptions);

      // 3) DOM update (success or empty is decided inside renderResources)
      renderResources(getFilteredResources());
    } catch (error) {
      resourcesContainer.innerHTML = '';
      CampusUI.showEmpty(
        resourcesContainer,
        'Could not load resources',
        'Check that the backend is running, then reload the page.'
      );
      renderMessage(resourceMessage, error.message, 'error');
    } finally {
      CampusUI.hideLoading(resourcesContainer);
    }
  };

  /* ------------------------------------------------- resource details page */

  const detailsFields = () => ({
    title: document.querySelector('#resource-details-title'),
    location: document.querySelector('#resource-location'),
    image: document.querySelector('#resource-image'),
    category: document.querySelector('#resource-category'),
    capacity: document.querySelector('#resource-capacity'),
    availability: document.querySelector('#resource-availability'),
    description: document.querySelector('#resource-description'),
  });

  /** Fills the details page with a resource returned by the API. */
  const renderResourceDetails = (resource) => {
    const fields = detailsFields();

    if (!fields.title) {
      return;
    }

    const status = getStatus(resource);

    document.title = `${resource.name} | Campus Resource Booking`;
    fields.title.textContent = resource.name;
    fields.location.textContent = resource.location || 'Location not specified';
    fields.image.src = getImageUrl(resource);
    fields.image.alt = resource.name;
    fields.image.hidden = false;

    // A broken/blank image URL should not leave a broken-image icon.
    fields.image.onerror = () => {
      setImageFallback(fields.image);
    };
    fields.category.textContent = categoryOf(resource);
    fields.capacity.textContent = `${resource.capacity} people`;
    fields.availability.textContent = status.label;
    fields.description.textContent = resource.description || 'No description provided for this resource.';

    // The booking modal lives in bookings.js but is about *this* resource, so
    // announce it rather than duplicating the fetch. Keeps the two files
    // independent: neither has to know the other's internals.
    document.dispatchEvent(new CustomEvent('campus:resource-loaded', { detail: resource }));

    // A non-student (or an unavailable room) cannot book: disable the trigger.
    // The modal itself is the booking surface now (see bookings.js).
    const bookButton = document.querySelector('#open-booking-modal');
    const user = CampusAPI.getStoredUser();

    if (bookButton && (user?.role !== 'student' || !resource.available)) {
      bookButton.disabled = true;

      CampusUI.setMessage(
        document.querySelector('#booking-message'),
        !resource.available
          ? 'This resource is not available for booking right now.'
          : 'Only student accounts can create bookings.',
        'error'
      );
    }
  };

  /** Paints the "not found" / error state on the details page. */
  const renderResourceDetailsError = (error) => {
    const fields = detailsFields();

    if (!fields.title) {
      return;
    }

    const notFound = error.status === 404 || error.status === 400;

    fields.title.textContent = notFound ? 'Resource Not Found' : 'Resource Unavailable';
    fields.location.textContent =
      'Please return to the resource list and choose another resource.';
    fields.image.hidden = true;
    fields.category.textContent = '—';
    fields.capacity.textContent = '—';
    fields.availability.textContent = '—';
    fields.description.textContent = error.message;

    const bookButton = document.querySelector('#open-booking-modal');

    if (bookButton) {
      bookButton.disabled = true;
    }

    CampusUI.setMessage(document.querySelector('#booking-message'), error.message, 'error');
  };

  /** GET /api/resources/:id with loading + error handling. */
  const loadResourceDetails = async () => {
    const fields = detailsFields();

    if (!fields.title) {
      return;
    }

    const resourceId = new URLSearchParams(window.location.search).get('id');

    // --- bad URL: no ?id= at all ---
    if (!resourceId) {
      renderResourceDetailsError({
        status: 400,
        message: 'No resource was selected. Open a resource from the resources page.',
      });
      return;
    }

    // --- loading ---
    fields.title.textContent = 'Loading resource…';
    fields.location.textContent = 'Fetching details from the server.';
    fields.image.src = PLACEHOLDER_IMAGE;
    fields.image.hidden = false;
    fields.category.textContent = '…';
    fields.capacity.textContent = '…';
    fields.availability.textContent = '…';
    fields.description.textContent = 'Please wait.';

    try {
      // --- fetch -> route -> controller -> MongoDB -> JSON ---
      const resource = await CampusAPI.getResourceById(resourceId);
      renderResourceDetails(resource);
    } catch (error) {
      // 400 invalid id, 404 not found, 401 expired token (api.js redirects)
      if (!error.isExpiredSession) {
        renderResourceDetailsError(error);
      }
    }
  };

  /* ------------------------------------------------------------------ init */

  if (resourcesContainer) {
    // Search is debounced (it fires per keystroke); the selects are not.
    resourceSearch?.addEventListener('input', scheduleFilter);
    resourceMinCapacity?.addEventListener('input', scheduleFilter);

    resourceCategory?.addEventListener('change', filterResources);
    resourceLocation?.addEventListener('change', filterResources);
    resourceAvailability?.addEventListener('change', filterResources);

    filterClearButton?.addEventListener('click', clearAllFilters);

    // Submitting the form (Enter in the search box) must not reload the page.
    document.querySelector('#resource-filter-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      window.clearTimeout(searchTimer);
      filterResources();
    });

    // Protected page: guests are sent to login before we fetch.
    if (CampusAPI.requireAuth()) {
      loadResources();
    }
  }

  if (document.querySelector('#resource-details-title')) {
    if (CampusAPI.requireAuth()) {
      loadResourceDetails();
    }
  }
})();

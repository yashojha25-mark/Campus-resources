const navToggle = document.querySelector('.navbar__toggle');
const navLinks = document.querySelector('.navbar__links');
const hero = document.querySelector('.hero');
const slides = Array.from(document.querySelectorAll('.hero__slide'));
const indicators = Array.from(document.querySelectorAll('.hero__indicators button'));
const previousButton = document.querySelector('.hero__control--prev');
const nextButton = document.querySelector('.hero__control--next');
const slideInterval = 5000;

let activeSlide = 0;
let slideshowTimer;

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.classList.toggle('is-open', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  navLinks.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      navLinks.classList.remove('is-open');
      navToggle.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

const showSlide = (index) => {
  activeSlide = (index + slides.length) % slides.length;

  slides.forEach((slide, slideIndex) => {
    slide.classList.toggle('is-active', slideIndex === activeSlide);
  });

  indicators.forEach((indicator, indicatorIndex) => {
    const isActive = indicatorIndex === activeSlide;
    indicator.classList.toggle('is-active', isActive);
    indicator.setAttribute('aria-current', isActive ? 'true' : 'false');
  });
};

const showNextSlide = () => {
  showSlide(activeSlide + 1);
};

const showPreviousSlide = () => {
  showSlide(activeSlide - 1);
};

const stopSlideshow = () => {
  clearInterval(slideshowTimer);
};

const startSlideshow = () => {
  stopSlideshow();
  slideshowTimer = setInterval(showNextSlide, slideInterval);
};

if (hero && slides.length > 0) {
  previousButton?.addEventListener('click', () => {
    showPreviousSlide();
    startSlideshow();
  });

  nextButton?.addEventListener('click', () => {
    showNextSlide();
    startSlideshow();
  });

  indicators.forEach((indicator, index) => {
    indicator.addEventListener('click', () => {
      showSlide(index);
      startSlideshow();
    });
  });

  hero.addEventListener('mouseenter', stopSlideshow);
  hero.addEventListener('mouseleave', startSlideshow);

  showSlide(activeSlide);
  startSlideshow();
}

// --- Featured resources ---------------------------------------------------
// The home page cards are fetched from the API (GET /api/resources) instead of
// being hard-coded in the HTML, so they stay in step with the database and can
// never point at an image file that does not exist.
//
// The endpoint requires a token, so a guest simply sees the three most recent
// public (available) resources and an invitation to log in for the rest.
const featuredContainer = document.querySelector('#featured-resources');
const featuredMessage = document.querySelector('#resource-message');
const FEATURED_LIMIT = 3;

const featuredCard = (resource) => {
  const { CampusUI } = window;
  const status = resource.available
    ? { label: 'Available', className: 'available' }
    : { label: 'Unavailable', className: 'unavailable' };

  // Only a real remote URL is usable; anything else falls back to the same
  // inline SVG used on the resources page (no network request, never 404s).
  const image = /^https?:\/\//i.test(String(resource.image || ''))
    ? String(resource.image).trim()
    : CampusUI.PLACEHOLDER_IMAGE;

  const card = document.createElement('article');
  card.className = 'resource-card';

  card.innerHTML = `
    <img src="${CampusUI.escapeHtml(image)}" alt="${CampusUI.escapeHtml(resource.name)}" />
    <div class="resource-card__body">
      <p class="resource-card__category">${CampusUI.escapeHtml(resource.category || 'Uncategorised')}</p>
      <h3>${CampusUI.escapeHtml(resource.name)}</h3>
      <p class="resource-card__location">${CampusUI.escapeHtml(resource.location || 'Location not specified')}</p>
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

const renderFeaturedResources = (resources) => {
  const { CampusUI } = window;

  featuredContainer.innerHTML = '';

  // A brand-new / empty database: keep the section meaningful instead of blank.
  if (resources.length === 0) {
    CampusUI.showEmpty(
      featuredContainer,
      'No resources yet',
      'Once an administrator adds campus resources, they will appear here.'
    );
    return;
  }

  resources.slice(0, FEATURED_LIMIT).forEach((resource) => {
    featuredContainer.appendChild(featuredCard(resource));
  });
};

const loadFeaturedResources = async () => {
  const { CampusAPI, CampusUI } = window;

  if (!featuredContainer) {
    return;
  }

  CampusUI.showLoading(featuredContainer, 'Loading resources…');
  CampusUI.clearMessage(featuredMessage);

  try {
    // Logged in: GET /api/resources. Guest: the public read-only endpoint.
    const resources = CampusAPI.isLoggedIn()
      ? await CampusAPI.getResources()
      : await CampusAPI.getPublicResources();

    renderFeaturedResources(resources);

    if (!CampusAPI.isLoggedIn() && resources.length > 0) {
      CampusUI.setMessage(
        featuredMessage,
        'Showing a few available spaces. Log in to see every campus resource and book one.',
        'info'
      );
    }
  } catch (error) {
    featuredContainer.innerHTML = '';
    CampusUI.showEmpty(
      featuredContainer,
      'Could not load resources',
      'Check that the backend is running, then reload the page.'
    );
    CampusUI.showError(featuredMessage, error);
  } finally {
    CampusUI.hideLoading(featuredContainer);
  }
};

loadFeaturedResources();

// --- Logout ---------------------------------------------------------------
// The Logout button lives in the navbar of every page. It simply drops the
// stored JWT and cached user, then returns to the home page.
document.querySelector('#logout-button')?.addEventListener('click', () => {
  window.CampusAPI?.clearSession();
  window.location.assign('index.html');
});

/**
 * config.js — the ONE place the frontend is told where the backend lives.
 *
 * Loaded before api.js on every page. api.js reads window.CAMPUS_API_BASE_URL
 * and falls back to http://localhost:5000/api when it is not set.
 *
 * DEVELOPMENT (backend running locally)
 *   leave API_BASE_URL as the localhost value below.
 *
 * PRODUCTION (frontend on Netlify, backend on Render)
 *   replace the value with your Render service URL + /api, e.g.
 *     'https://campus-resources-api.onrender.com/api'
 *
 * NOTE: this file contains no secrets. The API URL is public — it is visible in
 * the browser network tab regardless. Secrets live only in the backend .env /
 * Render environment variables.
 */
window.CAMPUS_API_BASE_URL = 'http://localhost:5000/api';

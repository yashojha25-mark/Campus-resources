const express = require('express');

const {
  getResources,
  getPublicResources,
  getResourceById,
  getResourceAvailability,
  createResource,
  updateResource,
  deleteResource,
} = require('../controllers/resourceController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

const router = express.Router();

router.get('/public', getPublicResources);

// Must come before '/:id', otherwise Express would treat "availability" as an id.
router.get('/:id/availability', protect, getResourceAvailability);

router.get('/', protect, getResources);
router.get('/:id', protect, getResourceById);
router.post('/', protect, adminOnly, createResource);
router.put('/:id', protect, adminOnly, updateResource);
router.delete('/:id', protect, adminOnly, deleteResource);

module.exports = router;

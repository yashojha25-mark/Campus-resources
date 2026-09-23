const mongoose = require('mongoose');

const Resource = require('../models/Resource');
const serverError = require('../utils/errorResponse');
const {
  findOverlappingBooking,
  isValidTimeOrder,
  isValidDate,
} = require('./bookingController');

const validateResourceInput = ({ name, location, capacity, category }) => {
  if (!name) {
    return 'Name is required';
  }

  if (!location) {
    return 'Location is required';
  }

  if (capacity === undefined || capacity === null || capacity === '') {
    return 'Capacity is required';
  }

  if (Number(capacity) <= 0 || Number.isNaN(Number(capacity))) {
    return 'Capacity must be a positive number';
  }

  if (!category) {
    return 'Category is required';
  }

  return null;
};

const isValidResourceId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Escapes user input so it cannot be read as a regex (ReDoS / injection). */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a Mongo query from the supported query-string filters.
 *
 * Supported (all optional, all combinable):
 *   ?search=computer        name/location/category, case-insensitive substring
 *   ?category=Computer Labs exact, case-insensitive
 *   ?location=Main Block    exact, case-insensitive
 *   ?minCapacity=20         capacity >= n
 *   ?maxCapacity=50         capacity <= n
 *   ?available=true|false   availability flag
 *
 * Unrecognised or malformed values are ignored rather than rejected, so a stray
 * query string never breaks the page - it just returns the unfiltered list.
 */
const buildResourceQuery = (query = {}) => {
  const filter = {};

  const search = typeof query.search === 'string' ? query.search.trim() : '';

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { location: pattern }, { category: pattern }];
  }

  if (typeof query.category === 'string' && query.category.trim()) {
    filter.category = new RegExp(`^${escapeRegex(query.category.trim())}$`, 'i');
  }

  if (typeof query.location === 'string' && query.location.trim()) {
    filter.location = new RegExp(`^${escapeRegex(query.location.trim())}$`, 'i');
  }

  const minCapacity = Number(query.minCapacity);

  if (query.minCapacity !== undefined && query.minCapacity !== '' && !Number.isNaN(minCapacity)) {
    filter.capacity = { ...(filter.capacity || {}), $gte: minCapacity };
  }

  const maxCapacity = Number(query.maxCapacity);

  if (query.maxCapacity !== undefined && query.maxCapacity !== '' && !Number.isNaN(maxCapacity)) {
    filter.capacity = { ...(filter.capacity || {}), $lte: maxCapacity };
  }

  if (query.available === 'true' || query.available === 'false') {
    filter.available = query.available === 'true';
  }

  return filter;
};

/**
 * GET /api/resources
 *
 * Returns the (optionally filtered) resource list plus the distinct categories
 * and locations that exist in the database, so the filter dropdowns are built
 * from real data instead of a hard-coded list that goes stale.
 */
const getResources = async (req, res) => {
  try {
    const filter = buildResourceQuery(req.query);
    const hasFilter = Object.keys(filter).length > 0;

    const [resources, categories, locations] = await Promise.all([
      Resource.find(filter).sort({ name: 1 }),
      Resource.distinct('category'),
      Resource.distinct('location'),
    ]);

    res.status(200).json({
      resources,
      count: resources.length,
      filtered: hasFilter,
      filterOptions: {
        categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)),
        locations: locations.filter(Boolean).sort((a, b) => a.localeCompare(b)),
        capacityRange: { min: 1, max: null },
      },
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch resources', error);
  }
};

const getPublicResources = async (req, res) => {
  try {
    const resources = await Resource.find({ available: true })
      .select('name location capacity category available image')
      .sort({ name: 1 })
      .limit(6);

    res.status(200).json({ resources });
  } catch (error) {
    return serverError(res, 'Failed to fetch resources', error);
  }
};

const getResourceById = async (req, res) => {
  try {
    if (!isValidResourceId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid resource id' });
    }

    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    res.status(200).json({ resource });
  } catch (error) {
    return serverError(res, 'Failed to fetch resource', error);
  }
};

/**
 * GET /api/resources/:id/availability?date=YYYY-MM-DD&startTime=HH:mm&endTime=HH:mm
 *
 * Pre-flight check for the booking modal. It runs exactly the same overlap
 * query that createBooking() runs, so if this says available the create will
 * succeed (barring a race with another student in the intervening seconds -
 * the create still returns 409 in that case, and the UI handles it).
 */
const getResourceAvailability = async (req, res) => {
  try {
    if (!isValidResourceId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid resource id' });
    }

    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    const { date, startTime, endTime } = req.query;

    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'A valid date is required' });
    }

    if (!isValidTimeOrder(startTime, endTime)) {
      return res
        .status(400)
        .json({ message: 'startTime must be before endTime in HH:mm format' });
    }

    if (!resource.available) {
      return res.status(200).json({
        available: false,
        reason: 'unavailable',
        message: 'This resource is not available for booking right now.',
      });
    }

    const conflict = await findOverlappingBooking({
      resourceId: req.params.id,
      date,
      startTime,
      endTime,
    });

    if (conflict) {
      return res.status(200).json({
        available: false,
        reason: 'conflict',
        message: 'Another booking already exists during this time.',
        conflict: {
          startTime: conflict.startTime,
          endTime: conflict.endTime,
        },
      });
    }

    return res.status(200).json({
      available: true,
      reason: 'available',
      message: 'Resource is available',
    });
  } catch (error) {
    return serverError(res, 'Failed to check availability', error);
  }
};

const createResource = async (req, res) => {
  try {
    const validationError = validateResourceInput(req.body);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const resource = await Resource.create(req.body);

    res.status(201).json({
      message: 'Resource created successfully',
      resource,
    });
  } catch (error) {
    return serverError(res, 'Failed to create resource', error);
  }
};

const updateResource = async (req, res) => {
  try {
    if (!isValidResourceId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid resource id' });
    }

    const validationError = validateResourceInput(req.body);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const resource = await Resource.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    res.status(200).json({
      message: 'Resource updated successfully',
      resource,
    });
  } catch (error) {
    return serverError(res, 'Failed to update resource', error);
  }
};

const deleteResource = async (req, res) => {
  try {
    if (!isValidResourceId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid resource id' });
    }

    const resource = await Resource.findByIdAndDelete(req.params.id);

    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    res.status(200).json({ message: 'Resource deleted successfully' });
  } catch (error) {
    return serverError(res, 'Failed to delete resource', error);
  }
};

module.exports = {
  getResources,
  buildResourceQuery,
  getPublicResources,
  getResourceById,
  getResourceAvailability,
  createResource,
  updateResource,
  deleteResource,
};

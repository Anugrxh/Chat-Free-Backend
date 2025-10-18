// Simple in-memory cache for user data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cacheMiddleware = (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  const key = `${req.user?.userId}-${req.originalUrl}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }

  // Override res.json to cache the response
  const originalJson = res.json;
  res.json = function(data) {
    // Cache successful responses
    if (res.statusCode === 200) {
      cache.set(key, {
        data,
        timestamp: Date.now()
      });
    }
    return originalJson.call(this, data);
  };

  next();
};

// Clear cache for a specific user
const clearUserCache = (userId) => {
  for (const [key] of cache) {
    if (key.startsWith(userId)) {
      cache.delete(key);
    }
  }
};

// Clean up expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, CACHE_TTL);

module.exports = {
  cacheMiddleware,
  clearUserCache
};
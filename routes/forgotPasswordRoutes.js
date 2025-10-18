const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTP, resetPassword } = require('../controllers/forgotPasswordController');
const { forgotPasswordLimiter } = require('../middleware/rateLimiter');

router.post('/forgot-password/send-otp', forgotPasswordLimiter, sendOTP);
router.post('/forgot-password/verify-otp', forgotPasswordLimiter, verifyOTP);
router.post('/forgot-password/reset-password', forgotPasswordLimiter, resetPassword);

module.exports = router;
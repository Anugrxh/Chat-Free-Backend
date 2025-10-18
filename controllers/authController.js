const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  const { username, email, password, password2 } = req.body;
  if (!username || !email || !password || password !== password2) {
    return res.status(400).json({ message: 'Invalid input or passwords do not match.' });
  }

  // --- Check if email already exists ---
  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    return res.status(400).json({ message: 'An account with this email already exists.' });
  }



  const passwordHash = await bcrypt.hash(password, 10);
  const user = new User({ username, email, passwordHash });
  await user.save();

  res.status(201).json({ message: 'User registered successfully' });
};

// --- MODIFIED FUNCTION ---
exports.login = async (req, res) => {
  // 1. Destructure email from req.body instead of username
  const { email, password } = req.body;

  // 2. Find the user by their email
  const user = await User.findOne({ email });
  if (!user) {
    // Use a generic error message for security
    return res.status(400).json({ message: 'Invalid credentials.' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(400).json({ message: 'Invalid credentials.' });
  }

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, username: user.username, email: user.email });
};


exports.logout = async (req, res) => {
  // Since JWT is stateless, logout just means the client should delete the token
  res.json({ message: 'Logged out successfully. Please delete the token on the client.' });
};

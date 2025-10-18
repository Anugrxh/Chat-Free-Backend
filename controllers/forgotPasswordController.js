const User = require('../models/User');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Configure nodemailer with SMTP settings
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email service connection failed:', error.message);
  } else {
    console.log('✅ Email service is ready to send messages');
  }
});

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP to email
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to user
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = otpExpires;
    await user.save();

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'ChatFree - Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px;">
          <div style="background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border-radius: 10px; padding: 30px; text-align: center;">
            <h1 style="color: white; margin-bottom: 20px;">ChatFree</h1>
            <h2 style="color: white; margin-bottom: 20px;">Password Reset Request</h2>
            <p style="color: white; margin-bottom: 30px;">Your OTP for password reset is:</p>
            <div style="background: rgba(255, 255, 255, 0.2); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <h1 style="color: white; font-size: 36px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p style="color: white; font-size: 14px;">This OTP will expire in 10 minutes.</p>
            <p style="color: white; font-size: 12px;">If you didn't request this, please ignore this email.</p>
          </div>
        </div>
      `
    };

    // Send email with debugging
    console.log('\n🔐 SENDING PASSWORD RESET OTP');
    console.log('==============================');
    console.log('To Email:', email);
    console.log('From Email:', process.env.EMAIL_USER);
    console.log('OTP Code:', otp);
    console.log('Attempting to send email...');
    
    try {
      const emailResult = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully!');
      console.log('Message ID:', emailResult.messageId);
      console.log('==============================\n');
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
      console.log('📝 OTP for manual use:', otp);
      console.log('==============================\n');
      throw new Error('Failed to send email');
    }

    res.json({ 
      message: 'OTP sent successfully to your email address',
      email: email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email for security
    });

  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find user with valid OTP
    const user = await User.findOne({
      email,
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    res.json({ 
      message: 'OTP verified successfully',
      resetToken: user._id // We'll use user ID as reset token for simplicity
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Failed to verify OTP. Please try again.' });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;
    
    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Find user and check if OTP is still valid
    const user = await User.findOne({
      _id: resetToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Reset session expired. Please request a new OTP.' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear OTP fields
    user.passwordHash = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });

  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Failed to reset password. Please try again.' });
  }
};
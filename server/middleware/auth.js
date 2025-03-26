const jwt = require('jsonwebtoken');
const pool = require('../db');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    
    // Get user with public key
    const result = await pool.query(
      `SELECT u.*, uk.public_key 
       FROM users u 
       LEFT JOIN user_keys uk ON u.id = uk.user_id 
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    // Remove password from user object
    const { password, ...user } = result.rows[0];
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

module.exports = {
  authenticateToken
};

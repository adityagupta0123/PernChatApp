const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, publicKey } = req.body;

    // Validate required fields
    if (!name || !email || !password || !publicKey) {
      console.error('Missing required fields:', { name, email, password: !!password, publicKey: !!publicKey });
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Name, email, password, and public key are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if user exists
    const userExists = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Start a transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Create user
      const newUser = await client.query(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email, hashedPassword]
      );

      // Store public key
      await client.query(
        'INSERT INTO user_keys (user_id, public_key) VALUES ($1, $2)',
        [newUser.rows[0].id, publicKey]
      );

      await client.query('COMMIT');

      // Create JWT token
      const token = jwt.sign(
        { id: newUser.rows[0].id },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '7d' }
      );

      // Get user with public key
      const userWithKey = await db.query(
        `SELECT u.*, uk.public_key 
         FROM users u 
         LEFT JOIN user_keys uk ON u.id = uk.user_id 
         WHERE u.id = $1`,
        [newUser.rows[0].id]
      );

      const { password: _, ...userWithoutPassword } = userWithKey.rows[0];

      res.json({
        token,
        user: userWithoutPassword
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction error:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Registration error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    res.status(500).json({ 
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const result = await db.query(
      `SELECT u.*, uk.public_key 
       FROM users u 
       LEFT JOIN user_keys uk ON u.id = uk.user_id 
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create and assign token
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

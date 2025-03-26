const router = require('express').Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get all users except current user
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await pool.query(
      `SELECT u.id, u.name, u.email, uk.public_key
       FROM users u
       LEFT JOIN user_keys uk ON u.id = uk.user_id
       WHERE u.id != $1`,
      [req.user.id]
    );
    res.json(users.rows);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages between current user and another user
router.get('/messages/:recipientId', authenticateToken, async (req, res) => {
  try {
    const messages = await pool.query(
      `SELECT m.*, u.name as sender_name,
        CASE 
          WHEN m.sender_id = $1 THEN COALESCE(m.content, m.encrypted_content)
          ELSE m.encrypted_content
        END as content,
        CASE 
          WHEN m.sender_id != $1 THEN m.nonce
          ELSE NULL
        END as nonce,
        CASE 
          WHEN m.sender_id != $1 THEN m.ephemeral_public_key
          ELSE NULL
        END as ephemeral_public_key
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE (m.sender_id = $1 AND m.recipient_id = $2) 
       OR (m.sender_id = $2 AND m.recipient_id = $1) 
       ORDER BY m.created_at ASC`,
      [req.user.id, req.params.recipientId]
    );
    res.json(messages.rows);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Send a message
router.post('/messages', authenticateToken, async (req, res) => {
  try {
    const { recipientId, content, encrypted_content, nonce, ephemeral_public_key } = req.body;

    if (!recipientId || (!content && !encrypted_content)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if recipient exists
    const recipientCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [recipientId]
    );

    if (recipientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    const newMessage = await pool.query(
      `INSERT INTO messages 
       (sender_id, recipient_id, content, encrypted_content, nonce, ephemeral_public_key) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [req.user.id, recipientId, content, encrypted_content, nonce, ephemeral_public_key]
    );

    const messageWithSender = await pool.query(
      `SELECT m.*, u.name as sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.id = $1`,
      [newMessage.rows[0].id]
    );

    // Return the appropriate message format
    const message = messageWithSender.rows[0];
    if (message.sender_id === req.user.id) {
      message.content = message.content || message.encrypted_content;
      message.nonce = null;
      message.ephemeral_public_key = null;
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Save or update user's public key
router.post('/keys', authenticateToken, async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required' });
    }

    // Use upsert to handle both insert and update
    await pool.query(
      `INSERT INTO user_keys (user_id, public_key)
       VALUES ($1, $2)
       ON CONFLICT (user_id) 
       DO UPDATE SET public_key = EXCLUDED.public_key`,
      [req.user.id, publicKey]
    );

    res.json({ message: 'Public key saved successfully' });
  } catch (error) {
    console.error('Error saving public key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

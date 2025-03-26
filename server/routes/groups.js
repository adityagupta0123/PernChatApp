const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Create a new group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, members } = req.body;
    
    // Start a transaction
    await db.query('BEGIN');

    // Create group
    const groupResult = await db.query(
      'INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING *',
      [name, req.user.id]
    );
    const group = groupResult.rows[0];

    // Add creator as a member
    await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.user.id]
    );

    // Add other members
    for (const memberId of members) {
      if (memberId !== req.user.id) {
        await db.query(
          'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
          [group.id, memberId]
        );
      }
    }

    await db.query('COMMIT');

    // Get complete group info with member count
    const completeGroup = await db.query(
      `SELECT g.*, COUNT(gm.user_id) as member_count 
       FROM groups g 
       LEFT JOIN group_members gm ON g.id = gm.group_id 
       WHERE g.id = $1 
       GROUP BY g.id`,
      [group.id]
    );

    res.status(201).json(completeGroup.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// Get all groups for a user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const groups = await db.query(
      `SELECT g.id, g.name, g.created_at, g.created_by,
       (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM groups g
       INNER JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1`,
      [req.user.id]
    );
    res.json(groups.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get group messages
router.get('/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    if (!groupId || isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // First verify user is a member of the group
    const memberCheck = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const messages = await db.query(
      `SELECT 
        gm.id,
        gm.group_id,
        gm.sender_id,
        gm.created_at,
        gm.encrypted_content->>'content' as content,
        u.name as sender_name 
       FROM group_messages gm 
       JOIN users u ON gm.sender_id = u.id 
       WHERE gm.group_id = $1 
       ORDER BY gm.created_at ASC`,
      [groupId]
    );
    res.json(messages.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message to group
router.post('/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content } = req.body;
    
    console.log('Received group message request:', { groupId, content, userId: req.user.id });
    
    if (!groupId || isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Verify user is a member of the group
    const memberCheck = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Get sender name first
    const sender = await db.query(
      'SELECT name FROM users WHERE id = $1',
      [req.user.id]
    );

    if (sender.rows.length === 0) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    // Insert message with content as JSONB
    const result = await db.query(
      `INSERT INTO group_messages (group_id, sender_id, encrypted_content) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [groupId, req.user.id, JSON.stringify({ content })]
    );

    const message = {
      ...result.rows[0],
      sender_name: sender.rows[0].name,
      group_id: parseInt(groupId),
      content: content // Add plain content for client
    };

    console.log('Group message saved successfully:', message);
    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending group message:', error);
    res.status(500).json({ 
      error: 'Failed to send group message',
      details: error.message 
    });
  }
});

// Get group members
router.get('/:groupId/members', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    if (!groupId || isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // First verify user is a member of the group
    const memberCheck = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const members = await db.query(
      `SELECT u.id as user_id, u.name, u.email 
       FROM users u 
       INNER JOIN group_members gm ON u.id = gm.user_id 
       WHERE gm.group_id = $1`,
      [groupId]
    );
    res.json(members.rows);
  } catch (err) {
    console.error('Error fetching group members:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

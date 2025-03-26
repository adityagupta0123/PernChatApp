import { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  TextField,
  IconButton,
  Typography,
  AppBar,
  Toolbar,
  Button,
  Badge,
  Divider,
  Container,
  InputBase,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  ListItemSecondaryAction,
  Tooltip,
} from '@mui/material';
import {
  Send as SendIcon,
  ExitToApp as LogoutIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  GroupAdd as GroupAddIcon,
  Group as GroupIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import {
  getUsers,
  getMessages,
  sendMessage,
  getGroups,
  createGroup,
  getGroupMessages,
  sendGroupMessage,
  getGroupMembers,
  savePublicKey,
} from '../services/api';
import io from 'socket.io-client';
import { encryptMessage, decryptMessage, getStoredKeys, generateKeyPair, storeKeys, decodeBase64 } from '../utils/crypto';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

// Custom styles
const darkTheme = {
  background: '#1E1F25',
  paper: '#27282F',
  primary: '#7C5CFF',
  text: '#FFFFFF',
  textSecondary: '#8A8B8F',
  divider: '#34363D',
  inputBg: '#34363D',
};

const Chat = () => {
  const { user, logout } = useAuth();
  const history = useHistory();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [error, setError] = useState(null); // Add error state
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const messageContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Check and save public key if missing
  useEffect(() => {
    const checkAndSavePublicKey = async () => {
      const storedKeys = getStoredKeys();
      if (!user.public_key && storedKeys.publicKey) {
        try {
          await savePublicKey(storedKeys.publicKey);
          // Refresh user data
          const response = await getUsers();
          const updatedUser = response.data.find(u => u.id === user.id);
          if (updatedUser) {
            setSelectedUser(updatedUser);
          }
        } catch (error) {
          console.error('Error saving public key:', error);
        }
      }
    };

    checkAndSavePublicKey();
  }, [user.id]);

  // Socket connection and event handlers
  useEffect(() => {
    // Connect to socket with auth token
    socketRef.current = io(SOCKET_URL, {
      auth: {
        token: localStorage.getItem('token')
      }
    });
    
    // Handle connection errors
    socketRef.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    
    // Handle successful connection
    socketRef.current.on('connect', () => {
      console.log('Socket connected successfully');
    });
    
    // Login to socket with user ID
    socketRef.current.emit('login', user.id);
    
    // Handle online users
    socketRef.current.on('onlineUsers', (users) => {
      setOnlineUsers(new Set(users));
    });

    // Handle private messages
    socketRef.current.on('privateMessage', (data) => {
      try {
        let messageContent = data.message.content;
        
        // Only decrypt if the message is from someone else
        if (data.message.sender_id !== user.id && data.message.encrypted_content && data.message.nonce && data.message.ephemeral_public_key) {
          const storedKeys = getStoredKeys();
          if (!storedKeys || !storedKeys.secretKey) {
            throw new Error('No secret key available for decryption');
          }

          console.log('Decrypting received message:', {
            senderId: data.message.sender_id,
            recipientId: data.message.recipient_id,
            hasEncryptedContent: !!data.message.encrypted_content,
            hasNonce: !!data.message.nonce,
            hasEphemeralKey: !!data.message.ephemeral_public_key
          });

          messageContent = decryptMessage(
            {
              encrypted: data.message.encrypted_content,
              nonce: data.message.nonce
            },
            data.message.ephemeral_public_key,
            storedKeys.secretKey
          );
        }

        const newMessage = {
          id: data.message.id,
          sender_id: data.message.sender_id,
          recipient_id: data.message.recipient_id,
          sender_name: data.message.sender_name,
          content: messageContent,
          created_at: data.message.created_at || new Date().toISOString()
        };

        // Only add message if it's from/to the currently selected user
        if (selectedUser && (
          (data.message.sender_id === selectedUser.id && data.message.recipient_id === user.id) ||
          (data.message.sender_id === user.id && data.message.recipient_id === selectedUser.id)
        )) {
          setMessages(prev => [...prev, newMessage]);
          scrollToBottom();
        }
      } catch (error) {
        console.error('Error handling real-time message:', error);
        // Show decryption error message only for received messages
        if (data.message.sender_id !== user.id && selectedUser && (
          (data.message.sender_id === selectedUser.id && data.message.recipient_id === user.id)
        )) {
          const errorMessage = {
            id: data.message.id || Date.now(),
            sender_id: data.message.sender_id,
            recipient_id: data.message.recipient_id,
            sender_name: data.message.sender_name,
            content: 'Message could not be decrypted',
            created_at: data.message.created_at || new Date().toISOString()
          };
          setMessages(prev => [...prev, errorMessage]);
          scrollToBottom();
        }
      }
    });

    // Handle group messages
    socketRef.current.on('groupMessage', (data) => {
      try {
        console.log('Received group message:', data);
        
        // Only add message if it's for the currently selected group
        if (selectedGroup && data.group_id === selectedGroup.id) {
          const newMessage = {
            id: data.id,
            sender_id: data.sender_id,
            sender_name: data.sender_name,
            group_id: data.group_id,
            content: data.content,
            created_at: data.created_at || new Date().toISOString()
          };

          // Add message to group messages
          setGroupMessages(prev => [...prev, newMessage]);
          scrollToBottom();
        }
      } catch (error) {
        console.error('Error handling group message:', error);
      }
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user.id, selectedUser, selectedGroup]);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await getUsers();
        setUsers(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    fetchUsers();
  }, []);

  // Fetch groups
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await getGroups();
        setGroups(response.data);
      } catch (error) {
        console.error('Error fetching groups:', error);
      }
    };
    fetchGroups();
  }, []);

  // Fetch group members when a group is selected
  useEffect(() => {
    const fetchGroupMembers = async () => {
      if (!selectedGroup?.id) {
        setGroupMembers([]);
        return;
      }

      try {
        const response = await getGroupMembers(selectedGroup.id);
        setGroupMembers(response.data);
      } catch (error) {
        console.error('Error fetching group members:', error);
        setGroupMembers([]);
      }
    };

    fetchGroupMembers();
  }, [selectedGroup]);

  // Fetch messages when user or group is selected
  useEffect(() => {
    const fetchMessages = async () => {
      if (selectedGroup) {
        try {
          const response = await getGroupMessages(selectedGroup.id);
          setGroupMessages(response.data);
          setError(null);
        } catch (error) {
          console.error('Error fetching group messages:', error);
          setError('Failed to fetch group messages');
        }
      } else if (selectedUser) {
        try {
          const response = await getMessages(selectedUser.id);
          const myKeys = getStoredKeys();
          
          if (!myKeys || !myKeys.secretKey) {
            console.error('No secret key found for decryption');
            return;
          }

          // Transform messages to include decrypted content
          const decryptedMessages = await Promise.all(response.data.map(async (msg) => {
            try {
              // For received messages that are encrypted
              if (msg.sender_id !== user.id && msg.encrypted_content && msg.nonce && msg.ephemeral_public_key) {
                console.log('Processing encrypted message:', {
                  senderId: msg.sender_id,
                  recipientId: msg.recipient_id,
                  hasEncryptedContent: !!msg.encrypted_content,
                  hasNonce: !!msg.nonce,
                  hasEphemeralKey: !!msg.ephemeral_public_key
                });

                const encryptedData = {
                  encrypted: msg.encrypted_content,
                  nonce: msg.nonce
                };

                const decryptedContent = await decryptMessage(
                  encryptedData,
                  msg.ephemeral_public_key,
                  myKeys.secretKey
                );

                return {
                  ...msg,
                  content: decryptedContent
                };
              }
              
              // For sent messages or unencrypted messages
              return msg;
            } catch (error) {
              console.error('Error decrypting message:', error);
              console.error('Message data:', {
                id: msg.id,
                senderId: msg.sender_id,
                recipientId: msg.recipient_id,
                hasEncryptedContent: !!msg.encrypted_content,
                hasNonce: !!msg.nonce,
                hasEphemeralKey: !!msg.ephemeral_public_key
              });
              return {
                ...msg,
                content: 'Error: Could not decrypt message'
              };
            }
          }));

          setMessages(decryptedMessages);
          setError(null); // Clear any previous errors
        } catch (error) {
          console.error('Error fetching messages:', error);
          setError('Failed to fetch messages');
        }
      }
    };

    fetchMessages();
  }, [selectedUser, selectedGroup, user?.id]); // Added selectedGroup to dependencies

  // Handle user selection
  const handleUserSelect = async (user) => {
    try {
      // Fetch user details to ensure we have their public key
      const response = await getUsers();
      const selectedUser = response.data.find(u => u.id === user.id);
      
      if (!selectedUser?.public_key) {
        alert('This user has not completed their registration. They need to register again to enable chat.');
        return;
      }
      
      setSelectedUser(selectedUser);
      setSelectedGroup(null);
    } catch (error) {
      console.error('Error selecting user:', error);
      alert('Failed to load user details');
    }
  };

  // Handle group selection
  const handleGroupSelect = async (group) => {
    try {
      setSelectedUser(null);
      setSelectedGroup(group);
      setMessages([]);
      
      // Join the group's socket room
      if (socketRef.current) {
        console.log('Joining group:', group.id);
        socketRef.current.emit('joinGroup', group.id);
      }
    } catch (error) {
      console.error('Error selecting group:', error);
      alert('Failed to load group details');
    }
  };

  // Create new group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedUsers.length === 0) return;

    try {
      const response = await createGroup({
        name: newGroupName,
        members: selectedUsers,
      });
      setGroups(prev => [...prev, response.data]);
      setCreateGroupOpen(false);
      setNewGroupName('');
      setSelectedUsers([]);
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  // Handle sending message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      if (selectedGroup) {
        // Handle group message
        console.log('Sending group message:', {
          groupId: selectedGroup.id,
          content: newMessage.trim()
        });

        const response = await sendGroupMessage(selectedGroup.id, {
          content: newMessage.trim()
        });

        console.log('Group message response:', response.data);

        const newMsg = {
          id: response.data.id,
          sender_id: user.id,
          sender_name: user.name,
          group_id: selectedGroup.id,
          content: newMessage.trim(),
          created_at: new Date().toISOString()
        };

        // Add message to local state
        setGroupMessages(prev => [...prev, newMsg]);

        // Emit socket event for group message
        socketRef.current.emit('groupMessage', {
          groupId: selectedGroup.id,
          message: newMsg
        });

        setNewMessage('');
        scrollToBottom();
      } else if (selectedUser) {
        // Handle private message
        if (!selectedUser.public_key) {
          throw new Error('Recipient public key not available');
        }

        const storedKeys = getStoredKeys();
        console.log('Stored keys for sending:', {
          publicKey: storedKeys.publicKey?.substring(0, 20) + '...',
          secretKey: storedKeys.secretKey?.substring(0, 20) + '...'
        });
        console.log('Recipient public key:', selectedUser.public_key?.substring(0, 20) + '...');

        if (!storedKeys.secretKey) {
          throw new Error('No secret key available for encryption');
        }

        // Validate keys before encryption
        try {
          decodeBase64(storedKeys.secretKey);
          decodeBase64(selectedUser.public_key);
        } catch (error) {
          throw new Error('Invalid key format');
        }

        // Encrypt message for recipient
        const { encrypted, nonce, ephemeralPublicKey } = encryptMessage(
          newMessage.trim(),
          selectedUser.public_key,
          storedKeys.secretKey
        );

        console.log('Encrypted message data:', {
          encrypted: encrypted.substring(0, 20) + '...',
          nonce: nonce.substring(0, 20) + '...',
          ephemeralPublicKey: ephemeralPublicKey.substring(0, 20) + '...'
        });

        // Send message to server
        const response = await sendMessage({
          recipientId: selectedUser.id,
          content: newMessage.trim(), // Store unencrypted content for sender
          encrypted_content: encrypted,
          nonce,
          ephemeral_public_key: ephemeralPublicKey
        });

        // Add message to the chat with unencrypted content for sender
        const newMsg = {
          id: response.data.id,
          sender_id: user.id,
          sender_name: user.name,
          recipient_id: selectedUser.id,
          content: newMessage.trim(),
          created_at: new Date().toISOString()
        };

        setMessages(prev => [...prev, newMsg]);

        // Emit socket event with encrypted message
        socketRef.current.emit('privateMessage', {
          recipientId: selectedUser.id,
          message: {
            id: newMsg.id,
            sender_id: user.id,
            sender_name: user.name,
            recipient_id: selectedUser.id,
            encrypted_content: encrypted,
            nonce: nonce,
            ephemeral_public_key: ephemeralPublicKey,
            created_at: new Date().toISOString()
          }
        });

        setNewMessage('');
        scrollToBottom();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response:', error.response.data);
        alert(error.response.data.error || 'Failed to send message');
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received:', error.request);
        alert('No response from server. Please check your connection.');
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Error setting up request:', error.message);
        alert(error.message || 'Failed to send message');
      }
    }
  };

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    logout();
    history.push('/login');
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: darkTheme.background }}>
      <AppBar position="static" sx={{ bgcolor: darkTheme.paper, boxShadow: 'none' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: darkTheme.text }}>
            Chat App
          </Typography>
          <IconButton color="inherit" onClick={handleLogout}>
            <LogoutIcon sx={{ color: darkTheme.textSecondary }} />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ flex: 1, py: 2 }}>
        <Grid container spacing={2} sx={{ height: '100%' }}>
          {/* Sidebar */}
          <Grid item xs={3}>
            <Paper sx={{ height: '100%', bgcolor: darkTheme.paper, borderRadius: 2 }}>
              {/* User Profile */}
              <Box sx={{ p: 2, borderBottom: `1px solid ${darkTheme.divider}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar sx={{ bgcolor: darkTheme.primary }}>
                    {user?.name?.[0]?.toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography sx={{ color: darkTheme.text, fontWeight: 500 }}>
                      {user?.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: darkTheme.textSecondary }}>
                      {user?.email}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Search and Create Group */}
              <Box sx={{ p: 2 }}>
                <Box sx={{ mb: 2 }}>
                  <Paper sx={{ p: '2px 4px', display: 'flex', bgcolor: darkTheme.inputBg }}>
                    <InputBase
                      sx={{ ml: 1, flex: 1, color: darkTheme.text }}
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <IconButton sx={{ p: '10px', color: darkTheme.textSecondary }}>
                      <SearchIcon />
                    </IconButton>
                  </Paper>
                </Box>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<GroupAddIcon />}
                  onClick={() => setCreateGroupOpen(true)}
                  sx={{ bgcolor: darkTheme.primary }}
                >
                  Create Group
                </Button>
              </Box>

              {/* Groups List */}
              <List sx={{ pt: 0 }}>
                <Typography variant="subtitle2" sx={{ px: 2, py: 1, color: darkTheme.textSecondary }}>
                  Groups
                </Typography>
                {groups.map((group) => (
                  <ListItem
                    key={group.id}
                    button
                    selected={selectedGroup?.id === group.id}
                    onClick={() => handleGroupSelect(group)}
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: `${darkTheme.primary}15`,
                      },
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: darkTheme.primary }}>
                        <GroupIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={group.name}
                      secondary={`${group.member_count} members`}
                      sx={{
                        '& .MuiListItemText-primary': { color: darkTheme.text },
                        '& .MuiListItemText-secondary': { color: darkTheme.textSecondary },
                      }}
                    />
                  </ListItem>
                ))}

                <Divider sx={{ my: 1, bgcolor: darkTheme.divider }} />

                {/* Users List */}
                <Typography variant="subtitle2" sx={{ px: 2, py: 1, color: darkTheme.textSecondary }}>
                  Direct Messages
                </Typography>
                {users
                  .filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((u) => (
                    <ListItem
                      key={u.id}
                      button
                      selected={selectedUser?.id === u.id}
                      onClick={() => handleUserSelect(u)}
                      sx={{
                        '&.Mui-selected': {
                          bgcolor: `${darkTheme.primary}15`,
                        },
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: darkTheme.primary }}>
                          {u.name[0].toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography sx={{ color: darkTheme.text }}>
                              {u.name}
                            </Typography>
                            {onlineUsers.has(u.id) && (
                              <Badge
                                color="success"
                                variant="dot"
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography variant="body2" sx={{ color: darkTheme.textSecondary }}>
                            {typingUsers.has(u.id) ? 'typing...' : ''}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
              </List>
            </Paper>
          </Grid>

          {/* Chat Area */}
          <Grid item xs={9}>
            <Paper sx={{ height: '100%', bgcolor: darkTheme.paper, borderRadius: 2 }}>
              {(selectedUser || selectedGroup) ? (
                <>
                  {/* Chat Header */}
                  <Box sx={{ p: 2, borderBottom: `1px solid ${darkTheme.divider}` }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Avatar sx={{ bgcolor: darkTheme.primary, mr: 2 }}>
                          {selectedGroup ? <GroupIcon /> : selectedUser.name[0].toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography sx={{ color: darkTheme.text, fontWeight: 500 }}>
                            {selectedGroup ? selectedGroup.name : selectedUser.name}
                          </Typography>
                          {selectedGroup && (
                            <Typography 
                              variant="body2" 
                              sx={{ color: darkTheme.textSecondary, cursor: 'pointer' }}
                              onClick={() => setShowMembersDialog(true)}
                            >
                              {groupMembers.length} Members
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      {selectedGroup && (
                        <Tooltip title="View Group Info">
                          <IconButton 
                            onClick={() => setShowMembersDialog(true)}
                            sx={{ color: darkTheme.textSecondary }}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>

                  {/* Messages */}
                  <Box
                    ref={messageContainerRef}
                    sx={{
                      height: 'calc(100vh )',
                      overflowY: 'auto',
                      p: 2,
                      bgcolor: darkTheme.background,
                    }}
                  >
                    {(selectedGroup ? groupMessages : messages).map((message, index) => {
                      // Check if the current user is the sender
                      const isCurrentUser = selectedGroup 
                        ? message.sender_id === user.id
                        : message.sender_id === user.id;

                      return (
                        <Box
                          key={index}
                          sx={{
                            display: 'flex',
                            justifyContent: isCurrentUser ? 'flex-end' : 'flex-start',
                            mb: 2,
                          }}
                        >
                          {!isCurrentUser && (
                            <Avatar
                              sx={{
                                width: 32,
                                height: 32,
                                mr: 1,
                                bgcolor: darkTheme.primary,
                              }}
                            >
                              {(selectedGroup ? message.sender_name : selectedUser?.name)?.[0]?.toUpperCase()}
                            </Avatar>
                          )}
                          <Box
                            sx={{
                              maxWidth: '70%',
                              bgcolor: isCurrentUser ? darkTheme.primary : darkTheme.paper,
                              color: isCurrentUser ? '#fff' : darkTheme.text,
                              p: 1.6,
                              borderRadius: 2,
                              position: 'relative',
                            }}
                          >
                            {selectedGroup && !isCurrentUser && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: darkTheme.textSecondary,
                                  fontWeight: 500,
                                  mb: 0.5,
                                  display: 'block',
                                }}
                              >
                                {message.sender_name}
                              </Typography>
                            )}
                            <Typography>{message.content}</Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: isCurrentUser ? 'rgba(255,255,255,0.7)' : darkTheme.textSecondary,
                                display: 'block',
                                textAlign: 'right',
                                mt: 0.5,
                                fontSize: '0.75rem',
                              }}
                            >
                              {new Date(message.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Typography>
                          </Box>
                          {isCurrentUser && (
                            <Avatar
                              sx={{
                                width: 32,
                                height: 32,
                                ml: 1,
                                bgcolor: darkTheme.primary,
                              }}
                            >
                              {user.name[0].toUpperCase()}
                            </Avatar>
                          )}
                        </Box>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </Box>

                  {/* Message Input */}
                  <Box sx={{ p: 2, bgcolor: darkTheme.paper }}>
                    <form onSubmit={handleSendMessage}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          fullWidth
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type a message..."
                          variant="outlined"
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: darkTheme.inputBg,
                              color: darkTheme.text,
                            },
                          }}
                        />
                        <IconButton
                          type="submit"
                          disabled={!newMessage.trim()}
                          sx={{
                            bgcolor: darkTheme.primary,
                            color: '#fff',
                            '&:hover': { bgcolor: darkTheme.primary },
                            '&.Mui-disabled': { bgcolor: `${darkTheme.primary}50` },
                          }}
                        >
                          <SendIcon />
                        </IconButton>
                      </Box>
                    </form>
                  </Box>
                </>
              ) : (
                <Box
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: darkTheme.textSecondary,
                  }}
                >
                  <PersonIcon sx={{ fontSize: 64, mb: 2 }} />
                  <Typography variant="h6">
                    Select a chat to start messaging
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* Create Group Dialog */}
      <Dialog
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        PaperProps={{
          sx: { bgcolor: darkTheme.paper, color: darkTheme.text },
        }}
      >
        <DialogTitle>Create New Group</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Group Name"
            fullWidth
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                color: darkTheme.text,
                '& fieldset': { borderColor: darkTheme.divider },
              },
              '& .MuiInputLabel-root': { color: darkTheme.textSecondary },
            }}
          />
          <List sx={{ mt: 2 }}>
            {users.map((u) => (
              <ListItem key={u.id}>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: darkTheme.primary }}>
                    {u.name[0].toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={u.name}
                  sx={{ '& .MuiListItemText-primary': { color: darkTheme.text } }}
                />
                <ListItemSecondaryAction>
                  <Checkbox
                    edge="end"
                    onChange={() => {
                      setSelectedUsers((prev) =>
                        prev.includes(u.id)
                          ? prev.filter((id) => id !== u.id)
                          : [...prev, u.id]
                      );
                    }}
                    checked={selectedUsers.includes(u.id)}
                    sx={{
                      color: darkTheme.textSecondary,
                      '&.Mui-checked': { color: darkTheme.primary },
                    }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCreateGroupOpen(false)}
            sx={{ color: darkTheme.textSecondary }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim() || selectedUsers.length === 0}
            sx={{ color: darkTheme.primary }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Group Members Dialog */}
      <Dialog 
        open={showMembersDialog} 
        onClose={() => setShowMembersDialog(false)}
        PaperProps={{
          sx: { 
            bgcolor: darkTheme.paper,
            color: darkTheme.text,
            minWidth: '300px'
          }
        }}
      >
        <DialogTitle sx={{ borderBottom: `1px solid ${darkTheme.divider}` }}>
          {selectedGroup?.name} - Members
        </DialogTitle>
        <DialogContent>
          <List>
            {groupMembers.map((member) => (
              <ListItem key={member.user_id}>
                <Avatar sx={{ bgcolor: darkTheme.primary, mr: 2 }}>
                  {member.name[0].toUpperCase()}
                </Avatar>
                <ListItemText 
                  primary={member.name}
                  secondary={
                    <Typography variant="body2" sx={{ color: darkTheme.textSecondary }}>
                      {member.email}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMembersDialog(false)} sx={{ color: darkTheme.primary }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Chat;

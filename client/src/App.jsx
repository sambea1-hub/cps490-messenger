import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('messenger_token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(sessionStorage.getItem('messenger_token')));

  // Auth form states
  const [authMode, setAuthMode] = useState('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Messaging & application states
  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeConvId, setActiveConvId] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Creation states
  const [directTargetId, setDirectTargetId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupParticipantIds, setGroupParticipantIds] = useState([]);

  // Message composer & error states
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [uiError, setUiError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);

  const socketRef = useRef(null);
  const activeConvRef = useRef('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    activeConvRef.current = activeConvId;
  }, [activeConvId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
      });
      setBackendOffline(false);
    } catch (networkErr) {
      setBackendOffline(true);
      throw new Error('Unable to contact the Messenger server. Check backend connectivity.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }
    return data;
  }

  // Verify token and load initial data
  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    let cancelled = false;
    async function initSession() {
      setAuthLoading(true);
      try {
        const meData = await apiFetch('/api/auth/me');
        if (cancelled) return;
        setCurrentUser(meData.user);
        await refreshDirectoryAndConversations();
      } catch (err) {
        if (cancelled) return;
        sessionStorage.removeItem('messenger_token');
        setToken('');
        setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    initSession();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function refreshDirectoryAndConversations() {
    setLoadingConversations(true);
    try {
      const [convData, userData] = await Promise.all([
        apiFetch('/api/conversations'),
        apiFetch('/api/users')
      ]);
      setConversations(convData.conversations || []);
      setAllUsers(userData.users || []);
    } catch (err) {
      setUiError(err.message);
    } finally {
      setLoadingConversations(false);
    }
  }

  // Establish Socket.IO connection when authenticated
  useEffect(() => {
    if (!token || !currentUser) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocketConnected(false);
      return;
    }

    const socket = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      setBackendOffline(false);
      if (activeConvRef.current) {
        socket.emit('conversation:join', activeConvRef.current);
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('connect_error', () => {
      setSocketConnected(false);
      setBackendOffline(true);
    });

    socket.on('conversation:new', (newConv) => {
      setConversations((prev) => {
        if (prev.some((c) => c.id === newConv.id)) return prev;
        return [newConv, ...prev];
      });
    });

    socket.on('message:new', (incomingMsg) => {
      if (incomingMsg.conversationId === activeConvRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === incomingMsg.id)) return prev;
          return [...prev, incomingMsg];
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, currentUser]);

  // Load conversation history when activeConvId changes
  useEffect(() => {
    if (!activeConvId || !token) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    async function loadHistory() {
      setLoadingMessages(true);
      setUiError('');
      try {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('conversation:join', activeConvId);
        }
        const data = await apiFetch(`/api/conversations/${activeConvId}/messages`);
        if (!cancelled) {
          setMessages(data.messages || []);
        }
      } catch (err) {
        if (!cancelled) {
          setUiError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [activeConvId, token]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError('');

    const trimmedUser = usernameInput.trim();
    if (trimmedUser.length < 3) {
      setAuthError('Username must be at least 3 characters.');
      return;
    }
    if (passwordInput.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ username: trimmedUser, password: passwordInput })
      });
      sessionStorage.setItem('messenger_token', data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      setUsernameInput('');
      setPasswordInput('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {
      // Proceed with local cleanup even if server is unreachable
    }
    sessionStorage.removeItem('messenger_token');
    setToken('');
    setCurrentUser(null);
    setConversations([]);
    setActiveConvId('');
    setMessages([]);
  }

  async function handleStartDirect(e) {
    e.preventDefault();
    setUiError('');
    if (!directTargetId) {
      setUiError('Please select a user to start a direct conversation.');
      return;
    }

    try {
      const data = await apiFetch('/api/conversations/direct', {
        method: 'POST',
        body: JSON.stringify({ recipientId: directTargetId })
      });
      const conv = data.conversation;
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
      setActiveConvId(conv.id);
      setDirectTargetId('');
    } catch (err) {
      setUiError(err.message);
    }
  }

  function toggleGroupParticipant(userId) {
    setGroupParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    setUiError('');
    if (!groupName.trim()) {
      setUiError('Please provide a group conversation name.');
      return;
    }
    if (groupParticipantIds.length === 0) {
      setUiError('Select at least one other registered user for the group.');
      return;
    }

    try {
      const data = await apiFetch('/api/conversations/group', {
        method: 'POST',
        body: JSON.stringify({
          name: groupName.trim(),
          participantIds: groupParticipantIds
        })
      });
      const conv = data.conversation;
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
      setActiveConvId(conv.id);
      setGroupName('');
      setGroupParticipantIds([]);
    } catch (err) {
      setUiError(err.message);
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!activeConvId || sending) return;
    setUiError('');

    const trimmed = messageText.trim();
    if (!trimmed) {
      setUiError('Message content cannot be empty.');
      return;
    }
    if (trimmed.length > 2000) {
      setUiError('Message content cannot exceed 2000 characters.');
      return;
    }

    setSending(true);
    try {
      const data = await apiFetch(`/api/conversations/${activeConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed })
      });
      const savedMsg = data.message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === savedMsg.id)) return prev;
        return [...prev, savedMsg];
      });
      setMessageText('');
    } catch (err) {
      setUiError(err.message);
    } finally {
      setSending(false);
    }
  }

  function formatConversationTitle(conv) {
    if (!conv) return '';
    if (conv.type === 'group') {
      return `# ${conv.name}`;
    }
    const other = (conv.participants || []).find(
      (p) => currentUser && p.id !== currentUser.id
    );
    return other ? `@ ${other.username}` : 'Direct Conversation';
  }

  if (authLoading) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h2>Loading session...</h2>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h1>Messenger</h1>
          <p className="auth-subtitle">
            {authMode === 'login'
              ? 'Sign in to access your private and group conversations'
              : 'Create a new registered account'}
          </p>

          {backendOffline && (
            <div className="alert-error">
              Backend server unreachable. Verify the Express server is running on port 4000.
            </div>
          )}

          {authError && <div className="alert-error">{authError}</div>}

          <form onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g., alice"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password (min 8 characters)</label>
              <input
                id="password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={authSubmitting}>
              {authSubmitting
                ? 'Submitting...'
                : authMode === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>

          <div className="auth-switch">
            {authMode === 'login' ? (
              <>
                Need an account?
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                  }}
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Already registered?
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const otherUsers = allUsers.filter((u) => u.id !== currentUser.id);
  const activeConversation = conversations.find((c) => c.id === activeConvId) || null;

  return (
    <div className="app-layout">
      {(backendOffline || !socketConnected) && (
        <div className="alert-offline">
          Live connection interrupted. Attempting to reconnect to backend server...
        </div>
      )}

      <header className="top-header">
        <div className="brand-area">
          <h1>Messenger</h1>
          <span className={`status-badge ${socketConnected ? 'status-online' : 'status-offline'}`}>
            {socketConnected ? 'Live Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="user-controls">
          <span>
            Signed in as <strong>{currentUser.username}</strong>
          </span>
          <button type="button" className="btn btn-secondary" onClick={refreshDirectoryAndConversations}>
            Refresh List
          </button>
          <button type="button" className="btn btn-danger" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3>Your Conversations</h3>
            {loadingConversations ? (
              <p className="conv-meta">Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <p className="conv-meta">No conversations yet. Start one below!</p>
            ) : (
              <ul className="conversation-list">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <button
                      type="button"
                      className={`conversation-item ${conv.id === activeConvId ? 'active' : ''}`}
                      onClick={() => setActiveConvId(conv.id)}
                    >
                      <span className="conv-title">{formatConversationTitle(conv)}</span>
                      <span className="conv-meta">
                        {conv.type === 'group'
                          ? `Group (${conv.participants.length} members)`
                          : 'Direct Message'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sidebar-section">
            <h3>Start Direct Conversation</h3>
            <form className="create-box" onSubmit={handleStartDirect}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <select
                  value={directTargetId}
                  onChange={(e) => setDirectTargetId(e.target.value)}
                >
                  <option value="">Select registered user...</option>
                  {otherUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                Open Direct Chat
              </button>
            </form>
          </div>

          <div className="sidebar-section">
            <h3>Create Group Conversation</h3>
            <form className="create-box" onSubmit={handleCreateGroup}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <input
                  type="text"
                  placeholder="Group name (e.g., Team Alpha)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
              <div className="checkbox-list">
                {otherUsers.length === 0 ? (
                  <span className="conv-meta">Register another user to form a group</span>
                ) : (
                  otherUsers.map((u) => (
                    <label key={u.id} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={groupParticipantIds.includes(u.id)}
                        onChange={() => toggleGroupParticipant(u.id)}
                      />
                      <span>{u.username}</span>
                    </label>
                  ))
                )}
              </div>
              <button type="submit" className="btn btn-primary">
                Create Group
              </button>
            </form>
          </div>
        </aside>

        <main className="chat-pane">
          {uiError && (
            <div className="alert-error" style={{ margin: '0.75rem 1.25rem 0' }}>
              {uiError}
            </div>
          )}

          {!activeConversation ? (
            <div className="empty-state">
              <h2>Select or create a conversation</h2>
              <p>Choose a direct or group conversation from the sidebar to view history and chat.</p>
            </div>
          ) : (
            <>
              <div className="chat-header">
                <h2>{formatConversationTitle(activeConversation)}</h2>
                <p>
                  Participants:{' '}
                  {activeConversation.participants.map((p) => p.username).join(', ')}
                </p>
              </div>

              <div className="message-list">
                {loadingMessages ? (
                  <div className="empty-state">Loading message history...</div>
                ) : messages.length === 0 ? (
                  <div className="empty-state">
                    <p>This conversation has no messages yet. Send the first message below!</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender?.id === currentUser.id;
                    return (
                      <div
                        key={msg.id}
                        className={`message-bubble ${isOwn ? 'own' : ''}`}
                      >
                        <div className="message-header">
                          <span className="message-sender">
                            {msg.sender?.username || 'User'}
                          </span>
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className="message-content">{msg.content}</div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="composer-form" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  placeholder="Type a message (max 2000 characters)..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  disabled={sending}
                />
                <button type="submit" className="btn btn-primary" disabled={sending}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

import { BrowserRouter as Router, Switch, Route, Redirect } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Login from './components/Login';
import Register from './components/Register';
import Chat from './components/Chat';
import { AuthProvider } from './context/AuthContext';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#1E1F25',
      paper: '#27282F',
    },
    primary: {
      main: '#7C5CFF',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#8A8B8F',
    },
    divider: '#34363D',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': {
            display: 'none'
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#34363D',
            '& fieldset': {
              borderColor: '#34363D',
            },
            '&:hover fieldset': {
              borderColor: '#7C5CFF',
            },
          },
        },
      },
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    button: {
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 8,
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Switch>
            <Route exact path="/login">
              <PublicRoute>
                <Login />
              </PublicRoute>
            </Route>
            <Route exact path="/register">
              <PublicRoute>
                <Register />
              </PublicRoute>
            </Route>
            <Route exact path="/chat">
              <PrivateRoute>
                <Chat />
              </PrivateRoute>
            </Route>
            <Route exact path="/">
              <Redirect to="/chat" />
            </Route>
          </Switch>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

// Private route component
const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Redirect to="/login" />;
};

// Public route component
const PublicRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return !token ? children : <Redirect to="/chat" />;
};

export default App;

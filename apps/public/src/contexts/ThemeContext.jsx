import { createContext, useContext, createSignal, createEffect, onMount } from 'solid-js';

const themes = {
  dark: {
    name: 'dark',
    colors: {
      primary: '#4facfe',
      secondary: '#667eea',
      accent: '#764ba2',
      background: '#000000',
      backgroundGradient: 'linear-gradient(135deg, #000000 0%, #111111 100%)',
      surface: '#000000',
      surfaceSecondary: 'rgba(79, 172, 254, 0.05)',
      border: 'rgba(79, 172, 254, 0.15)',
      text: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.7)',
      success: '#00e676',
      error: '#ff5252',
      warning: '#ffc107',
      info: '#4facfe',
      grid: '#1a1a1a',
      gridSecondary: '#2a2a2a',
      // WARR legacy colors
      warrBlue1: '#4facfe',
      warrBlue2: '#667eea',
      warrBlue3: '#764ba2',
      warrBlack: '#000000',
      warrRed: '#ff5252',
      warrGreen: '#00e676',
      warrYellow: '#ffc107',
      warrBackground: '#000000',
      borderRadius: '4px'
    }
  },
  light: {
    name: 'light',
    colors: {
      primary: '#2196f3',
      secondary: '#3f51b5',
      accent: '#9c27b0',
      background: '#ffffff',
      backgroundGradient: 'linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)',
      surface: '#f8f9fa',
      surfaceSecondary: 'rgba(0, 0, 0, 0.05)',
      border: 'rgba(33, 150, 243, 0.2)',
      text: '#212121',
      textSecondary: 'rgba(0, 0, 0, 0.6)',
      success: '#4caf50',
      error: '#f44336',
      warning: '#ff9800',
      info: '#2196f3',
      grid: '#e0e0e0',
      gridSecondary: '#bdbdbd',
      // WARR legacy colors
      warrBlue1: '#4facfe',
      warrBlue2: '#667eea',
      warrBlue3: '#764ba2',
      warrBlack: '#0c0c0c',
      warrRed: '#f44336',
      warrGreen: '#4caf50',
      warrYellow: '#ff9800',
      warrBackground: '#ffffff',
      borderRadius: '4px'
    }
  },
  // space: {
  //   name: 'space',
  //   colors: {
  //     primary: '#00d4ff',
  //     secondary: '#7c4dff',
  //     accent: '#ff4081',
  //     background: '#1c1136ff',
  //     backgroundGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a3e 50%, #2a1a4a 100%)',
  //     surface: '#1a1a3e',
  //     surfaceSecondary: 'rgba(0, 212, 255, 0.1)',
  //     border: 'rgba(0, 212, 255, 0.3)',
  //     text: '#ffffff',
  //     textSecondary: 'rgba(255, 255, 255, 0.9)',
  //     success: '#00e676',
  //     error: '#ff5252',
  //     warning: '#ffab40',
  //     info: '#40c4ff',
  //     grid: '#3a3a6e',
  //     gridSecondary: '#5a5a8e',
  //     // WARR legacy colors
  //     warrBlue1: '#00d4ff',
  //     warrBlue2: '#7c4dff',
  //     warrBlue3: '#ff4081',
  //     warrBlack: '#0a0a0a',
  //     warrRed: '#ff5252',
  //     warrGreen: '#00e676',
  //     warrYellow: '#ffab40',
  //     warrBackground: '#1a1a3e',
  //     borderRadius: '4px'
  //   }
  // }
};

const ThemeContext = createContext();

export function ThemeProvider(props) {
  const [currentTheme, setCurrentTheme] = createSignal('system');

  // Detect system theme preference
  const getSystemTheme = () => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark'; // fallback
  };

  // Get the actual theme to use (resolve 'system' to actual theme)
  const getResolvedTheme = () => {
    const theme = currentTheme();
    return theme === 'system' ? getSystemTheme() : theme;
  };

  // Load theme from localStorage on mount
  onMount(() => {
    const savedTheme = localStorage.getItem('spacelabs-theme');
    if (savedTheme && (themes[savedTheme] || savedTheme === 'system')) {
      setCurrentTheme(savedTheme);
    }

    // Listen for system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        // Only update if currently using system theme
        if (currentTheme() === 'system') {
          // Force a re-render by briefly changing and changing back
          const current = currentTheme();
          setCurrentTheme('_temp');
          setTimeout(() => setCurrentTheme(current), 0);
        }
      };

      mediaQuery.addListener(handleChange);

      // Cleanup
      return () => mediaQuery.removeListener(handleChange);
    }
  });

  // Save theme to localStorage and apply CSS variables when theme changes
  createEffect(() => {
    const resolvedThemeName = getResolvedTheme();
    const theme = themes[resolvedThemeName];
    localStorage.setItem('spacelabs-theme', currentTheme());

    // Apply CSS custom properties to root
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    // Update meta theme-color for browser UI
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme.colors.primary);
    }
  });

  const toggleTheme = () => {
    const themeKeys = ['system', ...Object.keys(themes)];
    const currentIndex = themeKeys.indexOf(currentTheme());
    const nextIndex = (currentIndex + 1) % themeKeys.length;
    setCurrentTheme(themeKeys[nextIndex]);
  };

  const setTheme = (themeName) => {
    if (themes[themeName] || themeName === 'system') {
      setCurrentTheme(themeName);
    }
  };

  const getTheme = () => themes[getResolvedTheme()];

  const value = {
    currentTheme,
    resolvedTheme: getResolvedTheme,
    theme: getTheme,
    themes: ['system', ...Object.keys(themes)],
    toggleTheme,
    setTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

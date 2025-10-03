import { createContext, useContext, createSignal, createEffect, onMount } from 'solid-js';

const themes = {
  dark: {
    name: 'dark',
    colors: {
      primary: '#0761b0',
      secondary: '#9bdafa',
      accent: '#e1f3fa',
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
      info: '#0761b0',
      grid: '#191919ff',
      gridSecondary: '#3a3a3aff',
      // WARR legacy colors
      warrBlue1: '#0761b0',
      warrBlue2: '#9bdafa',
      warrBlue3: '#e1f3fa',
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
  space: {
    name: 'space',
    colors: {
      primary: '#00d4ff',
      secondary: '#7c4dff',
      accent: '#ff4081',
      background: '#1c1136',
      backgroundGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a3e 50%, #2a1a4a 100%)',
      surface: '#1a1a3e',
      surfaceSecondary: 'rgba(0, 212, 255, 0.1)',
      border: 'rgba(0, 212, 255, 0.3)',
      text: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.9)',
      success: '#00e676',
      error: '#ff5252',
      warning: '#ffab40',
      info: '#40c4ff',
      grid: '#3a3a6e',
      gridSecondary: '#5a5a8e',
      // WARR legacy colors
      warrBlue1: '#00d4ff',
      warrBlue2: '#7c4dff',
      warrBlue3: '#ff4081',
      warrBlack: '#0a0a0a',
      warrRed: '#ff5252',
      warrGreen: '#00e676',
      warrYellow: '#ffab40',
      warrBackground: '#1a1a3e',
      borderRadius: '8px'
    }
  },
  neon: {
    name: 'neon',
    colors: {
      primary: '#ff00ff',
      secondary: '#00ffff',
      accent: '#ffff00',
      background: '#0a0a0a',
      backgroundGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a2a 50%, #0a2a1a 100%)',
      surface: '#1a1a1a',
      surfaceSecondary: 'rgba(255, 0, 255, 0.08)',
      border: 'rgba(255, 0, 255, 0.4)',
      text: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.8)',
      success: '#00ff88',
      error: '#ff0055',
      warning: '#ffff00',
      info: '#00ffff',
      grid: '#2a2a2a',
      gridSecondary: '#3a3a3a',
      // WARR legacy colors
      warrBlue1: '#ff00ff',
      warrBlue2: '#00ffff',
      warrBlue3: '#ffff00',
      warrBlack: '#0a0a0a',
      warrRed: '#ff0055',
      warrGreen: '#00ff88',
      warrYellow: '#ffff00',
      warrBackground: '#1a1a1a',
      borderRadius: '6px'
    }
  },

  cyberpunk: {
    name: 'cyberpunk',
    colors: {
      primary: '#ff2a6d',
      secondary: '#05d9e8',
      accent: '#ffeb00',
      background: '#0a0a16',
      backgroundGradient: 'linear-gradient(135deg, #0a0a16 0%, #1a1a3e 50%, #2a1a4a 100%)',
      surface: '#1a1a2e',
      surfaceSecondary: 'rgba(255, 42, 109, 0.1)',
      border: 'rgba(5, 217, 232, 0.4)',
      text: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.85)',
      success: '#00ff9f',
      error: '#ff2a6d',
      warning: '#ffeb00',
      info: '#05d9e8',
      grid: '#2a2a4a',
      gridSecondary: '#3a3a6a',
      // WARR legacy colors
      warrBlue1: '#ff2a6d',
      warrBlue2: '#05d9e8',
      warrBlue3: '#ffeb00',
      warrBlack: '#0a0a16',
      warrRed: '#ff2a6d',
      warrGreen: '#00ff9f',
      warrYellow: '#ffeb00',
      warrBackground: '#1a1a2e',
      borderRadius: '2px'
    }
  },

  forest: {
    name: 'forest',
    colors: {
      primary: '#4ecdc4',
      secondary: '#556270',
      accent: '#c7f464',
      background: '#1a2f1a',
      backgroundGradient: 'linear-gradient(135deg, #1a2f1a 0%, #2a4a2a 50%, #1a3a2a 100%)',
      surface: '#2a3a2a',
      surfaceSecondary: 'rgba(78, 205, 196, 0.08)',
      border: 'rgba(78, 205, 196, 0.3)',
      text: '#e0f0e0',
      textSecondary: 'rgba(224, 240, 224, 0.8)',
      success: '#a8e6cf',
      error: '#ff6b6b',
      warning: '#ffd93d',
      info: '#4ecdc4',
      grid: '#3a4a3a',
      gridSecondary: '#4a5a4a',
      // WARR legacy colors
      warrBlue1: '#4ecdc4',
      warrBlue2: '#556270',
      warrBlue3: '#c7f464',
      warrBlack: '#1a2f1a',
      warrRed: '#ff6b6b',
      warrGreen: '#a8e6cf',
      warrYellow: '#ffd93d',
      warrBackground: '#2a3a2a',
      borderRadius: '8px'
    }
  },

  sunset: {
    name: 'sunset',
    colors: {
      primary: '#ff6b6b',
      secondary: '#ffa726',
      accent: '#ff4081',
      background: '#2a0f1a',
      backgroundGradient: 'linear-gradient(135deg, #2a0f1a 0%, #4a1f2a 50%, #6a2f3a 100%)',
      surface: '#3a1f2a',
      surfaceSecondary: 'rgba(255, 107, 107, 0.1)',
      border: 'rgba(255, 167, 38, 0.3)',
      text: '#fff0f0',
      textSecondary: 'rgba(255, 240, 240, 0.8)',
      success: '#a8e6cf',
      error: '#ff5252',
      warning: '#ffd93d',
      info: '#4facfe',
      grid: '#4a2f3a',
      gridSecondary: '#5a3f4a',
      // WARR legacy colors
      warrBlue1: '#ff6b6b',
      warrBlue2: '#ffa726',
      warrBlue3: '#ff4081',
      warrBlack: '#2a0f1a',
      warrRed: '#ff5252',
      warrGreen: '#a8e6cf',
      warrYellow: '#ffd93d',
      warrBackground: '#3a1f2a',
      borderRadius: '12px'
    }
  },

  synthwave: {
    name: 'synthwave',
    colors: {
      primary: '#f72585',
      secondary: '#7209b7',
      accent: '#3a0ca3',
      background: '#0a0a20',
      backgroundGradient: 'linear-gradient(135deg, #0a0a20 0%, #2a0a50 50%, #4a0a80 100%)',
      surface: '#1a1a3a',
      surfaceSecondary: 'rgba(247, 37, 133, 0.1)',
      border: 'rgba(114, 9, 183, 0.5)',
      text: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.9)',
      success: '#4cc9f0',
      error: '#f72585',
      warning: '#fca311',
      info: '#4361ee',
      grid: '#2a2a5a',
      gridSecondary: '#3a3a7a',
      // WARR legacy colors
      warrBlue1: '#f72585',
      warrBlue2: '#7209b7',
      warrBlue3: '#3a0ca3',
      warrBlack: '#0a0a20',
      warrRed: '#f72585',
      warrGreen: '#4cc9f0',
      warrYellow: '#fca311',
      warrBackground: '#1a1a3a',
      borderRadius: '4px'
    }
  }
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

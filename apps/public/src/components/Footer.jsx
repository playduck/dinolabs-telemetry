import { BsDisplay, BsSun, BsMoon, BsRocketTakeoff } from 'solid-icons/bs';
import { BsDisplayFill, BsSunFill, BsMoonFill, BsRocketTakeoffFill } from 'solid-icons/bs';
import { useTheme } from '../contexts/ThemeContext';
import { createSignal, onMount, onCleanup } from 'solid-js';
import styles from './Footer.module.css';

function getLocalISOParts() {
  const now = new Date();
  const tzOffset = -now.getTimezoneOffset();
  const diff = tzOffset >= 0 ? '+' : '-';
  const pad = (num) => String(num).padStart(2, '0');

  const isoString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();
  const offsetHours = pad(Math.floor(Math.abs(tzOffset) / 60));
  const offsetMinutes = pad(Math.abs(tzOffset) % 60);

  const datePart = isoString.slice(0, 10); // YYYY-MM-DD
  const timePart = isoString.slice(11, -1); // HH:mm:ss.sss
  const timezonePart = diff + offsetHours + ':' + offsetMinutes;

  return {
    date: datePart,
    separator: 'T',
    time: timePart,
    timezone: timezonePart
  };
}

function Footer() {
  const { currentTheme, setTheme, themes } = useTheme();
  const [timeParts, setTimeParts] = createSignal(getLocalISOParts());

  let intervalId;

  onMount(() => {
    // Update time every second
    intervalId = setInterval(() => {
      setTimeParts(getLocalISOParts());
    }, 100);
  });

  onCleanup(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  const getThemeIcon = (themeName, active) => {
    if(!active) {
      switch (themeName) {
        case 'system': return () => <BsDisplayFill size={20} />;
        case 'light': return () => <BsSunFill size={20} />;
        case 'dark': return () => <BsMoonFill size={20} />;
        case 'space': return () => <BsRocketTakeoffFill size={20} />;
      }
    } else {
      switch (themeName) {
        case 'system': return () => <BsDisplay size={20} />;
        case 'light': return () => <BsSun size={20} />;
        case 'dark': return () => <BsMoon size={20} />;
        case 'space': return () => <BsRocketTakeoff size={20} />;
      }
    }
  };

  return (
    <footer class={styles.footer}>
      <div class={styles.mobileTopRow}>
        <div class={styles.timeDisplay}>
          <span class={styles.dateText}>{timeParts().date}</span>
          <span>{timeParts().separator}</span><wbr />
          <span class={styles.timeText}>{timeParts().time}</span>
          <span>{timeParts().timezone}</span>
        </div>
        <div class={styles.themeSelector}>
          {themes.map(themeName => (
            <button
              class={`${styles.themeOption} ${currentTheme() === themeName ? styles.active : ''}`}
              onClick={() => setTheme(themeName)}
              title={themeName === 'system' ? 'Use system theme' : themeName.charAt(0).toUpperCase() + themeName.slice(1)}
            >
              {getThemeIcon(themeName, currentTheme() === themeName)}
            </button>
          ))}
        </div>
      </div>
      <div class={styles.timeDisplay}>
        <span class={styles.dateText}>{timeParts().date}</span>
        <span>{timeParts().separator}</span><wbr />
        <span class={styles.timeText}>{timeParts().time}</span>
        <span>{timeParts().timezone}</span>
      </div>
      <div class={styles.footerText}>
        Built on Earth by Space Labs
      </div>
      <div class={styles.themeSelector}>
        {themes.map(themeName => (
          <button
            class={`${styles.themeOption} ${currentTheme() === themeName ? styles.active : ''}`}
            onClick={() => setTheme(themeName)}
            title={themeName === 'system' ? 'Use system theme' : themeName.charAt(0).toUpperCase() + themeName.slice(1)}
          >
            {getThemeIcon(themeName, currentTheme() === themeName)}
          </button>
        ))}
      </div>
    </footer>
  );
}

export default Footer;

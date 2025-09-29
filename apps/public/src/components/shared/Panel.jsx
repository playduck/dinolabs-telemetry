import { children } from 'solid-js';
import styles from './Panel.module.css';
import commonStyles from './common.module.css';

/**
 * Shared panel component that provides consistent structure and styling
 * for all dashboard panels.
 */
function Panel(props) {
  const c = children(() => props.children);
  const headerStats = children(() => props.headerStats);

  return (
    <div class={`${commonStyles.componentPanel} ${props.className || ''}`}>
      <div class={commonStyles.componentHeader}>
        <h3>{props.title}</h3>
        {headerStats() && (
          <div class={commonStyles.headerStats}>
            {headerStats()}
          </div>
        )}
      </div>
      <div class={`${styles.panelContent} ${props.contentClass || ''}`}>
        {c()}
      </div>
    </div>
  );
}

export default Panel;
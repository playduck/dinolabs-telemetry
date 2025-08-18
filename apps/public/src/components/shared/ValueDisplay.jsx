import { createMemo } from 'solid-js';
import styles from './ValueDisplay.module.css';

function ValueDisplay({ 
  label, 
  value, 
  unit, 
  formatFn, 
  precision = 2, 
  placeholder = '--',
  className = '',
  flashAnimation = false 
}) {
  const formattedValue = createMemo(() => {
    // Get the current value - call function if it's a signal accessor
    const currentValue = typeof value === 'function' ? value() : value;
    
    if (currentValue === null || currentValue === undefined) {
      return placeholder;
    }
    
    if (formatFn) {
      return formatFn(currentValue);
    }
    
    if (typeof currentValue === 'number') {
      return currentValue.toFixed(precision);
    }
    
    return currentValue;
  });

  const valueClass = createMemo(() => {
    // Get the current unit - call function if it's a signal accessor
    const currentUnit = typeof unit === 'function' ? unit() : unit;
    let baseClass = `${styles.value} ${className}`;
    
    if (currentUnit) {
      baseClass += ` ${styles.withUnit}`;
    }
    
    if (flashAnimation) {
      baseClass += ` ${styles.flash}`;
    }
    
    return baseClass;
  });

  return (
    <div class={styles.container}>
      {label && <label class={styles.label}>{label}</label>}
      <span 
        class={valueClass()}
        style={(() => {
          const currentUnit = typeof unit === 'function' ? unit() : unit;
          return currentUnit ? `--unit: "${currentUnit}"` : '';
        })()}
      >
        {formattedValue()}
      </span>
    </div>
  );
}

export default ValueDisplay;
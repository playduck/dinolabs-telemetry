import './App.css';
import { onMount } from 'solid-js';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/Header';
import Footer from './components/Footer';
import SystemCard from './components/SystemCard';
import PowerPanel from './components/PowerPanel';
import TemperaturePanel from './components/TemperaturePanel';
import MessageHistory from './components/MessageHistory';
import VisualizationPanel from './components/VisualizationPanel';
import IMUPanel from './components/IMUPanel';
import ExperimentPanel from './components/ExperimentPanel';
import telemetryService from './services/TelemetryService';

function AppContent() {
  onMount(() => {
    // Initialize telemetry service connection
    telemetryService.connect();
  });

  return (
    <div class="App">
      <Header />
      <div class="content">
        <div class="main-layout">
          <SystemCard type="SYSTEM" className="system-grid-item" />
          <SystemCard type="EXPERIMENT" className="experiment-grid-item" />
          <SystemCard type="TEMPERATURE" className="temperature-grid-item" />
          <SystemCard type="POWER" className="power-grid-item" />
          <ExperimentPanel className="experiment-panel-grid-item" />
          <IMUPanel className="imu-panel-grid-item" />
          <PowerPanel className="power-panel-grid-item" />
          <TemperaturePanel className="temperature-panel-grid-item" />
          <MessageHistory className="message-history-grid-item" />
          <VisualizationPanel className="visualization-panel-grid-item" />
        </div>
      </div>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;

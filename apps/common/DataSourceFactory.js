class DataSourceFactory {
  static create(type, config) {
    switch (type) {
      case 'tcp':
        const TcpDataSource = require('./dataSources/TcpDataSource');
        return new TcpDataSource(config);
      case 'serial':
        const SerialDataSource = require('./dataSources/SerialDataSource');
        return new SerialDataSource(config);
      default:
        throw new Error(`Unsupported data source type: ${type}`);
    }
  }
}

module.exports = DataSourceFactory;

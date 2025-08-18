class DataSourceFactory {
  static create(type, config) {
    switch (type) {
      case 'tcp':
        const TcpDataSource = require('./dataSources/TcpDataSource');
        return new TcpDataSource(config);
      case 'opcua':
        const OpcuaDataSource = require('./dataSources/OpcuaDataSource');
        return new OpcuaDataSource(config);
      case 'dummy':
        const DummyDataSource = require('./dataSources/DummyDataSource');
        return new DummyDataSource(config);
      default:
        throw new Error(`Unsupported data source type: ${type}`);
    }
  }
}

module.exports = DataSourceFactory;

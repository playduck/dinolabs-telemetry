const EventEmitter = require('node:events');
const opcua = require("node-opcua");

class OpcuaDataSource extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.TAG = "OPCUA_SOURCE";
    this.client = null;
    this.session = null;
    this.subscription = null;
    this.reconnectTimeout = 5000;
    this.retry_count = 0;
  }

  async start() {
    try {
      console.log(this.TAG, `Starting OPC-UA connection to ${this.config.endpoint_url}`);
      
      this.client = opcua.OPCUAClient.create({
        applicationName: "WARR Telemetry Client",
        connectionStrategy: {
          initialDelay: 1000,
          maxRetry: 3
        }
      });
      
      await this.client.connect(this.config.endpoint_url);
      this.session = await this.client.createSession();
      
      this.subscription = await this.session.createSubscription2({
        requestedPublishingInterval: this.config.requestedInterval,
        requestedLifetimeCount: 60,
        requestedMaxKeepAliveCount: 2,
        maxNotificationsPerPublish: 10,
        publishingEnabled: true,
        priority: 10
      });

      // Add subscription status monitoring
      this.subscription.on("started", () => {
        console.log(this.TAG, "Subscription started");
      });

      this.subscription.on("keepalive", () => {
        console.log(this.TAG, "Subscription keepalive received");
      });

      this.subscription.on("terminated", () => {
        console.log(this.TAG, "Subscription terminated");
      });

      // Use the correct node ID found by browsing: ns=2;i=3
      const possibleNodeIds = [
        'ns=2;i=3'  // This is the actual data variable node ID
      ];
      
      let monitored = null;
      for (const nodeId of possibleNodeIds) {
        try {
          console.log(this.TAG, `Trying to monitor node: ${nodeId}`);
          // Try different monitoring parameters
          console.log(this.TAG, `Monitoring with params: samplingInterval=${this.config.requestedInterval}`);
          
          // Try very aggressive monitoring settings
          monitored = await this.subscription.monitor({
            nodeId: nodeId,
            attributeId: opcua.AttributeIds.Value
          }, {
            samplingInterval: 100, // Much faster sampling (100ms instead of 25ms config)  
            discardOldest: true,
            queueSize: 1000,
            filter: null // No filtering
          }, opcua.TimestampsToReturn.Both);
          
          console.log(this.TAG, `Monitored item created with ID: ${monitored.monitoredItemId}`);
          
          console.log(this.TAG, `Successfully monitoring node: ${nodeId}`);
          break;
        } catch (error) {
          console.log(this.TAG, `Failed to monitor node ${nodeId}: ${error.message}`);
        }
      }

      if (!monitored) {
        throw new Error('Could not find any valid data node to monitor');
      }

      // Add all possible event handlers for debugging
      console.log(this.TAG, "Setting up monitored item event handlers...");
      
      monitored.on("changed", (dataValue) => {
        console.log(this.TAG, "🎉 Data changed event received!");
        console.log(this.TAG, "DataValue:", JSON.stringify(dataValue, null, 2));
        
        if (dataValue.value && dataValue.value.value) {
          console.log(this.TAG, "Emitting data:", dataValue.value.value);
          this.emit('message', dataValue.value.value);
        } else {
          console.log(this.TAG, "No value.value, checking dataValue structure");
          console.log(this.TAG, "Available properties:", Object.keys(dataValue));
          if (dataValue.value) {
            console.log(this.TAG, "Value properties:", Object.keys(dataValue.value));
          }
          this.emit('message', dataValue);
        }
      });

      monitored.on("error", (error) => {
        console.error(this.TAG, "Monitor error:", error);
      });

      // Let's also try to manually read the node value to trigger events
      setTimeout(async () => {
        try {
          console.log(this.TAG, "Reading current value via session...");
          const nodeId = opcua.resolveNodeId('ns=2;i=3');
          const currentValue = await this.session.readVariableValue(nodeId);
          console.log(this.TAG, "Current node value:", JSON.stringify(currentValue, null, 2));
          
          // Decode the status code
          const statusCode = currentValue.statusCode.value;
          console.log(this.TAG, `Status code: ${statusCode} (0x${statusCode.toString(16)})`);
          
          // Let's browse the namespace to see what nodes actually exist
          console.log(this.TAG, "Browsing available nodes...");
          try {
            const objectsNode = opcua.resolveNodeId("ns=0;i=85"); // Objects folder
            const browseResult = await this.session.browse(objectsNode);
            console.log(this.TAG, "Objects folder contents:", browseResult.references.map(ref => ({
              browseName: ref.browseName.toString(),
              nodeId: ref.nodeId.toString(),
              nodeClass: ref.nodeClass
            })));
            
            // Try to browse our namespace - use the correct node ID from browse results  
            const payloadNode = opcua.resolveNodeId("ns=2;i=1");
            const payloadBrowse = await this.session.browse(payloadNode);
            console.log(this.TAG, "Payload folder contents:", payloadBrowse.references.map(ref => ({
              browseName: ref.browseName.toString(), 
              nodeId: ref.nodeId.toString()
            })));
            
            // If payload has contents, browse deeper
            if (payloadBrowse.references.length > 0) {
              for (const ref of payloadBrowse.references) {
                console.log(this.TAG, `Browsing ${ref.browseName.toString()}...`);
                try {
                  const subBrowse = await this.session.browse(ref.nodeId);
                  console.log(this.TAG, `${ref.browseName.toString()} contents:`, subBrowse.references.map(subRef => ({
                    browseName: subRef.browseName.toString(),
                    nodeId: subRef.nodeId.toString()
                  })));
                } catch (subError) {
                  console.log(this.TAG, `Cannot browse ${ref.browseName.toString()}: ${subError.message}`);
                }
              }
            }
            
          } catch (browseError) {
            console.error(this.TAG, "Browse error:", browseError.message);
          }
          
        } catch (error) {
          console.error(this.TAG, "Error reading current value:", error);
        }
      }, 1000);

      console.log(this.TAG, "OPC-UA connection established");
      this.retry_count = 0;
      
      // TEMPORARY: Test data emission to verify logging pipeline works
      setTimeout(() => {
        console.log(this.TAG, "Emitting test data manually to verify pipeline");
        this.emit('message', Buffer.from("test data from opcua source"));
      }, 2000);
      
    } catch(error) {
      console.error(this.TAG, "Failed to connect to OPC-UA server:", error);
      setTimeout(() => this.reconnect(), this.reconnectTimeout);
    }
  }

  async reconnect() {
    this.retry_count++;
    console.log(this.TAG, `Reconnecting to OPC-UA server (${this.retry_count})...`);
    await this.stop();
    await this.start();
  }

  async stop() {
    try {
      if (this.subscription) {
        await this.subscription.terminate();
        this.subscription = null;
      }
      if (this.session) {
        await this.session.close();
        this.session = null;
      }
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }
      console.log(this.TAG, "OPC-UA connection closed");
    } catch(error) {
      console.error(this.TAG, "Error closing OPC-UA connection:", error);
    }
  }
}

module.exports = OpcuaDataSource;
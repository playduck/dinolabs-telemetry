const opcua = require("node-opcua");
const EventEmitter = require('node:events');

const endpointUrl = "opc.tcp://0.0.0.0:4840/warr/telemetry/server/";
const namespace = "http://rocketry.warr.com/opcua/server";

const subscriptionConfig = {
  requestedPublishingInterval: 500,
  requestedLifetimeCount: 10,
  requestedMaxKeepAliveCount: 5,
  maxNotificationsPerPublish: 10,
  publishingEnabled: false,
  priority: 1,
};
const monitoredItemConfig = {
  samplingInterval: 0,
  discardOldest: true,
  queueSize: 0,
};

const client = opcua.OPCUAClient.create({
  endpointMustExist: false,
  requestedSessionTimeout: 20000,
});

client.on("backoff", (retry, delay) =>
  console.log(
    `still trying to connect to ${endpointUrl}: retry =${retry} next attempt in ${delay / 1000} seconds`
  )
);

client.on("after_reconnection", (err) => {
  console.log("after_reconnection");
  // automatic subscription transfer attempt must fail first
  setTimeout(subscribe, 1000);
})

const emitter = new EventEmitter();
let session, namespaceIndex, nodeId, subscription;
client
  .connect(endpointUrl)
  .then(() => {
    console.log("creating session");
    return client.createSession();
  })
  .then((_session) => {
    session = _session;
    console.log("reading namespace");
    return session.readNamespaceArray();
  })
  .then(() => {
    console.log("finding namespace index");
    return session.getNamespaceIndex(namespace);
  })
  .then((_namespaceIndex) => {
    namespaceIndex = _namespaceIndex;
    console.log("browsing path for payload id");
    const path = opcua.makeBrowsePath(
      "RootFolder",
      `/Objects/${namespaceIndex}:payload/${namespaceIndex}:dinolabs.${namespaceIndex}:data`
    );
    return session.translateBrowsePath([path]);
  })
  .then((translated) => {
    console.log("creating subscription request");
    nodeId = translated[0].targets[0].targetId;
    subscribe();
});


function subscribe()  {
  console.log("creating subscription request");

  subscription = opcua.ClientSubscription.create(session, subscriptionConfig)
    console.log("starting subscription monitoring");
    subscription.monitorItems(
      [{ nodeId: nodeId, attributeId: opcua.AttributeIds.Value }],
      monitoredItemConfig,
      opcua.TimestampsToReturn.Both,
      (err, cmig) => {
        cmig.on("changed", (mi, dv, idx) => {
          // console.log(dv.value.value);
          emitter.emit("message", dv.value.value);
        });
      }
    );
}

module.exports = {emitter, subscribe};

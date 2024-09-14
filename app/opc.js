// const {
//   OPCUAClient,
//   makeBrowsePath,
//   AttributeIds,
//   resolveNodeId,
//   TimestampsToReturn,
//   DataValue,
// } = require("node-opcua");
// const async = require("async");

// const endpointUrl = "opc.tcp://0.0.0.0:4840/freeopcua/server/";

// const client = OPCUAClient.create({
//   endpointMustExist: false,
// });

// client.on("backoff", (retry, delay) =>
//   console.log(
//     "still trying to connect to ",
//     endpointUrl,
//     ": retry =",
//     retry,
//     "next attempt in ",
//     delay / 1000,
//     "seconds"
//   )
// );

// let the_session, the_subscription;

// async.series(
//   [
//     // step 1 : connect to
//     function (callback) {
//       console.log("Connection");
//       client.connect(endpointUrl, function (err) {
//         if (err) {
//           console.log(" cannot connect to endpoint :", endpointUrl);
//         } else {
//           console.log("connected !");
//         }
//         callback(err);
//       });
//     },

//     // step 2 : createSession
//     function (callback) {
//       console.log("create session");
//       client.createSession(function (err, session) {
//         if (err) {
//           return callback(err);
//         }
//         the_session = session;
//         callback();
//       });
//     },
//     // step 3 : browse
//     // function (callback) {
//     //   console.log("browsing the root folder");
//     //   the_session.browse("RootFolder", function (err, browseResult) {
//     //     if (!err) {
//     //       console.log(
//     //         "Browsing rootfolder: (" +
//     //           browseResult.references.length.toString() +
//     //           " items)"
//     //       );
//     //     //   for (let reference of browseResult.references) {
//     //     //     console.log(
//     //     //       reference.browseName.toString(),
//     //     //       reference.nodeId.toString()
//     //     //     );
//     //     //   }
//     //     }
//     //     callback(err);
//     //   });
//     // },

//     // // step 4 : browse objects folder
//     // function (callback) {
//     //   console.log("browsing the objects folder");
//     //   the_session.browse("ns=0;i=85", function (err, browseResult) {
//     //     if (!err) {
//     //       console.log(
//     //         "Browsing objects folder: (" +
//     //           browseResult.references.length.toString() +
//     //           " items)"
//     //       );
//     //       for (let reference of browseResult.references) {
//     //         console.log(
//     //           reference.browseName.toString(),
//     //           reference.nodeId.toString()
//     //         );
//     //       }
//     //     }
//     //     callback(err);
//     //   });
//     // },

//     // step 5 : read variables
//     // function (callback) {
//     //   console.log("reading variables");
//     //   the_session.browse("ns=0;i=85", function (err, browseResult) {
//     //     if (!err) {
//     //       for (let reference of browseResult.references) {
//     //         console.log("Name", reference.browseName.toString())
//     //         if(reference.browseName.name === "MyObject")  {
//     //             readVariables(reference.nodeId.toString());
//     //         }
//     //       }
//     //     }
//     //     callback(err);
//     //   });
//     // },

//     function(callback)  {
//         the_session.read( the_session.translateBrowsePath("Objects/MyObject/MyStringVariable"), function (err, dataValue) {
//             if (!err) {
//               console.log(reference.browseName.toString() + ": ", dataValue.value.value);
//         }
//         callback(err);
//         });
//     },

//     function(callback) {
//         setTimeout(callback, 1 * 1000);
//     },
//     // close session
//     function (callback) {
//       console.log("closing session");
//       the_session.close(function (err) {
//         if (err) {
//           console.log("closing session failed ?");
//         }
//         callback(err);
//       });
//     },
//   ],
//   function (err) {
//     if (err) {
//       console.log(" failure ", err);
//     } else {
//       console.log("done!");
//     }
//     client.disconnect(function () {});
//   }
// );

// function readVariables(nodeId) {
//     the_session.browse(nodeId, function (err, browseResult) {
//       if (!err) {
//         for (let reference of browseResult.references) {
//         console.log("Reading", reference.nodeClass, reference.browseName, reference.displayName)
//         //   if (reference.nodeClass === 1) { // 1 = Variable
//             the_session.read({ nodeId: reference.nodeId, attributeId: AttributeIds.Value }, function (err, dataValue) {
//               if (!err) {
//                 console.log(reference.browseName.toString() + ": ", dataValue.value.value);
//               }
//             });
//         //   } else if (reference.nodeClass === 2) { // 2 = Object
//             readVariables(reference.nodeId);
//         //   }
//         }
//       }

//     });
//   }

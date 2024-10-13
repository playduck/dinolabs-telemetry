# D.I.N.O.labs Telemetry Interface

## Overview

There are two NodeJs servers located in the `apps/` directory:
- `gse`: Ground Station Equipment Server for interfacing with rocketry
- `inet`: Internet server providing a REST API and static file serving

Both servers expose a static file server and a dynamic websockets server for live data updates.
`gse` implements a TCP client connecting to rocketires telemetry reading COBS-delimited protocol buffers.
It relays the data to a local file, a local websocket server and a TCP REST call to the `inet` server.
`inet` implements this REST API endpoint (POST requests with HTTP basic-auth) and file servers.
The `inet` accepts either binary protobfufs (`octal-streams`) or JSON.
Currently, `JSON` is used as parsing on the server seems unreliable, although package sizes are increased.
A legacy OPC-UA client also exists but is unused.

For testing a OPC-UA server and a serial-port server with mock capabilities are provided.
The OPC-UA server is legacy and untested.
Both are implemented in python3.
The serial-server either reads data from a serial port or generates dummy data and publishes these as a TCP server.
This emulates the rocketry ground-station telemetry interface.

## Running the NodeJS apps

This requires node (preferably the latest version, tested on `v22.9.0`).
First install required packages using
```bash
npm install
```
The `npm` utility should be bundled with the `node` installation.

Then set the settings in `/apps/config.json`.
It provides multiple fields:
- `"local_server"`: local `gse` server access, can be left at default
- `"public_server"`: `inet` server access, leave at default for `nginx` proxy
- `"tcpc"`: rocketry-`gse` TCP client interface, **change this to rocketry IP and port**
- `"tcp_api"`: public `inet` and `gse` API interface description, leave at default

The `gse` server also opens local interface on port `8080` (`http://localhost:8080`).
This is, in theory, identical to the `inet` interface, although faster.
The API endpoint is protected using simple HTTP basic-auth.
Only use the API via a secure HTTPS connection, as credentials are transmitted in clear-text (as Base64).
The API credentials must be stored in `/apps/secrets.json`.
Replace these with the actual credentials first:
```json
{
    "tcp_api": {
        "auth": {
            "username": "AzureDiamond",
            "password": "hunter2"
        }
    }
}
```

To run the `gse` or `inet` servers run either:
```bash
node apps/gse/app.js
node apps/inet/app.js
```

## Running the serial-server

To use dummy data set the variable `USE_DUMMY_DATA = True` located in `/test/serialserver/server.py`.
If set to False, it will try to open a serial port and read data from there.

Installing is simple using python3:
```bash
python -m venv ./venv
source ./venv/bin/activate
pip install -r requirements.txt
python test/serialserver/server.py
```
Note: make sure the default `python` points to an up-to-date version of python (>3.10).
Check this using `python --version`.
Systems may have more versions installed, try running commands like `python3.10` or later.

This `serialserver` a TCP server publishing COBS encoded protobufs to all connected TCP clients on the network.
The server is by default open on `localhost:8081`.
To run an entire demo, run the `gse` app in a separate session.
Configure the `/apps/config.json` to point `tcpc` towards IP `localhost` and port `8081`.
Then data should be visible on all three: the serial console of the `gse`, the local web interface of the `gse` at `http://localhost:8080` and on the public `inet` interface at `https://dinolabs.eu`.

## Note about protobufs

The gencode and runtime code versions of the protobufs must be identical.
This means the python `protobufs` version must be identical to the installed system `protoc`.
Deprecated gencodes should theoretically work with a more recent runtime.

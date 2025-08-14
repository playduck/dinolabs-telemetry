import asyncio
import copy
import logging
from datetime import datetime
import time
import math

from asyncua import ua, uamethod, Server

import data.source as source

_logger = logging.getLogger(__name__)

async def main():
    server = Server()
    await server.init()

    server.set_endpoint("opc.tcp://0.0.0.0:4840/warr/telemetry/server/")
    server.set_server_name("WARR Telemetry Example Server")

    server.set_security_policy(
        [
            ua.SecurityPolicyType.NoSecurity,
            ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            ua.SecurityPolicyType.Basic256Sha256_Sign,
        ]
    )

    namespace_uri = "http://rocketry.warr.com/opcua/server"
    idx = await server.register_namespace(namespace_uri)

    payload_folder = await server.nodes.objects.add_folder(idx, "payload")
    dinolabs_object = await payload_folder.add_object(idx, "dinolabs")
    data_var = await dinolabs_object.add_variable(idx, "data", bytearray(b"\x00"), ua.VariantType.ByteString)
    
    # Make variable writable and ensure it sends change notifications
    await data_var.set_writable(True)

    async with server:
        _logger.info("Server started")

        while True:
            try:
                await asyncio.sleep(0.25)
                buffer = source.example_generate_random_buffer()
                _logger.info(f"Writing data to variable, buffer length: {len(buffer)}")
                # Use set_value instead of write_value to trigger change notifications
                await data_var.set_value(buffer)
                _logger.info("Data written successfully")
            except ua.UaError as e:
                _logger.error(f"UA error: {e}")
            except Exception as e:
                _logger.error(f"Error writing to variable: {e}")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())

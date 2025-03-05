import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { z } from "zod";

import {calculator_sse} from "./tools/calculator.js"
import {weather} from "./tools/weather.js"
import {bitcoin, gold} from "./tools/assets.js"


var transport = null

const server = new McpServer({
  name: "demo-tools-sse",
  version: "0.0.1"
});

await add_tool("calculator",
         "Perform basic calculations. Add, subtract, multiply, divide. Invoke this tool every time you need to perform a calculation.",
         {expression: z.string()},
         calculator_sse)

await add_tool("get_weather",
         "Fetch the current weather for a specific location. Invoke this tool every time you need to give information on the weather.",
        {location: z.string()},
         weather)

await add_tool("get_gold_price",
         "Get the current price of Gold. Invoke this every time the user asks for the price of Gold",
         {},
         gold)

await add_tool("get_bitcoin_price",
         "Get the current price of Bitcoin. Invoke this every time the user asks for the price of Bitcoin",
         {},
         bitcoin)

async function add_tool(name, description, schema, func){
// Add tool will add the tool to both, local and remote access systems
    server.tool(name, description, schema,
        async (args) => {
            return await func(args)
        });
}


const app = express();

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  // Note: to support multiple simultaneous connections, these messages will
  // need to be routed to a specific matching transport. (This logic isn't
  // implemented here, for simplicity.)
  await transport.handlePostMessage(req, res);
});

app.listen(3001);
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

//Import functions from tools folder
import {calculator} from "./tools/calculator.js"
import {weather} from "./tools/weather.js"
import {bitcoin, gold} from "./tools/assets.js"

//Basic config
const name = "demo-tools-stdio"
const version = "0.0.1"

const config = {
  name: name,
  version: version,
  capabilities: {
    logging: {},
  },
}

// Create an MCP server for Stdio
const server = new McpServer(config);


// Add any tool and its paramters / function by calling add_tool
await add_tool("calculator",
         "Perform basic calculations. Add, subtract, multiply, divide. Invoke this tool every time you need to perform a calculation.",
         {operation: z.enum(["add", "subtract", "multiply", "divide"]), a: z.string(), b: z.string()},
         calculator)

await add_tool("get_weather",
         "Fetch the current weather for a specific location. Invoke this tool every time you need to give information on the weather.",
        {location: z.string()},
         weather)

await add_tool("get_gold_price",
         "Get the current price of Gold. Invoke this every time the user asks for the price of Gold",
        {name: z.string()},
         gold)

await add_tool("get_bitcoin_price",
         "Get the current price of Bitcoin. Invoke this every time the user asks for the price of Bitcoin",
        {name: z.string()},
         bitcoin)

async function add_tool(name, description, schema, func){
// Add tool will add the tool to both, local and remote access systems
    server.tool(name, description, schema,
        async (args) => {
            return await func(args)
        });
}

//Connection

// Connect stdio
const transport = new StdioServerTransport();
await server.connect(transport);

//SSE
/*const app = express();

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  // Note: to support multiple simultaneous connections, these messages will
  // need to be routed to a specific matching transport. (This logic isn't
  // implemented here, for simplicity.)
  await transport.handlePostMessage(req, res);
});

app.listen(3001);*/
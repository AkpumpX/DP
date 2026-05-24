import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import { z } from "zod";

const CDP_URL = "http://localhost:9222/json";

async function getTradingViewTab() {
  const response = await fetch(CDP_URL);
  const tabs = await response.json();

  const tradingviewTab = tabs.find(
    (tab: any) =>
      tab.url?.includes("tradingview.com") ||
      tab.title?.includes("TradingView")
  );

  if (!tradingviewTab) {
    throw new Error("TradingView tab not found");
  }

  return tradingviewTab.webSocketDebuggerUrl;
}

async function evaluate(expression: string) {
  const wsUrl = await getTradingViewTab();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    const id = 1;

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: {
            expression,
            returnByValue: true,
            awaitPromise: true
          }
        })
      );
    });

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      if (message.id === id) {
        ws.close();

        if (message.error) {
          reject(message.error);
        } else {
          resolve(message.result.result.value);
        }
      }
    });

    ws.on("error", reject);
  });
}

const server = new McpServer({
  name: "tradingview-mcp",
  version: "1.0.0"
});

server.tool(
  "read_chart",
  "Read TradingView chart data",
  {
    symbol: z.string().optional()
  },
  async () => {
    const data = await evaluate(`
      (() => {
        return {
          title: document.title,
          url: location.href,
          text: document.body.innerText.slice(0, 4000)
        };
      })()
    `);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

server.tool(
  "read_indicators",
  "Read visible TradingView indicators",
  {},
  async () => {
    const data = await evaluate(`
      (() => {
        const text = document.body.innerText;

        const matches = text
          .split("\\n")
          .filter(line =>
            /RSI|MACD|EMA|VWAP|Volume|Open|High|Low|Close/i.test(line)
          );

        return {
          indicators: matches.slice(0, 100)
        };
      })()
    `);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();

await server.connect(transport);

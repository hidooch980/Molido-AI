#!/usr/bin/env node
/**
 * سرور MCP مولیدو.
 *
 * دستیار هوشمند را مستقیم به دادهٔ فروشگاه وصل می‌کند: «امروز چقدر
 * فروختیم؟»، «چه چیزی رو به اتمام است؟»، «این کالا را از کدام بنکدار
 * ارزان‌تر خریده‌ایم؟».
 *
 * روی stdio کار می‌کند، پس هیچ پورتی باز نمی‌شود و از بیرون در دسترس
 * نیست — همان چیزی که برای دسترسی به دادهٔ مالی درست است.
 *
 * راه‌اندازی: mcp/README.md
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { MolidoClient } from './molido.mjs';
import { TOOLS, buildRequest } from './tools.mjs';

const client = new MolidoClient();

const server = new Server(
  { name: 'molido', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    // همه‌شان فقط می‌خوانند.  گفتنش صریح، به کلاینت اجازه می‌دهد
    // بدون پرسیدنِ هر بار اجرا کند.
    annotations: { readOnlyHint: true, openWorldHint: false },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    const result = await client.request(buildRequest(name, args));

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    // خطا به‌جای پرتاب، به‌صورت نتیجه برمی‌گردد تا مدل بتواند
    // توضیحش را به کاربر بگوید — پرتاب فقط «tool failed» می‌دهد.
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `خطا در ${name}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout برای پروتکل است؛ هر چاپی آنجا، پیام JSON-RPC را خراب می‌کند.
console.error('سرور MCP مولیدو آماده است');

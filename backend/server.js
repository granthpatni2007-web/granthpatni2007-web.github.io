const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let DatabaseSync;

try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (error) {
  console.error("This backend requires Node.js 22.5 or newer with node:sqlite enabled.");
  console.error(error.message);
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
const ownerDashboardToken = String(process.env.OWNER_DASHBOARD_TOKEN || "").trim();

if (!ownerDashboardToken) {
  console.error("Set OWNER_DASHBOARD_TOKEN before starting the backend.");
  process.exit(1);
}

const dataDirectory = path.join(__dirname, "data");
const databasePath = path.join(dataDirectory, "orders.sqlite");

fs.mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    placed_at TEXT NOT NULL,
    delivery_date TEXT,
    payment_method TEXT,
    total REAL NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders (updated_at DESC);
`);

const upsertOrderStatement = database.prepare(`
  INSERT INTO orders (
    id,
    status,
    customer_name,
    customer_phone,
    placed_at,
    delivery_date,
    payment_method,
    total,
    payload_json,
    created_at,
    updated_at
  )
  VALUES (
    @id,
    @status,
    @customer_name,
    @customer_phone,
    @placed_at,
    @delivery_date,
    @payment_method,
    @total,
    @payload_json,
    @created_at,
    @updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    customer_name = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    placed_at = excluded.placed_at,
    delivery_date = excluded.delivery_date,
    payment_method = excluded.payment_method,
    total = excluded.total,
    payload_json = excluded.payload_json,
    updated_at = excluded.updated_at
`);

const selectAllOrdersStatement = database.prepare(`
  SELECT payload_json
  FROM orders
  ORDER BY updated_at DESC
`);

const deleteAllOrdersStatement = database.prepare("DELETE FROM orders");

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const price = normalizeNumber(item.price);
  const quantity = normalizeNumber(item.quantity);
  const lineTotal = normalizeNumber(item.lineTotal, price * quantity);

  return {
    ...item,
    id: normalizeText(item.id),
    name: normalizeText(item.name) || "Item",
    unit: normalizeText(item.unit) || "kg",
    price,
    quantity,
    lineTotal
  };
}

function normalizeCustomer(customer) {
  const value = customer && typeof customer === "object" && !Array.isArray(customer) ? customer : {};

  return {
    ...value,
    name: normalizeText(value.name),
    phone: normalizeText(value.phone)
  };
}

function normalizeAddress(address) {
  const value = address && typeof address === "object" && !Array.isArray(address) ? address : {};

  return {
    ...value,
    street: normalizeText(value.street),
    city: normalizeText(value.city),
    postalCode: normalizeText(value.postalCode),
    deliveryDate: normalizeText(value.deliveryDate),
    instructions: normalizeText(value.instructions)
  };
}

function normalizeOrder(order) {
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return null;
  }

  const items = Array.isArray(order.items) ? order.items.map(normalizeItem).filter(Boolean) : [];
  const subtotalFromItems = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const subtotal = normalizeNumber(order.subtotal, subtotalFromItems);
  const shipping = normalizeNumber(order.shipping, 0);
  const total = normalizeNumber(order.total, subtotal + shipping);

  return {
    ...order,
    id: normalizeText(order.id) || `ORD-${Date.now()}`,
    status: normalizeText(order.status) || "new",
    source: normalizeText(order.source) || "Website checkout",
    placedAt: normalizeText(order.placedAt) || new Date().toISOString(),
    paymentMethod: normalizeText(order.paymentMethod) || "cod",
    paymentLabel: normalizeText(order.paymentLabel) || "Cash on Delivery",
    paymentStatus: normalizeText(order.paymentStatus) || "pending",
    paymentReference: normalizeText(order.paymentReference),
    paymentPaidAt: normalizeText(order.paymentPaidAt),
    customer: normalizeCustomer(order.customer),
    address: normalizeAddress(order.address),
    items,
    subtotal,
    shipping,
    total
  };
}

function normalizeOrderCollection(orders) {
  if (!Array.isArray(orders)) {
    return [];
  }

  return orders.map(normalizeOrder).filter(Boolean);
}

function mapOrderToRow(order) {
  const timestamp = new Date().toISOString();

  return {
    id: order.id,
    status: order.status,
    customer_name: order.customer?.name || "",
    customer_phone: order.customer?.phone || "",
    placed_at: order.placedAt,
    delivery_date: order.address?.deliveryDate || "",
    payment_method: order.paymentMethod,
    total: Number(order.total || 0),
    payload_json: JSON.stringify(order),
    created_at: timestamp,
    updated_at: timestamp
  };
}

function listOrders() {
  return selectAllOrdersStatement
    .all()
    .map((row) => {
      try {
        return normalizeOrder(JSON.parse(row.payload_json));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function saveOrder(order) {
  const normalizedOrder = normalizeOrder(order);
  const row = mapOrderToRow(normalizedOrder);
  upsertOrderStatement.run(row);
  return normalizedOrder;
}

function replaceOrders(orders) {
  const normalizedOrders = normalizeOrderCollection(orders);

  database.exec("BEGIN");

  try {
    deleteAllOrdersStatement.run();
    normalizedOrders.forEach((order) => {
      upsertOrderStatement.run(mapOrderToRow(order));
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return listOrders();
}

function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Owner-Token"
  };
}

function sendJson(response, statusCode, payload, origin) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...getCorsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function sendEmpty(response, statusCode, origin) {
  response.writeHead(statusCode, getCorsHeaders(origin));
  response.end();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8").trim();

      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function isAuthorized(request) {
  return String(request.headers["x-owner-token"] || "").trim() === ownerDashboardToken;
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const route = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204, origin);
    return;
  }

  try {
    if (request.method === "GET" && route === "/api/health") {
      sendJson(
        response,
        200,
        {
          ok: true,
          database: "sqlite",
          timestamp: new Date().toISOString()
        },
        origin
      );
      return;
    }

    if (request.method === "POST" && route === "/api/orders") {
      const body = await readJsonBody(request);
      const savedOrder = saveOrder(body.order || body);
      sendJson(response, 201, { order: savedOrder }, origin);
      return;
    }

    if (request.method === "GET" && route === "/api/orders") {
      if (!isAuthorized(request)) {
        sendJson(response, 401, { error: "Owner token required." }, origin);
        return;
      }

      sendJson(response, 200, { orders: listOrders() }, origin);
      return;
    }

    if (request.method === "PUT" && route === "/api/orders") {
      if (!isAuthorized(request)) {
        sendJson(response, 401, { error: "Owner token required." }, origin);
        return;
      }

      const body = await readJsonBody(request);
      const orders = Array.isArray(body) ? body : body.orders;
      sendJson(response, 200, { orders: replaceOrders(orders) }, origin);
      return;
    }

    sendJson(response, 404, { error: "Route not found." }, origin);
  } catch (error) {
    console.error(error);
    sendJson(
      response,
      500,
      {
        error: "Server error while processing orders."
      },
      origin
    );
  }
});

server.listen(port, () => {
  console.log(`Antarmana order API listening on http://localhost:${port}/api`);
});

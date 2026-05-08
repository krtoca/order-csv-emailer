function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function getBarcode({ item }) {
  return (
    item.barcode ||
    item.variant_barcode ||
    item.variant?.barcode ||
    item.admin_graphql_api_id?.barcode ||
    ""
  );
}

const COLUMN_DEFINITIONS = {
  orderName: {
    label: "Order Name",
    getValue: ({ order }) => order.name || order.order_number || order.id || "",
  },
  customerEmail: {
    label: "Customer Email",
    getValue: ({ order }) =>
      order.email || order.customer?.email || order.contact_email || "",
  },
  sku: {
    label: "SKU",
    getValue: ({ item }) => item.sku || "",
  },
  barcode: {
    label: "Barcode",
    getValue: ({ item }) => getBarcode({ item }),
  },
  productTitle: {
    label: "Product Title",
    getValue: ({ item }) => item.title || "",
  },
  variantTitle: {
    label: "Variant Title",
    getValue: ({ item }) => item.variant_title || "",
  },
  quantity: {
    label: "Quantity",
    getValue: ({ item }) => item.quantity || 0,
  },
  price: {
    label: "Price",
    getValue: ({ item }) => item.price || "",
  },
  vendor: {
    label: "Vendor",
    getValue: ({ item }) => item.vendor || "",
  },
};

const DEFAULT_COLUMN_KEYS = [
  "orderName",
  "customerEmail",
  "sku",
  "barcode",
  "productTitle",
  "variantTitle",
  "quantity",
  "price",
  "vendor",
];

export function getAvailableCsvColumns() {
  return Object.entries(COLUMN_DEFINITIONS).map(([key, value]) => ({
    key,
    label: value.label,
  }));
}

export function buildOrderLineItemsCsv(order, selectedColumnKeys) {
  const columnKeys =
    Array.isArray(selectedColumnKeys) && selectedColumnKeys.length > 0
      ? selectedColumnKeys.filter((key) => COLUMN_DEFINITIONS[key])
      : DEFAULT_COLUMN_KEYS;

  const headers = columnKeys.map((key) => COLUMN_DEFINITIONS[key].label);

  const rows = (order.line_items || []).map((item) =>
    columnKeys.map((key) =>
      COLUMN_DEFINITIONS[key].getValue({
        order,
        item,
      })
    )
  );

  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}
import { useState } from "react";
import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";

import {
  Page,
  Card,
  BlockStack,
  Text,
  TextField,
  Checkbox,
  Button,
  Banner,
  InlineStack,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

const DEFAULT_CSV_COLUMNS =
  "orderName,customerEmail,sku,barcode,productTitle,variantTitle,quantity,price,vendor";

const AVAILABLE_CSV_COLUMNS = [
  { key: "orderName", label: "Order Name" },
  { key: "customerEmail", label: "Customer Email" },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "productTitle", label: "Product Title" },
  { key: "variantTitle", label: "Variant Title" },
  { key: "quantity", label: "Quantity" },
  { key: "price", label: "Price" },
  { key: "vendor", label: "Vendor" },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { getOrderCsvEmailSetting } = await import(
    "../lib/order-csv-settings.server"
  );

  const setting = await getOrderCsvEmailSetting(session.shop);

  return data({
    setting,
    availableColumns: AVAILABLE_CSV_COLUMNS,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { getOrderCsvEmailSetting, updateOrderCsvEmailSetting } = await import(
    "../lib/order-csv-settings.server"
  );

  const { sendOrderCsvEmail } = await import("../lib/email.server");

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  if (intent === "send_test") {
    const testEmail = String(formData.get("testEmail") || "").trim();

    if (!testEmail) {
      return data({
        success: false,
        error: "Please enter a test email address.",
      });
    }

    const setting = await getOrderCsvEmailSetting(session.shop);

    await sendOrderCsvEmail({
      to: testEmail,
      bcc: setting.bccEmail,
      fromEmail: setting.fromEmail,
      orderName: "#TEST1001",
      csvContent:
        "Order Name,Customer Email,SKU,Barcode,Product Title,Variant Title,Quantity,Price,Vendor\n#TEST1001,test@example.com,ABC-123,123456789012,Product A,Red / Large,2,9.99,ONE",
      emailSubject: setting.emailSubject,
      emailBody: setting.emailBody,
    });

    return data({ success: true, testSent: true });
  }

  const selectedColumns = formData
    .getAll("csvColumns")
    .map((value) => String(value))
    .filter(Boolean);

  await updateOrderCsvEmailSetting(session.shop, {
    enabled: formData.get("enabled") === "on",
    fromEmail: String(formData.get("fromEmail") || ""),
    bccEmail: String(formData.get("bccEmail") || ""),
    emailSubject: String(formData.get("emailSubject") || ""),
    emailBody: String(formData.get("emailBody") || ""),
    onlySendForOrderTag: String(formData.get("onlySendForOrderTag") || ""),
    onlySendForCustomerTag: String(
      formData.get("onlySendForCustomerTag") || ""
    ),
    csvColumns:
      selectedColumns.length > 0
        ? selectedColumns.join(",")
        : DEFAULT_CSV_COLUMNS,
  });

  return data({ success: true });
};

export default function SettingsPage() {
  const { setting, availableColumns } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";

  const [enabled, setEnabled] = useState(Boolean(setting.enabled));
  const [fromEmail, setFromEmail] = useState(setting.fromEmail || "");
  const [bccEmail, setBccEmail] = useState(setting.bccEmail || "");
  const [emailSubject, setEmailSubject] = useState(setting.emailSubject || "");
  const [emailBody, setEmailBody] = useState(setting.emailBody || "");
  const [onlySendForOrderTag, setOnlySendForOrderTag] = useState(
    setting.onlySendForOrderTag || ""
  );
  const [onlySendForCustomerTag, setOnlySendForCustomerTag] = useState(
    setting.onlySendForCustomerTag || ""
  );
  const [testEmail, setTestEmail] = useState("");

  const [csvColumns, setCsvColumns] = useState(
    String(setting.csvColumns || DEFAULT_CSV_COLUMNS)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  function toggleCsvColumn(columnKey, checked) {
    setCsvColumns((current) => {
      if (checked) {
        return current.includes(columnKey) ? current : [...current, columnKey];
      }

      return current.filter((key) => key !== columnKey);
    });
  }

  return (
    <Page
      title="Order CSV Email Settings"
      subtitle="Automatically send order line item CSV files to customers."
    >
      <BlockStack gap="400">
        {actionData?.success ? (
          <Banner tone="success">
            <p>
              {actionData?.testSent
                ? "Test email sent successfully."
                : "Settings saved successfully."}
            </p>
          </Banner>
        ) : null}

        {actionData?.error ? (
          <Banner tone="critical">
            <p>{actionData.error}</p>
          </Banner>
        ) : null}

        <Card>
          <Form method="post">
            <BlockStack gap="400">
              <input type="hidden" name="intent" value="save" />

              <Checkbox
                label="Enable automatic CSV email"
                name="enabled"
                checked={enabled}
                onChange={setEnabled}
                helpText="When enabled, customers will receive a CSV file when a new order is created."
              />

              <TextField
                label="From email"
                name="fromEmail"
                value={fromEmail}
                onChange={setFromEmail}
                placeholder="Orders <orders@yourdomain.com>"
                helpText="Leave empty to use ORDER_CSV_FROM_EMAIL from your environment variables."
                autoComplete="off"
              />

              <TextField
                label="BCC email"
                name="bccEmail"
                value={bccEmail}
                onChange={setBccEmail}
                placeholder="admin@yourdomain.com"
                helpText="Optional. A copy of every CSV email will be sent to this address."
                autoComplete="off"
              />

              <TextField
                label="Email subject"
                name="emailSubject"
                value={emailSubject}
                onChange={setEmailSubject}
                helpText="You can use {{orderName}}."
                autoComplete="off"
              />

              <TextField
                label="Email body"
                name="emailBody"
                value={emailBody}
                onChange={setEmailBody}
                multiline={5}
                helpText="You can use {{orderName}}."
                autoComplete="off"
              />

              <TextField
                label="Only send for order tag"
                name="onlySendForOrderTag"
                value={onlySendForOrderTag}
                onChange={setOnlySendForOrderTag}
                placeholder="SEND_CSV"
                helpText="Optional. If filled, CSV email will only be sent when the Shopify order has this tag."
                autoComplete="off"
              />

              <TextField
                label="Only send for customer tag"
                name="onlySendForCustomerTag"
                value={onlySendForCustomerTag}
                onChange={setOnlySendForCustomerTag}
                placeholder="WHOLESALE"
                helpText="Optional. If filled, CSV email will only be sent when the customer has this tag."
                autoComplete="off"
              />

              <Divider />

              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  CSV columns
                </Text>

                <Text as="p" tone="subdued">
                  Select which fields should be included in the attached CSV file.
                </Text>

                <BlockStack gap="200">
                  {availableColumns.map((column) => (
                    <Checkbox
                      key={column.key}
                      label={column.label}
                      name="csvColumns"
                      value={column.key}
                      checked={csvColumns.includes(column.key)}
                      onChange={(checked) =>
                        toggleCsvColumn(column.key, checked)
                      }
                    />
                  ))}
                </BlockStack>
              </BlockStack>

              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Available variables
                  </Text>

                  <Text as="p" tone="subdued">
                    {"{{orderName}}"} = Shopify order number, for example #1001
                  </Text>
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button submit variant="primary" loading={isSaving}>
                  Save settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Card>

        <Card>
          <Form method="post">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Send test email
              </Text>

              <Text as="p" tone="subdued">
                Send a sample CSV email to confirm your email settings.
              </Text>

              <TextField
                label="Test email"
                name="testEmail"
                value={testEmail}
                onChange={setTestEmail}
                placeholder="admin@yourdomain.com"
                autoComplete="email"
              />

              <input type="hidden" name="intent" value="send_test" />

              <InlineStack align="end">
                <Button submit>Send test email</Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
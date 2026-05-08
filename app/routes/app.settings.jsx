import {
  useLoaderData,
  useActionData,
  useNavigation,
  Form,
} from "react-router";

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
import {
  getOrderCsvEmailSetting,
  updateOrderCsvEmailSetting,
  DEFAULT_CSV_COLUMNS,
} from "../lib/order-csv-settings.server";
import { getAvailableCsvColumns } from "../lib/order-line-csv.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const setting = await getOrderCsvEmailSetting(session.shop);
  const availableColumns = getAvailableCsvColumns();

  return {
    setting,
    availableColumns,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

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
    csvColumns:
      selectedColumns.length > 0
        ? selectedColumns.join(",")
        : DEFAULT_CSV_COLUMNS,
  });

  return { success: true };
};

export default function SettingsPage() {
  const { setting, availableColumns } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";

  const selectedColumns = String(
    setting.csvColumns || DEFAULT_CSV_COLUMNS
  ).split(",");

  return (
    <Page
      title="Order CSV Email Settings"
      subtitle="Automatically send order line item CSV files to customers."
    >
      <BlockStack gap="400">
        {actionData?.success ? (
          <Banner tone="success">
            <p>Settings saved successfully.</p>
          </Banner>
        ) : null}

        <Card>
          <Form method="post">
            <BlockStack gap="400">
              <Checkbox
                label="Enable automatic CSV email"
                name="enabled"
                defaultChecked={setting.enabled}
                helpText="When enabled, customers will receive a CSV file when a new order is created."
              />

              <TextField
                label="From email"
                name="fromEmail"
                defaultValue={setting.fromEmail || ""}
                placeholder="Orders <orders@yourdomain.com>"
                helpText="Leave empty to use ORDER_CSV_FROM_EMAIL from your environment variables."
                autoComplete="off"
              />

              <TextField
                label="BCC email"
                name="bccEmail"
                defaultValue={setting.bccEmail || ""}
                placeholder="admin@yourdomain.com"
                helpText="Optional. A copy of every CSV email will be sent to this address."
                autoComplete="off"
              />

              <TextField
                label="Email subject"
                name="emailSubject"
                defaultValue={setting.emailSubject}
                helpText="You can use {{orderName}}."
                autoComplete="off"
              />

              <TextField
                label="Email body"
                name="emailBody"
                defaultValue={setting.emailBody}
                multiline={5}
                helpText="You can use {{orderName}}."
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
                      defaultChecked={selectedColumns.includes(column.key)}
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
      </BlockStack>
    </Page>
  );
}
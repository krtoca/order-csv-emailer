import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function safeFilename(value) {
  return String(value || "order")
    .replace(/#/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_");
}

function applyTemplate(template, data) {
  return String(template || "").replaceAll(
    "{{orderName}}",
    data.orderName || ""
  );
}

export async function sendOrderCsvEmail({
  to,
  bcc,
  fromEmail,
  orderName,
  csvContent,
  emailSubject,
  emailBody,
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Order CSV Email] RESEND_API_KEY is missing.");
    return { skipped: true, reason: "missing_api_key" };
  }

  if (!to) {
    console.warn("[Order CSV Email] Customer email is missing.");
    return { skipped: true, reason: "missing_customer_email" };
  }

  const from =
    fromEmail ||
    process.env.ORDER_CSV_FROM_EMAIL ||
    "Orders <onboarding@resend.dev>";

  const subject = applyTemplate(
    emailSubject || "Order {{orderName}} line items CSV",
    { orderName }
  );

  const bodyText = applyTemplate(
    emailBody ||
      "Thank you for your order. Your order line items CSV file is attached.",
    { orderName }
  );

  const filename = `${safeFilename(orderName)}-line-items.csv`;

  const result = await resend.emails.send({
    from,
    to: [to],
    bcc: bcc ? [bcc] : undefined,
    subject,
    html: `
      <p>${bodyText.replace(/\n/g, "<br />")}</p>
    `,
    attachments: [
      {
        filename,
        content: Buffer.from(csvContent, "utf8").toString("base64"),
      },
    ],
  });

  if (result.error) {
    console.error("[Order CSV Email] Resend error:", result.error);
    throw new Error(result.error.message || "Failed to send CSV email");
  }

  console.log("[Order CSV Email] Sent:", {
    to,
    bcc,
    orderName,
    filename,
  });

  return result.data;
}
import nodemailer from "nodemailer";

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

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "142.250.102.108",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    family: 4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[Order CSV Email] SMTP credentials missing.");
    return { skipped: true, reason: "missing_smtp_credentials" };
  }

  if (!to) {
    console.warn("[Order CSV Email] Customer email is missing.");
    return { skipped: true, reason: "missing_customer_email" };
  }

  const from =
    fromEmail ||
    process.env.ORDER_CSV_FROM_EMAIL ||
    process.env.SMTP_USER;

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

  const result = await getTransporter().sendMail({
    from,
    to,
    bcc: bcc || undefined,
    subject,
    html: `<p>${bodyText.replace(/\n/g, "<br />")}</p>`,
    attachments: [
      {
        filename,
        content: csvContent,
        contentType: "text/csv; charset=utf-8",
      },
    ],
  });

  console.log("[Order CSV Email] Gmail SMTP sent:", {
    to,
    bcc,
    orderName,
    filename,
    messageId: result.messageId,
  });

  return {
    success: true,
    messageId: result.messageId,
  };
}
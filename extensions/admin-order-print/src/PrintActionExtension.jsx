import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default async () => {
  render(<AdminOrderPrintAction />, document.body);
};

function getShopDomain() {
  const candidates = [
    shopify?.data?.shop?.myshopifyDomain,
    shopify?.data?.shop?.domain,
    shopify?.shop?.myshopifyDomain,
    shopify?.shop?.domain,
    shopify?.config?.shop,
    shopify?.config?.shopOrigin,
    shopify?.config?.shopDomain,
  ];

  return candidates.find((value) => typeof value === 'string' && value.includes('.myshopify.com')) || '';
}

function AdminOrderPrintAction() {
  const {i18n, data} = shopify;
  const shop = getShopDomain();
  const [src, setSrc] = useState(null);
  const [printInvoice, setPrintInvoice] = useState(true);
  const [printPackingSlip, setPrintPackingSlip] = useState(false);

  useEffect(() => {
    const orderId = data?.selected?.[0]?.id;
    const printTypes = [];

    if (printInvoice) printTypes.push('Invoice');
    if (printPackingSlip) printTypes.push('Packing Slip');

    if (!orderId || printTypes.length === 0) {
      setSrc(null);
      return;
    }

    const params = new URLSearchParams({
      orderId,
      shop,
      printType: printTypes.join(','),
      // Use HTML for the Admin print preview. PDF download is still supported by /print?format=pdf.
      format: 'html',
      t: String(Date.now()),
    });

    setSrc(`/print?${params.toString()}`);
  }, [data?.selected, printInvoice, printPackingSlip]);

  const invoiceLabel = i18n?.translate?.('invoice') || 'Invoice';
  const packingSlipLabel = i18n?.translate?.('packingSlip') || 'Packing List';
  const documentsLabel = i18n?.translate?.('documents') || 'Select document(s) to print';

  return (
    <s-admin-print-action src={src}>
      <s-stack direction="block" gap="base">
        <s-text type="strong">{documentsLabel}</s-text>

        <s-checkbox
          name="Invoice"
          checked={printInvoice}
          label={invoiceLabel}
          onChange={(value) => setPrintInvoice(Boolean(value))}
        ></s-checkbox>

        <s-checkbox
          name="Packing Slips"
          checked={printPackingSlip}
          label={packingSlipLabel}
          onChange={(value) => setPrintPackingSlip(Boolean(value))}
        ></s-checkbox>

        {!src ? (
          <s-text tone="critical">Select at least one document type.</s-text>
        ) : null}
      </s-stack>
    </s-admin-print-action>
  );
}

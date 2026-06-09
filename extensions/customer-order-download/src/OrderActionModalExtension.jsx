import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useMemo, useState } from 'preact/hooks';

// Replace this with your deployed app URL. Shopify CLI can also update it during development.
const APP_URL = 'https://one-order-printer.onrender.com';

export default async () => {
  render(<OrderActionModalExtension />, document.body);
};

function getOrderId() {
  return shopify?.extension?.target?.current?.orderId || shopify?.orderId || '';
}

async function getSessionToken() {
  if (shopify?.sessionToken?.get) return shopify.sessionToken.get();
  if (shopify?.idToken?.get) return shopify.idToken.get();
  return '';
}

function OrderActionModalExtension() {
  const orderId = useMemo(() => getOrderId(), []);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function openPdf() {
    setIsLoading(true);
    setMessage('');
    try {
      const token = await getSessionToken();
      const params = new URLSearchParams({
        orderId,
        type: 'invoice',
        download: '1',
      });
      const response = await fetch(`${APP_URL}/customer/pdf?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Unable to generate invoice PDF.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      shopify.open(url);
      setMessage('Invoice PDF opened. Use your browser print/download option if needed.');
    } catch (error) {
      setMessage(error?.message || 'Unable to generate invoice PDF.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <s-customer-account-action heading="Download invoice PDF">
      <s-stack gap="base">
        <s-text>Download or print the invoice for this order.</s-text>
        <s-text tone="subdued">Packing lists are only available to the store admin.</s-text>
        {message ? <s-text>{message}</s-text> : null}
      </s-stack>
      <s-button slot="primary-action" loading={isLoading} onClick={openPdf}>
        Download Invoice PDF
      </s-button>
      <s-button slot="secondary-actions" onClick={() => shopify.close()}>
        Close
      </s-button>
    </s-customer-account-action>
  );
}

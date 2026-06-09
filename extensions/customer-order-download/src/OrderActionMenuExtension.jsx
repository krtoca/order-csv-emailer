import '@shopify/ui-extensions/preact';
import { render } from 'preact';

export default async () => {
  render(<OrderActionMenuExtension />, document.body);
};

function OrderActionMenuExtension() {
  return <s-button>Download Invoice PDF</s-button>;
}

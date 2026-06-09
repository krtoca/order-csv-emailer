# V28 Polaris console warning review

This version adds an explicit label and aria-label to the logo file upload field.

The remaining console messages below are Shopify Admin / Polaris internal accessibility warnings and do not block the app:

- icon-only button with icon="filter" must also have an accessibilityLabel
- accessibilityLabel is recommended when scroll-box is provided
- deprecated parameters for the initialization function

The app does not render an icon-only filter button, so that warning is coming from the Shopify Admin shell, not from the app source.

If the print preview still fails, check the visible preview message or Render logs; do not treat these Polaris warnings as the root cause.

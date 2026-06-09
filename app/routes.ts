import {type RouteConfig, index, route} from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/*", "routes/auth.$.tsx"),
  route("app", "routes/app._index.tsx"),
  route("app/templates", "routes/app.templates.tsx"),
  route("app/reauthorize", "routes/app.reauthorize.tsx"),
  route("app/diagnostics", "routes/app.diagnostics.tsx"),
  route("print", "routes/print.tsx"),
  route("saved-pdfs/:id", "routes/saved-pdfs.$id.tsx"),
  route("customer/pdf", "routes/customer.pdf.tsx"),
] satisfies RouteConfig;

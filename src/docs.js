const path = require("path");
const express = require("express");

const router = express.Router();

// Sirve la especificación OpenAPI en JSON/YAML bruto
router.get("/openapi.yaml", (req, res) => {
  const filePath = path.join(__dirname, "..", "openapi", "openapi.yaml");
  res.sendFile(filePath);
});

// Página mínima que integra Swagger UI desde CDN
router.get("/", (req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Restaurant Platform API Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/docs/openapi.yaml",
          dom_id: "#swagger-ui",
          presets: [SwaggerUIBundle.presets.apis],
        });
      };
    </script>
  </body>
</html>`);
});

module.exports = router;


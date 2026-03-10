# 14. BI, MongoDB Charts y Dashboards

## 14.1 Estrategia de BI

MongoDB Charts conectado directamente al cluster Atlas. Usa las colecciones OLAP (pre-computadas) para evitar carga en OLTP.

| Fuente de datos | Chart | Tipo |
|-----------------|-------|------|
| `restaurant_stats` | Top 10 restaurantes por rating | Bar chart horizontal |
| `daily_revenue` | Tendencia de revenue 30 días | Line chart |
| `order_events` | Distribución de estados | Donut chart |
| `restaurant_stats` | Distribución de ratings | Stacked bar |
| `restaurants` | Mapa de restaurantes | Geospatial chart |

---

## 14.2 Charts a Implementar (3+ gráficas, 2 pts c/u)

### Chart 1: Top 10 Restaurantes por Rating

- **Fuente:** `restaurant_stats`
- **Tipo:** Bar chart horizontal
- **Eje X:** `avgRating`
- **Eje Y:** `restaurantName`
- **Filtro:** `totalReviews >= 5`
- **Ordenamiento:** `avgRating` descendente
- **Valor de negocio:** Identifica los restaurantes mejor valorados para featured placement

### Chart 2: Tendencia de Revenue por Restaurante (30 días)

- **Fuente:** `daily_revenue`
- **Tipo:** Line chart
- **Eje X:** `date`
- **Eje Y:** `revenue`
- **Filtro:** `date >= (hoy - 30 días)`
- **Group by:** `restaurantId`
- **Valor de negocio:** Monitoreo de performance financiero, detección de tendencias

### Chart 3: Distribución de Calificaciones (1-5 estrellas)

- **Fuente:** `restaurant_stats`
- **Tipo:** Stacked bar chart
- **Datos:** `ratingDistribution.1` a `ratingDistribution.5`
- **Valor de negocio:** Análisis de satisfacción del cliente, comparación entre restaurantes

---

## 14.3 Embedding Charts en Frontend

MongoDB Charts permite embeber gráficas en aplicaciones web:

```html
<iframe
  style="background: #FFFFFF; border: none; border-radius: 2px; box-shadow: 0 2px 10px 0 rgba(70, 76, 79, .2);"
  width="640" height="480"
  src="https://charts.mongodb.com/charts-project-xxxxx/embed/charts?id=CHART_ID&maxDataAge=300&theme=light&autoRefresh=true">
</iframe>
```

O via MongoDB Charts SDK:

```javascript
import ChartsEmbedSDK from "@mongodb-js/charts-embed-dom";

const sdk = new ChartsEmbedSDK({ baseUrl: "https://charts.mongodb.com/charts-project-xxxxx" });
const chart = sdk.createChart({ chartId: "CHART_ID", height: 400, theme: "light", autoRefresh: true, maxDataAge: 300 });
chart.render(document.getElementById("chart-container"));
```

---

## 14.4 Configuración en Atlas

1. Habilitar MongoDB Charts en el proyecto Atlas
2. Crear Data Source apuntando al cluster
3. Crear Dashboard con las 3+ gráficas
4. Configurar auto-refresh (5 min)
5. Obtener embed URLs o chart IDs para frontend
